export type SmsProvider = "console" | "twilio" | "esms";

export interface SendSmsResult {
	provider_message_id: string;
}

type FetchFn = typeof fetch;

export interface SmsServiceOptions {
	provider: SmsProvider;
	apiUrl: string;
	apiKey: string;
	fromNumber: string;
	fetchFn?: FetchFn;
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export class SmsService {
	private readonly provider: SmsProvider;
	private readonly apiUrl: string;
	private readonly apiKey: string;
	private readonly fromNumber: string;
	private readonly fetchFn: FetchFn;
	private readonly timeoutMs: number;

	constructor(options: SmsServiceOptions = buildDefaultOptions()) {
		this.provider = options.provider;
		this.apiUrl = options.apiUrl;
		this.apiKey = options.apiKey;
		this.fromNumber = options.fromNumber;
		this.fetchFn = options.fetchFn ?? fetch;
		this.timeoutMs = normalizePositiveInteger(
			options.timeoutMs,
			DEFAULT_TIMEOUT_MS,
		);
	}

	/**
	 * Send an SMS message to the given phone number.
	 * Provider is selected via SMS_PROVIDER env variable:
	 * - "console" (default/dev): logs to console, returns mock message_id
	 * - "twilio": POST to Twilio Messages API
	 * - "esms": POST to eSMS API
	 *
	 * No retry at this level — notification.service handles retry logic.
	 */
	public async sendSMS(
		to: string,
		text: string,
	): Promise<SendSmsResult> {
		switch (this.provider) {
			case "console":
				return this.sendConsole(to, text);
			case "twilio":
				return this.sendTwilio(to, text);
			case "esms":
				return this.sendEsms(to, text);
			default:
				throw new SmsProviderError(
					`Unknown SMS provider: ${this.provider}`,
					0,
				);
		}
	}

	private sendConsole(to: string, text: string): SendSmsResult {
		console.info("[sms:console]", {
			from: this.fromNumber,
			to,
			text,
		});
		return { provider_message_id: `console_sms_${Date.now()}` };
	}

	private async sendTwilio(to: string, text: string): Promise<SendSmsResult> {
		const body = new URLSearchParams({
			To: to,
			From: this.fromNumber,
			Body: text,
		});

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const response = await this.fetchFn(this.apiUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Authorization: `Basic ${Buffer.from(this.apiKey).toString("base64")}`,
				},
				body: body.toString(),
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new SmsProviderError(
					`Twilio request failed with status ${response.status}`,
					response.status,
				);
			}

			const data = await safeParseJson(response);
			const messageId = extractTwilioMessageId(data);

			return { provider_message_id: messageId ?? `twilio_${Date.now()}` };
		} catch (error) {
			throw buildSafeSmsError(error, this.timeoutMs);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private async sendEsms(to: string, text: string): Promise<SendSmsResult> {
		const requestBody = JSON.stringify({
			ApiKey: this.apiKey,
			Phone: to,
			Content: text,
			SmsType: "2",
			Brandname: this.fromNumber,
		});

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const response = await this.fetchFn(this.apiUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: requestBody,
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new SmsProviderError(
					`eSMS request failed with status ${response.status}`,
					response.status,
				);
			}

			const data = await safeParseJson(response);
			const messageId = extractEsmsMessageId(data);

			return { provider_message_id: messageId ?? `esms_${Date.now()}` };
		} catch (error) {
			throw buildSafeSmsError(error, this.timeoutMs);
		} finally {
			clearTimeout(timeoutId);
		}
	}
}

export class SmsProviderError extends Error {
	public readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "SmsProviderError";
		this.status = status;
	}
}

function buildSafeSmsError(error: unknown, timeoutMs: number): Error {
	if (error instanceof SmsProviderError) {
		return error;
	}

	if (error instanceof Error) {
		if (error.name === "AbortError") {
			return new SmsProviderError(
				`SMS provider request timed out after ${timeoutMs}ms`,
				408,
			);
		}

		const errorWithCode = error as Error & { code?: string };
		if (
			errorWithCode.code === "ETIMEDOUT" ||
			errorWithCode.code === "ECONNRESET" ||
			errorWithCode.code === "ECONNABORTED"
		) {
			return new SmsProviderError("SMS provider network error", 503);
		}
	}

	return new SmsProviderError("SMS provider request failed", 500);
}

function normalizePositiveInteger(
	value: number | undefined,
	fallback: number,
): number {
	return typeof value === "number" && Number.isInteger(value) && value > 0
		? value
		: fallback;
}

async function safeParseJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function extractTwilioMessageId(data: unknown): string | null {
	if (data && typeof data === "object") {
		const obj = data as Record<string, unknown>;
		if (typeof obj.sid === "string") return obj.sid;
		if (typeof obj.message_sid === "string") return obj.message_sid;
	}
	return null;
}

function extractEsmsMessageId(data: unknown): string | null {
	if (data && typeof data === "object") {
		const obj = data as Record<string, unknown>;
		if (typeof obj.SMSID === "string") return obj.SMSID;
		if (typeof obj.MessageId === "string") return obj.MessageId;
		if (typeof obj.message_id === "string") return obj.message_id;
	}
	return null;
}

function buildDefaultOptions(): SmsServiceOptions {
	return {
		provider: readSmsEnv("SMS_PROVIDER", "console") as SmsProvider,
		apiUrl: readSmsEnv("SMS_API_URL", ""),
		apiKey: readSmsEnv("SMS_API_KEY", ""),
		fromNumber: readSmsEnv("SMS_FROM_NUMBER", ""),
	};
}

function readSmsEnv(key: string, fallback: string): string {
	const value = process.env[key];
	if (value === undefined || value.trim().length === 0) {
		return fallback;
	}
	return value.trim();
}

export const smsService = new SmsService();

export default smsService;
