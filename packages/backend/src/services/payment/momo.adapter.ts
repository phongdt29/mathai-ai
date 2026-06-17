import * as crypto from "node:crypto";
import type { PaymentStatus } from "../../models/payment-transaction.model";

// ── Types ───────────────────────────────────────────────────────────────

export interface MoMoConfig {
	partnerCode: string;
	accessKey: string;
	secretKey: string;
	paymentUrl: string;
	returnUrl: string;
	ipnUrl: string;
}

export interface MoMoBuildParams {
	intent_id: string;
	amount_vnd: number;
	order_info: string;
	extra_data?: string;
}

export interface MoMoBuildResult {
	url: string;
}

export interface MoMoVerifyResult {
	valid: boolean;
	reason: string | null;
}

export interface MoMoMappedStatus {
	status: PaymentStatus;
	failure_code?: string;
	failure_message?: string;
}

// ── Fetch type ──────────────────────────────────────────────────────────

type FetchFn = typeof fetch;

// ── Adapter ─────────────────────────────────────────────────────────────

export class MoMoAdapter {
	private readonly config: MoMoConfig;
	private readonly fetchFn: FetchFn;

	constructor(config: MoMoConfig, fetchFn: FetchFn = fetch) {
		this.config = config;
		this.fetchFn = fetchFn;
	}

	/**
	 * Build a MOMO payment URL by calling MOMO's create order API.
	 *
	 * Steps:
	 * 1. Construct raw signature string per MOMO docs
	 * 2. HMAC-SHA256 with secretKey
	 * 3. POST to MOMO API to get payUrl
	 *
	 * If the MOMO API call fails, throws an error.
	 */
	public async buildPaymentUrl(params: MoMoBuildParams): Promise<MoMoBuildResult> {
		const requestId = params.intent_id;
		const orderId = params.intent_id;
		const extraData = params.extra_data ?? "";

		// Build signature string per MOMO docs format:
		// accessKey=$accessKey&amount=$amount&extraData=$extraData&ipnUrl=$ipnUrl
		// &orderId=$orderId&orderInfo=$orderInfo&partnerCode=$partnerCode
		// &redirectUrl=$redirectUrl&requestId=$requestId&requestType=payWithMethod
		const rawSignature = [
			`accessKey=${this.config.accessKey}`,
			`amount=${params.amount_vnd}`,
			`extraData=${extraData}`,
			`ipnUrl=${this.config.ipnUrl}`,
			`orderId=${orderId}`,
			`orderInfo=${params.order_info}`,
			`partnerCode=${this.config.partnerCode}`,
			`redirectUrl=${this.config.returnUrl}`,
			`requestId=${requestId}`,
			`requestType=payWithMethod`,
		].join("&");

		const signature = crypto
			.createHmac("sha256", this.config.secretKey)
			.update(rawSignature)
			.digest("hex");

		const requestBody = {
			partnerCode: this.config.partnerCode,
			partnerName: "MathAI",
			storeId: "MathAI",
			requestId,
			amount: params.amount_vnd,
			orderId,
			orderInfo: params.order_info,
			redirectUrl: this.config.returnUrl,
			ipnUrl: this.config.ipnUrl,
			lang: "vi",
			requestType: "payWithMethod",
			autoCapture: true,
			extraData,
			signature,
		};

		const response = await this.fetchFn(this.config.paymentUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			throw new Error(
				`MOMO API returned HTTP ${response.status}: ${response.statusText}`,
			);
		}

		const data = (await response.json()) as {
			resultCode: number;
			message: string;
			payUrl?: string;
		};

		if (data.resultCode !== 0 || !data.payUrl) {
			throw new Error(
				`MOMO create order failed: resultCode=${data.resultCode}, message=${data.message}`,
			);
		}

		return { url: data.payUrl };
	}

	/**
	 * Verify MOMO IPN (webhook) body signature.
	 *
	 * MOMO IPN signature format (HMAC-SHA256):
	 * accessKey=$accessKey&amount=$amount&extraData=$extraData&message=$message
	 * &orderId=$orderId&orderInfo=$orderInfo&orderType=$orderType
	 * &partnerCode=$partnerCode&payType=$payType&requestId=$requestId
	 * &responseTime=$responseTime&resultCode=$resultCode&transId=$transId
	 */
	public verifyIpn(body: Record<string, unknown>): MoMoVerifyResult {
		const receivedSignature = body.signature as string | undefined;

		if (!receivedSignature) {
			return { valid: false, reason: "MISSING_SIGNATURE" };
		}

		const partnerCode = body.partnerCode as string | undefined;
		if (partnerCode && partnerCode !== this.config.partnerCode) {
			return { valid: false, reason: "PARTNER_CODE_MISMATCH" };
		}

		// Build raw signature string per MOMO IPN docs
		const rawSignature = [
			`accessKey=${this.config.accessKey}`,
			`amount=${body.amount ?? ""}`,
			`extraData=${body.extraData ?? ""}`,
			`message=${body.message ?? ""}`,
			`orderId=${body.orderId ?? ""}`,
			`orderInfo=${body.orderInfo ?? ""}`,
			`orderType=${body.orderType ?? ""}`,
			`partnerCode=${body.partnerCode ?? ""}`,
			`payType=${body.payType ?? ""}`,
			`requestId=${body.requestId ?? ""}`,
			`responseTime=${body.responseTime ?? ""}`,
			`resultCode=${body.resultCode ?? ""}`,
			`transId=${body.transId ?? ""}`,
		].join("&");

		const expectedSignature = crypto
			.createHmac("sha256", this.config.secretKey)
			.update(rawSignature)
			.digest("hex");

		if (expectedSignature !== receivedSignature) {
			return { valid: false, reason: "INVALID_SIGNATURE" };
		}

		return { valid: true, reason: null };
	}

	/**
	 * Map MOMO resultCode to internal PaymentStatus.
	 *
	 * - 0 → succeeded
	 * - 1006 → failed (user cancelled)
	 * - 1005 → failed (expired)
	 * - Others → failed
	 */
	public mapResultCode(resultCode: number): MoMoMappedStatus {
		switch (resultCode) {
			case 0:
				return { status: "succeeded" };
			case 1006:
				return {
					status: "failed",
					failure_code: "user_cancelled",
					failure_message: "Giao dịch bị huỷ bởi người dùng",
				};
			case 1005:
				return {
					status: "expired",
					failure_code: "transaction_expired",
					failure_message: "Giao dịch đã hết hạn",
				};
			default:
				return {
					status: "failed",
					failure_code: `momo_${resultCode}`,
					failure_message: `Giao dịch thất bại (mã: ${resultCode})`,
				};
		}
	}
}

// ── Factory ─────────────────────────────────────────────────────────────

export interface MoMoAdapterOptions {
	partnerCode?: string;
	accessKey?: string;
	secretKey?: string;
	paymentUrl?: string;
	returnUrl?: string;
	ipnUrl?: string;
	fetchFn?: FetchFn;
}

/**
 * Create a MoMoAdapter instance from env vars or explicit options.
 */
export const createMoMoAdapter = (
	options: MoMoAdapterOptions = {},
): MoMoAdapter => {
	const cfg: MoMoConfig = {
		partnerCode:
			options.partnerCode ?? process.env.PAYMENT_MOMO_PARTNER_CODE ?? "",
		accessKey:
			options.accessKey ?? process.env.PAYMENT_MOMO_ACCESS_KEY ?? "",
		secretKey:
			options.secretKey ?? process.env.PAYMENT_MOMO_SECRET_KEY ?? "",
		paymentUrl:
			options.paymentUrl ??
			process.env.PAYMENT_MOMO_PAYMENT_URL ??
			"https://test-payment.momo.vn/v2/gateway/api/create",
		returnUrl:
			options.returnUrl ??
			process.env.PAYMENT_MOMO_RETURN_URL ??
			"http://localhost:3444/billing/return/momo",
		ipnUrl:
			options.ipnUrl ??
			process.env.PAYMENT_MOMO_IPN_URL ??
			"http://localhost:3001/api/webhooks/momo",
	};

	return new MoMoAdapter(cfg, options.fetchFn);
};

// ── Singleton export ────────────────────────────────────────────────────

export const momoAdapter = createMoMoAdapter();
