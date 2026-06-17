import { Router, type Request, type Response, type NextFunction } from "express";
import express from "express";
import { vnpayAdapter } from "../services/payment/vnpay.adapter";
import { momoAdapter } from "../services/payment/momo.adapter";
import { sepayAdapter } from "../services/payment/sepay.adapter";
import {
	webhookLogRepository,
	type WebhookSource,
} from "../models/webhook-log.model";
import { paymentTransactionRepository } from "../models/payment-transaction.model";
import { auditService } from "../services/audit.service";
import { billingService } from "../services/billing.service";

// ── Types ───────────────────────────────────────────────────────────────

interface VNPayIpnBody {
	vnp_TmnCode?: string;
	vnp_TxnRef?: string;
	vnp_TransactionNo?: string;
	vnp_ResponseCode?: string;
	vnp_SecureHash?: string;
	[key: string]: string | undefined;
}

interface MoMoIpnBody {
	partnerCode?: string;
	orderId?: string;
	transId?: string | number;
	resultCode?: number;
	signature?: string;
	[key: string]: unknown;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Activate subscription after successful payment via billingService.
 */
async function activateAfterPayment(transactionId: string): Promise<void> {
	await billingService.activateAfterPayment(transactionId);
}

function getClientIp(req: Request): string | null {
	const forwarded = req.headers["x-forwarded-for"];
	if (typeof forwarded === "string") {
		return forwarded.split(",")[0]?.trim() ?? null;
	}
	return req.socket?.remoteAddress ?? null;
}

function extractHeaders(req: Request): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const [key, value] of Object.entries(req.headers)) {
		if (typeof value === "string") {
			headers[key] = value;
		} else if (Array.isArray(value)) {
			headers[key] = value.join(", ");
		}
	}
	return headers;
}

// ── Router ──────────────────────────────────────────────────────────────

const router = Router();

// Use express.raw() for webhook routes to preserve raw body for HMAC verification
router.use(express.raw({ type: "*/*" }));

// ── POST /api/webhooks/vnpay ────────────────────────────────────────────

router.post(
	"/vnpay",
	async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
		const receivedAt = new Date();
		const ip = getClientIp(req);
		const rawHeaders = extractHeaders(req);
		let rawBody = "";
		let parsedBody: VNPayIpnBody = {};

		try {
			// Parse raw body — VNPAY sends URL-encoded or JSON
			if (Buffer.isBuffer(req.body)) {
				rawBody = req.body.toString("utf-8");
			} else if (typeof req.body === "string") {
				rawBody = req.body;
			} else {
				rawBody = JSON.stringify(req.body);
			}

			// Try to parse as URL-encoded query string (VNPAY typically sends this)
			try {
				const params = new URLSearchParams(rawBody);
				const obj: Record<string, string> = {};
				for (const [key, value] of params.entries()) {
					obj[key] = value;
				}
				// Only use parsed params if it looks like VNPAY data
				if (obj.vnp_TmnCode || obj.vnp_TxnRef) {
					parsedBody = obj;
				} else {
					// Try JSON parse
					parsedBody = JSON.parse(rawBody);
				}
			} catch {
				// Try JSON parse as fallback
				try {
					parsedBody = JSON.parse(rawBody);
				} catch {
					// If neither works, use empty object — will fail signature check
					parsedBody = {};
				}
			}

			// ── Persist WebhookLog (always, even for invalid signatures) ────
			const verifyResult = vnpayAdapter.verifyIpn(
				parsedBody as Record<string, string>,
			);

			const webhookLog = await webhookLogRepository.create({
				source: "vnpay" as WebhookSource,
				event_type: "ipn",
				raw_body: rawBody,
				raw_headers: rawHeaders,
				signature_valid: verifyResult.valid,
				signature_reason: verifyResult.reason,
				ip,
				received_at: receivedAt,
				processed_at: null,
				transaction_id: null,
			});

			// ── Invalid signature → respond RspCode:"97" ────────────────────
			if (!verifyResult.valid) {
				await auditService.record({
					action: "webhook.vnpay.signature_invalid",
					resourceType: "webhook_log",
					resourceId: webhookLog._id.toString(),
					result: "failure",
					metadata: { reason: verifyResult.reason },
				});

				res.status(200).json({ RspCode: "97", Message: "Invalid Checksum" });
				return;
			}

			// ── Find transaction by intent_id (vnp_TxnRef) ──────────────────
			const intentId = parsedBody.vnp_TxnRef;
			if (!intentId) {
				await webhookLogRepository.markProcessed(webhookLog._id.toString());
				res.status(200).json({ RspCode: "01", Message: "Order not found" });
				return;
			}

			const transaction =
				await paymentTransactionRepository.findByIntentId(intentId);

			if (!transaction) {
				await webhookLogRepository.markProcessed(webhookLog._id.toString());
				res.status(200).json({ RspCode: "01", Message: "Order not found" });
				return;
			}

			// ── Replay safety: already succeeded → return "00" ──────────────
			if (transaction.status === "succeeded") {
				await webhookLogRepository.markProcessed(
					webhookLog._id.toString(),
					transaction._id.toString(),
				);
				res.status(200).json({ RspCode: "00", Message: "Confirm Success" });
				return;
			}

			// ── Map response code and update transaction ─────────────────────
			const responseCode = parsedBody.vnp_ResponseCode ?? "";
			const mappedStatus = vnpayAdapter.mapResponseCode(responseCode);
			const gatewayTxnId = parsedBody.vnp_TransactionNo ?? "";

			if (mappedStatus.status === "succeeded") {
				await paymentTransactionRepository.markSucceeded(
					transaction._id.toString(),
					gatewayTxnId,
					parsedBody as Record<string, unknown>,
				);

				// Activate subscription/billing
				await activateAfterPayment(transaction._id.toString());

				await auditService.record({
					action: "payment.webhook.succeeded",
					resourceType: "payment_transaction",
					resourceId: transaction._id.toString(),
					result: "success",
					metadata: {
						intent_id: intentId,
						gateway: "vnpay",
						gateway_transaction_id: gatewayTxnId,
					},
				});
			} else if (mappedStatus.status === "failed") {
				await paymentTransactionRepository.markFailed(
					transaction._id.toString(),
				);

				await auditService.record({
					action: "payment.webhook.failed",
					resourceType: "payment_transaction",
					resourceId: transaction._id.toString(),
					result: "failure",
					metadata: {
						intent_id: intentId,
						gateway: "vnpay",
						response_code: responseCode,
						failure_code: mappedStatus.failure_code ?? null,
					},
				});
			}
			// "pending" status (code "75") — do nothing, wait for next IPN

			await webhookLogRepository.markProcessed(
				webhookLog._id.toString(),
				transaction._id.toString(),
			);

			res.status(200).json({ RspCode: "00", Message: "Confirm Success" });
		} catch (error) {
			// Catch-all: log error and return "99" so gateway retries
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			console.error("[webhook:vnpay] Unhandled error:", errorMessage);

			res.status(200).json({ RspCode: "99", Message: "Unknown error" });
		}
	},
);

// ── POST /api/webhooks/momo ─────────────────────────────────────────────

router.post(
	"/momo",
	async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
		const receivedAt = new Date();
		const ip = getClientIp(req);
		const rawHeaders = extractHeaders(req);
		let rawBody = "";
		let parsedBody: MoMoIpnBody = {};

		try {
			// Parse raw body — MOMO sends JSON
			if (Buffer.isBuffer(req.body)) {
				rawBody = req.body.toString("utf-8");
			} else if (typeof req.body === "string") {
				rawBody = req.body;
			} else {
				rawBody = JSON.stringify(req.body);
			}

			try {
				parsedBody = JSON.parse(rawBody);
			} catch {
				parsedBody = {};
			}

			// ── Persist WebhookLog (always, even for invalid signatures) ────
			const verifyResult = momoAdapter.verifyIpn(
				parsedBody as Record<string, unknown>,
			);

			const webhookLog = await webhookLogRepository.create({
				source: "momo" as WebhookSource,
				event_type: "ipn",
				raw_body: rawBody,
				raw_headers: rawHeaders,
				signature_valid: verifyResult.valid,
				signature_reason: verifyResult.reason,
				ip,
				received_at: receivedAt,
				processed_at: null,
				transaction_id: null,
			});

			// ── Invalid signature → respond resultCode:97 ───────────────────
			if (!verifyResult.valid) {
				await auditService.record({
					action: "webhook.momo.signature_invalid",
					resourceType: "webhook_log",
					resourceId: webhookLog._id.toString(),
					result: "failure",
					metadata: { reason: verifyResult.reason },
				});

				res.status(200).json({ resultCode: 97, message: "Invalid Signature" });
				return;
			}

			// ── Find transaction by orderId (intent_id) ─────────────────────
			const intentId = parsedBody.orderId as string | undefined;
			if (!intentId) {
				await webhookLogRepository.markProcessed(webhookLog._id.toString());
				res.status(200).json({ resultCode: 1, message: "Order not found" });
				return;
			}

			const transaction =
				await paymentTransactionRepository.findByIntentId(intentId);

			if (!transaction) {
				await webhookLogRepository.markProcessed(webhookLog._id.toString());
				res.status(200).json({ resultCode: 1, message: "Order not found" });
				return;
			}

			// ── Replay safety: already succeeded → return resultCode:0 ──────
			if (transaction.status === "succeeded") {
				await webhookLogRepository.markProcessed(
					webhookLog._id.toString(),
					transaction._id.toString(),
				);
				res.status(200).json({ resultCode: 0, message: "Confirm Success" });
				return;
			}

			// ── Map result code and update transaction ───────────────────────
			const resultCode =
				typeof parsedBody.resultCode === "number"
					? parsedBody.resultCode
					: Number(parsedBody.resultCode ?? -1);
			const mappedStatus = momoAdapter.mapResultCode(resultCode);
			const gatewayTxnId = String(parsedBody.transId ?? "");

			if (mappedStatus.status === "succeeded") {
				await paymentTransactionRepository.markSucceeded(
					transaction._id.toString(),
					gatewayTxnId,
					parsedBody as Record<string, unknown>,
				);

				// Activate subscription/billing
				await activateAfterPayment(transaction._id.toString());

				await auditService.record({
					action: "payment.webhook.succeeded",
					resourceType: "payment_transaction",
					resourceId: transaction._id.toString(),
					result: "success",
					metadata: {
						intent_id: intentId,
						gateway: "momo",
						gateway_transaction_id: gatewayTxnId,
					},
				});
			} else if (
				mappedStatus.status === "failed" ||
				mappedStatus.status === "expired"
			) {
				await paymentTransactionRepository.markFailed(
					transaction._id.toString(),
				);

				await auditService.record({
					action: "payment.webhook.failed",
					resourceType: "payment_transaction",
					resourceId: transaction._id.toString(),
					result: "failure",
					metadata: {
						intent_id: intentId,
						gateway: "momo",
						result_code: resultCode,
						failure_code: mappedStatus.failure_code ?? null,
					},
				});
			}

			await webhookLogRepository.markProcessed(
				webhookLog._id.toString(),
				transaction._id.toString(),
			);

			res.status(200).json({ resultCode: 0, message: "Confirm Success" });
		} catch (error) {
			// Catch-all: log error and return resultCode:99 so gateway retries
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			console.error("[webhook:momo] Unhandled error:", errorMessage);

			res.status(200).json({ resultCode: 99, message: "Unknown error" });
		}
	},
);

// ── POST /api/webhooks/sepay ─────────────────────────────────────────────

router.post(
	"/sepay",
	async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
		const receivedAt = new Date();
		const ip = getClientIp(req);
		const rawHeaders = extractHeaders(req);
		let rawBody = "";
		let parsedBody: Record<string, unknown> = {};

		try {
			if (Buffer.isBuffer(req.body)) {
				rawBody = req.body.toString("utf-8");
			} else if (typeof req.body === "string") {
				rawBody = req.body;
			} else {
				rawBody = JSON.stringify(req.body);
			}

			try {
				parsedBody = JSON.parse(rawBody);
			} catch {
				parsedBody = {};
			}

			const verifyResult = sepayAdapter.verifyWebhook(rawBody, rawHeaders);
			const webhookLog = await webhookLogRepository.create({
				source: "sepay" as WebhookSource,
				event_type: "payment",
				raw_body: rawBody,
				raw_headers: rawHeaders,
				signature_valid: verifyResult.valid,
				signature_reason: verifyResult.reason,
				ip,
				received_at: receivedAt,
				processed_at: null,
				transaction_id: null,
			});

			if (!verifyResult.valid) {
				await auditService.record({
					action: "webhook.sepay.signature_invalid",
					resourceType: "webhook_log",
					resourceId: webhookLog._id.toString(),
					result: "failure",
					metadata: { reason: verifyResult.reason },
				});
				res.status(401).json({ success: false, code: "INVALID_SIGNATURE" });
				return;
			}

			const event = sepayAdapter.mapWebhook(parsedBody);
			if (!event.intent_id) {
				await webhookLogRepository.markProcessed(webhookLog._id.toString());
				await auditService.record({
					action: "payment.webhook.unmatched",
					resourceType: "webhook_log",
					resourceId: webhookLog._id.toString(),
					result: "failure",
					metadata: { gateway: "sepay", reason: "MISSING_INTENT_ID" },
				});
				res.status(200).json({ success: true, message: "Unmatched payment logged" });
				return;
			}

			const transaction = await paymentTransactionRepository.findByIntentId(event.intent_id);
			if (!transaction) {
				await webhookLogRepository.markProcessed(webhookLog._id.toString());
				await auditService.record({
					action: "payment.webhook.unmatched",
					resourceType: "webhook_log",
					resourceId: webhookLog._id.toString(),
					result: "failure",
					metadata: { gateway: "sepay", intent_id: event.intent_id, reason: "ORDER_NOT_FOUND" },
				});
				res.status(200).json({ success: true, message: "Order not found" });
				return;
			}

			if (transaction.status === "succeeded") {
				await webhookLogRepository.markProcessed(webhookLog._id.toString(), transaction._id.toString());
				res.status(200).json({ success: true, message: "Confirm Success" });
				return;
			}

			if (event.amount_vnd !== transaction.amount_vnd) {
				await webhookLogRepository.markProcessed(webhookLog._id.toString(), transaction._id.toString());
				await auditService.record({
					action: "payment.webhook.amount_mismatch",
					resourceType: "payment_transaction",
					resourceId: transaction._id.toString(),
					result: "failure",
					metadata: { gateway: "sepay", expected: transaction.amount_vnd, actual: event.amount_vnd },
				});
				res.status(200).json({ success: false, code: "AMOUNT_MISMATCH" });
				return;
			}

			await paymentTransactionRepository.markSucceeded(
				transaction._id.toString(),
				event.gateway_transaction_id ?? "",
				event.raw,
			);
			await activateAfterPayment(transaction._id.toString());
			await webhookLogRepository.markProcessed(webhookLog._id.toString(), transaction._id.toString());
			await auditService.record({
				action: "payment.webhook.succeeded",
				resourceType: "payment_transaction",
				resourceId: transaction._id.toString(),
				result: "success",
				metadata: { gateway: "sepay", intent_id: event.intent_id, gateway_transaction_id: event.gateway_transaction_id },
			});

			res.status(200).json({ success: true, message: "Confirm Success" });
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			console.error("[webhook:sepay] Unhandled error:", errorMessage);
			res.status(500).json({ success: false, message: "Unknown error" });
		}
	},
);


export default router;
