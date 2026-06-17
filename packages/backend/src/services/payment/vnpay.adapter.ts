import * as crypto from "node:crypto";
import type { PaymentStatus } from "../../models/payment-transaction.model";

// ── Types ───────────────────────────────────────────────────────────────

export interface VNPayConfig {
	tmnCode: string;
	hashSecret: string;
	paymentUrl: string;
	returnUrl: string;
}

export interface VNPayBuildParams {
	intent_id: string;
	amount_vnd: number;
	order_info: string;
	ip_addr: string;
	locale?: "vn" | "en";
	bank_code?: string;
	created_at?: Date;
}

export interface VNPayVerifyResult {
	valid: boolean;
	reason: string | null;
}

export interface VNPayMappedStatus {
	status: PaymentStatus;
	failure_code?: string;
	failure_message?: string;
}

// ── Adapter ─────────────────────────────────────────────────────────────

export class VNPayAdapter {
	private readonly config: VNPayConfig;

	constructor(config: VNPayConfig) {
		this.config = config;
	}

	/**
	 * Build a VNPAY payment URL with HMAC-SHA512 signature.
	 *
	 * Follows VNPAY docs:
	 * 1. Construct params sorted alphabetically
	 * 2. URL-encode values
	 * 3. Join as key=value with &
	 * 4. HMAC-SHA512 with hashSecret
	 * 5. Append vnp_SecureHash to URL
	 */
	public buildPaymentUrl(params: VNPayBuildParams): { url: string } {
		const createDate = params.created_at ?? new Date();
		const expireDate = new Date(createDate.getTime() + 15 * 60 * 1000); // 15 minutes

		const vnpParams: Record<string, string> = {
			vnp_Version: "2.1.0",
			vnp_Command: "pay",
			vnp_TmnCode: this.config.tmnCode,
			vnp_Locale: params.locale ?? "vn",
			vnp_CurrCode: "VND",
			vnp_TxnRef: params.intent_id,
			vnp_OrderInfo: params.order_info,
			vnp_OrderType: "other",
			vnp_Amount: String(params.amount_vnd * 100), // VNPAY uses amount * 100
			vnp_ReturnUrl: this.config.returnUrl,
			vnp_IpAddr: params.ip_addr,
			vnp_CreateDate: this.formatDate(createDate),
			vnp_ExpireDate: this.formatDate(expireDate),
		};

		if (params.bank_code) {
			vnpParams.vnp_BankCode = params.bank_code;
		}

		// Sort keys alphabetically and build sign data
		const sortedKeys = Object.keys(vnpParams).sort();
		const signData = sortedKeys
			.map((key) => `${key}=${encodeURIComponent(vnpParams[key])}`)
			.join("&");

		const hmac = crypto.createHmac("sha512", this.config.hashSecret);
		hmac.update(signData);
		const secureHash = hmac.digest("hex").toUpperCase();

		const url = `${this.config.paymentUrl}?${signData}&vnp_SecureHash=${secureHash}&vnp_SecureHashType=SHA512`;

		return { url };
	}

	/**
	 * Verify VNPAY IPN (webhook) body signature.
	 *
	 * Algorithm:
	 * 1. Check vnp_TmnCode matches config
	 * 2. Remove vnp_SecureHash and vnp_SecureHashType from body
	 * 3. Sort remaining keys alphabetically
	 * 4. URL-encode values, join as key=value with &
	 * 5. HMAC-SHA512 with hashSecret
	 * 6. Compare case-insensitive with received vnp_SecureHash
	 */
	public verifyIpn(body: Record<string, string>): VNPayVerifyResult {
		const tmnCode = body.vnp_TmnCode;
		const receivedHash = body.vnp_SecureHash;

		if (!tmnCode || !receivedHash) {
			return { valid: false, reason: "MISSING_REQUIRED_FIELDS" };
		}

		if (tmnCode !== this.config.tmnCode) {
			return { valid: false, reason: "TMN_CODE_MISMATCH" };
		}

		const inputData = { ...body };
		delete inputData.vnp_SecureHash;
		delete inputData.vnp_SecureHashType;

		const sortedKeys = Object.keys(inputData).sort();
		const signData = sortedKeys
			.map((key) => `${key}=${encodeURIComponent(inputData[key])}`)
			.join("&");

		const hmac = crypto.createHmac("sha512", this.config.hashSecret);
		hmac.update(signData);
		const expectedHash = hmac.digest("hex").toUpperCase();

		if (expectedHash !== receivedHash.toUpperCase()) {
			return { valid: false, reason: "INVALID_SIGNATURE" };
		}

		return { valid: true, reason: null };
	}

	/**
	 * Verify VNPAY return URL query params (browser redirect back).
	 * Same algorithm as verifyIpn.
	 */
	public verifyReturn(query: Record<string, string>): VNPayVerifyResult {
		return this.verifyIpn(query);
	}

	/**
	 * Map VNPAY response code to internal PaymentStatus.
	 *
	 * - "00" → succeeded
	 * - "24" → failed (user cancelled)
	 * - "75" → pending (bank processing)
	 * - Others → failed
	 */
	public mapResponseCode(code: string): VNPayMappedStatus {
		switch (code) {
			case "00":
				return { status: "succeeded" };
			case "24":
				return {
					status: "failed",
					failure_code: "user_cancelled",
					failure_message: "Giao dịch bị huỷ bởi người dùng",
				};
			case "75":
				return {
					status: "pending",
					failure_code: "bank_processing",
					failure_message: "Ngân hàng đang xử lý",
				};
			default:
				return {
					status: "failed",
					failure_code: `vnpay_${code}`,
					failure_message: `Giao dịch thất bại (mã: ${code})`,
				};
		}
	}

	// ── Private helpers ──────────────────────────────────────────────────

	/**
	 * Format date as YYYYMMDDHHmmss for VNPAY.
	 */
	private formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		const seconds = String(date.getSeconds()).padStart(2, "0");
		return `${year}${month}${day}${hours}${minutes}${seconds}`;
	}
}

// ── Factory ─────────────────────────────────────────────────────────────

export interface VNPayAdapterOptions {
	tmnCode?: string;
	hashSecret?: string;
	paymentUrl?: string;
	returnUrl?: string;
}

/**
 * Create a VNPayAdapter instance from env vars or explicit options.
 */
export const createVNPayAdapter = (
	options: VNPayAdapterOptions = {},
): VNPayAdapter => {
	const cfg: VNPayConfig = {
		tmnCode: options.tmnCode ?? process.env.PAYMENT_VNPAY_TMN_CODE ?? "",
		hashSecret:
			options.hashSecret ?? process.env.PAYMENT_VNPAY_HASH_SECRET ?? "",
		paymentUrl:
			options.paymentUrl ??
			process.env.PAYMENT_VNPAY_PAYMENT_URL ??
			"https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
		returnUrl:
			options.returnUrl ??
			process.env.PAYMENT_VNPAY_RETURN_URL ??
			"http://localhost:3444/billing/return/vnpay",
	};

	return new VNPayAdapter(cfg);
};

// ── Singleton export ────────────────────────────────────────────────────

export const vnpayAdapter = createVNPayAdapter();
