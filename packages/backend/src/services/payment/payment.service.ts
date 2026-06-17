import { ulid } from "ulid";
import mongoose from "mongoose";
import type {
	IPaymentTransaction,
	PaymentGateway,
	PaymentStatus,
} from "../../models/payment-transaction.model";
import {
	paymentTransactionRepository,
	type PaymentTransactionRepository,
} from "../../models/payment-transaction.model";
import { planRepository, type PlanRepository } from "../../models/plan.model";
import { vnpayAdapter, type VNPayAdapter } from "./vnpay.adapter";
import { momoAdapter, type MoMoAdapter } from "./momo.adapter";
import { sepayAdapter, type SePayAdapter } from "./sepay.adapter";
import {
	paymentGatewayRegistry,
	PaymentGatewayRegistryError,
	type PaymentGatewayRegistry,
} from "./payment-gateway.registry";
import type { GatewayPaymentResult, GatewaySelection } from "./gateway.types";

export interface CreatePaymentIntentInput {
	user_id: string;
	plan_id: string;
	gateway?: GatewaySelection;
	idempotency_key: string;
	ip_addr?: string;
}

export interface PaymentIntentResult {
	intent_id: string;
	redirect_url: string;
	expires_at: string;
	type: GatewayPaymentResult["type"];
	gateway_used: PaymentGateway;
	bank_transfer?: Extract<GatewayPaymentResult, { type: "bank_transfer" }>["bank_transfer"];
}

export interface PaymentServiceDependencies {
	transactionRepo?: PaymentTransactionRepository;
	planRepo?: PlanRepository;
	vnpay?: VNPayAdapter;
	momo?: MoMoAdapter;
	sepay?: SePayAdapter;
	gatewayRegistry?: PaymentGatewayRegistry;
	logger?: Pick<Console, "error" | "warn" | "info">;
	intentTtlSeconds?: number;
}

const DEFAULT_INTENT_TTL_SECONDS = 900;

export class PaymentService {
	private readonly transactionRepo: PaymentTransactionRepository;
	private readonly planRepo: PlanRepository;
	private readonly vnpay: VNPayAdapter;
	private readonly momo: MoMoAdapter;
	private readonly sepay: SePayAdapter;
	private readonly gatewayRegistry: PaymentGatewayRegistry;
	private readonly logger: Pick<Console, "error" | "warn" | "info">;
	private readonly intentTtlSeconds: number;

	constructor(dependencies: PaymentServiceDependencies = {}) {
		this.transactionRepo = dependencies.transactionRepo ?? paymentTransactionRepository;
		this.planRepo = dependencies.planRepo ?? planRepository;
		this.vnpay = dependencies.vnpay ?? vnpayAdapter;
		this.momo = dependencies.momo ?? momoAdapter;
		this.sepay = dependencies.sepay ?? sepayAdapter;
		this.gatewayRegistry = dependencies.gatewayRegistry ?? paymentGatewayRegistry;
		this.logger = dependencies.logger ?? console;
		this.intentTtlSeconds =
			dependencies.intentTtlSeconds ??
			(Number(process.env.PAYMENT_INTENT_TTL_SECONDS) || DEFAULT_INTENT_TTL_SECONDS);
	}

	public async createIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult> {
		const existing = await this.transactionRepo.findByIdempotencyKey(input.idempotency_key);

		if (existing && existing.user_id.toString() === input.user_id) {
			return {
				intent_id: existing.intent_id,
				redirect_url: existing.redirect_url,
				expires_at: existing.expires_at.toISOString(),
				type: existing.gateway === "sepay" ? "bank_transfer" : "redirect",
				gateway_used: existing.gateway,
			};
		}

		const plan = await this.planRepo.findByPlanId(input.plan_id);
		if (!plan) throw new PaymentError("PLAN_NOT_FOUND", "Gói dịch vụ không tồn tại");
		if (!plan.is_active) {
			throw new PaymentError("PLAN_INACTIVE", "Gói dịch vụ hiện không khả dụng");
		}

		const selectedGateways = await this.selectGateways(input.gateway);
		let lastError: unknown = null;

		for (const gateway of selectedGateways) {
			const intentId = ulid();
			const now = new Date();
			const expiresAt = new Date(now.getTime() + this.intentTtlSeconds * 1000);
			try {
				const payment = await this.createGatewayPayment(gateway, {
					intent_id: intentId,
					amount_vnd: plan.price_vnd,
					order_info: `Thanh toan goi ${plan.name} - MathAI`,
					ip_addr: input.ip_addr ?? "127.0.0.1",
					created_at: now,
					expires_at: expiresAt,
				});
				const redirectUrl =
					payment.type === "redirect" ? payment.redirect_url : `sepay://transfer/${intentId}`;

				await this.transactionRepo.create({
					intent_id: intentId,
					user_id: new mongoose.Types.ObjectId(input.user_id),
					plan_id: plan._id,
					gateway,
					amount_vnd: plan.price_vnd,
					status: "pending" as PaymentStatus,
					idempotency_key: input.idempotency_key,
					redirect_url: redirectUrl,
					expires_at: expiresAt,
					paid_at: null,
					gateway_transaction_id: null,
					signed_payload_in: null,
					refund_amount_vnd: null,
				} as Partial<IPaymentTransaction>);

				this.logger.info("[payment] Intent created", {
					intent_id: intentId,
					gateway,
					plan_id: input.plan_id,
					amount_vnd: plan.price_vnd,
				});

				return {
					intent_id: intentId,
					redirect_url: redirectUrl,
					expires_at: expiresAt.toISOString(),
					type: payment.type,
					gateway_used: gateway,
					...(payment.type === "bank_transfer" ? { bank_transfer: payment.bank_transfer } : {}),
				};
			} catch (error) {
				lastError = error;
				this.logger.warn("[payment] Gateway payment creation failed", {
					gateway,
					plan_id: input.plan_id,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		if (lastError instanceof PaymentError) throw lastError;
		throw new PaymentError("PAYMENT_GATEWAYS_UNAVAILABLE", "Không có cổng thanh toán khả dụng");
	}

	public async getTransaction(intentId: string): Promise<IPaymentTransaction | null> {
		return this.transactionRepo.findByIntentId(intentId);
	}

	public async expireStalePending(): Promise<{ expired: number }> {
		const stale = await this.transactionRepo.findStalePending();
		let expired = 0;
		for (const txn of stale) {
			await this.transactionRepo.markExpired(txn._id.toString());
			expired++;
		}
		if (expired > 0) this.logger.info("[payment] Expired stale pending intents", { expired });
		return { expired };
	}

	private async selectGateways(selection: GatewaySelection | undefined): Promise<PaymentGateway[]> {
		if (selection && selection !== "auto") return [selection];

		try {
			return await this.gatewayRegistry.selectGateway(selection);
		} catch (error) {
			if (error instanceof PaymentGatewayRegistryError) {
				throw new PaymentError(error.code, error.message);
			}
			throw error;
		}
	}

	private async createGatewayPayment(
		gateway: PaymentGateway,
		params: Parameters<SePayAdapter["createPayment"]>[0],
	): Promise<GatewayPaymentResult> {
		if (gateway === "vnpay") {
			const result = this.vnpay.buildPaymentUrl({
				intent_id: params.intent_id,
				amount_vnd: params.amount_vnd,
				order_info: params.order_info,
				ip_addr: params.ip_addr ?? "127.0.0.1",
				created_at: params.created_at,
			});
			return { type: "redirect", gateway, redirect_url: result.url };
		}
		if (gateway === "momo") {
			const result = await this.momo.buildPaymentUrl({
				intent_id: params.intent_id,
				amount_vnd: params.amount_vnd,
				order_info: params.order_info,
			});
			return { type: "redirect", gateway, redirect_url: result.url };
		}
		if (gateway === "sepay") return this.sepay.createPayment(params);
		throw new PaymentError("UNSUPPORTED_GATEWAY", `Cổng thanh toán '${gateway}' không được hỗ trợ`);
	}
}

export class PaymentError extends Error {
	public readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "PaymentError";
		this.code = code;
	}
}

export const paymentService = new PaymentService();
export default paymentService;
