import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { ocrResultRepository } from "../models/ocr-result.model";
import { getStudentProfileId } from "../utils/helpers";

const OCR_DAILY_QUOTA_PER_STUDENT = Number(
	process.env.OCR_DAILY_QUOTA_PER_STUDENT || "30",
);
const FREE_DAILY_QUOTA = Number(process.env.FREE_DAILY_QUOTA || "5");
const OCR_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Global API rate limit — 600 req/min/IP for /api/*
 * Applied before route handlers in app.ts.
 *
 * Requirements: 13.12
 */
export const globalApiRateLimit = rateLimit({
	windowMs: 60 * 1000, // 1 minute
	max: 600, // 600 requests per minute per IP
	message: {
		success: false,
		error: "Quá nhiều yêu cầu, vui lòng thử lại sau.",
	},
	standardHeaders: true,
	legacyHeaders: false,
	// Skip specialized rate limits (they have their own)
	skip: (_req) => false,
});

export const authRateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 200, // relaxed for development
	message: {
		success: false,
		message: "Quá nhiều yêu cầu, vui lòng thử lại sau",
		data: null,
	},
	standardHeaders: true,
	legacyHeaders: false,
});

export const loginRateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // relaxed for development
	message: {
		success: false,
		message: "Quá nhiều lần đăng nhập thất bại, vui lòng thử lại sau 15 phút",
		data: null,
	},
	standardHeaders: true,
	legacyHeaders: false,
});

/**
 * Password reset rate limit — IP-based: 10 requests per IP per hour.
 * Note: Email-based rate limit (3 req/email/hour) is handled in auth.service
 * via DB check (silent skip dispatch), not in this middleware.
 * Requirements: 1.4, 1.5
 */
export const passwordResetRateLimit = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 10, // 10 requests per IP per hour
	message: {
		success: false,
		error: "Quá nhiều yêu cầu, vui lòng thử lại sau.",
	},
	standardHeaders: true,
	legacyHeaders: false,
});

/** @deprecated Use passwordResetRateLimit instead */
export const passwordResetRateLimiter = passwordResetRateLimit;

// ─── Brute-force protection ─────────────────────────────────────────────────
// Track failed login attempts per (IP, email) combination.
// Lock temporarily after 5 failures within 15 minutes.
// Uses in-memory Map with TTL cleanup since Redis is not yet available.
//
// Requirements: 13.12
// ─────────────────────────────────────────────────────────────────────────────

const BRUTE_FORCE_MAX_ATTEMPTS = 5;
const BRUTE_FORCE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BRUTE_FORCE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // cleanup every 5 minutes

interface BruteForceEntry {
	attempts: number;
	firstAttemptAt: number;
	lockedUntil: number | null;
}

const bruteForceStore = new Map<string, BruteForceEntry>();

// Periodic cleanup of expired entries
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of bruteForceStore) {
		const windowExpired = now - entry.firstAttemptAt > BRUTE_FORCE_WINDOW_MS;
		const lockExpired = entry.lockedUntil !== null && now > entry.lockedUntil;
		if (windowExpired && (!entry.lockedUntil || lockExpired)) {
			bruteForceStore.delete(key);
		}
	}
}, BRUTE_FORCE_CLEANUP_INTERVAL_MS).unref();

function getBruteForceKey(ip: string, email: string): string {
	return `${ip}:${email.toLowerCase().trim()}`;
}

/**
 * Check if a login attempt is currently locked due to brute-force protection.
 * Returns true if the attempt should be blocked.
 */
export function isBruteForceLocked(ip: string, email: string): boolean {
	const key = getBruteForceKey(ip, email);
	const entry = bruteForceStore.get(key);
	if (!entry) return false;

	const now = Date.now();

	// If locked and lock hasn't expired
	if (entry.lockedUntil !== null && now < entry.lockedUntil) {
		return true;
	}

	// If lock expired, reset the entry
	if (entry.lockedUntil !== null && now >= entry.lockedUntil) {
		bruteForceStore.delete(key);
		return false;
	}

	return false;
}

/**
 * Record a failed login attempt. If threshold is reached, lock the (IP, email) pair.
 */
export function recordLoginFailure(ip: string, email: string): void {
	const key = getBruteForceKey(ip, email);
	const now = Date.now();
	const entry = bruteForceStore.get(key);

	if (!entry || now - entry.firstAttemptAt > BRUTE_FORCE_WINDOW_MS) {
		// Start a new window
		bruteForceStore.set(key, {
			attempts: 1,
			firstAttemptAt: now,
			lockedUntil: null,
		});
		return;
	}

	entry.attempts += 1;

	if (entry.attempts >= BRUTE_FORCE_MAX_ATTEMPTS) {
		// Lock for the remainder of the window
		entry.lockedUntil = entry.firstAttemptAt + BRUTE_FORCE_WINDOW_MS;
	}
}

/**
 * Clear brute-force tracking on successful login.
 */
export function clearLoginFailures(ip: string, email: string): void {
	const key = getBruteForceKey(ip, email);
	bruteForceStore.delete(key);
}

/**
 * Brute-force protection middleware for login route.
 * Checks if the (IP, email) pair is locked before allowing the login attempt.
 *
 * Requirements: 13.12
 */
export const bruteForceProtection = (
	req: Request,
	res: Response,
	next: NextFunction,
): void => {
	const ip = req.ip || req.socket?.remoteAddress || "unknown";
	const email = req.body?.email;

	if (!email || typeof email !== "string") {
		next();
		return;
	}

	if (isBruteForceLocked(ip, email)) {
		res.status(429).json({
			success: false,
			error: "Quá nhiều lần đăng nhập thất bại, vui lòng thử lại sau 15 phút.",
		});
		return;
	}

	next();
};

// Export for testing
export { bruteForceStore, BRUTE_FORCE_MAX_ATTEMPTS, BRUTE_FORCE_WINDOW_MS };

/**
 * OCR rate limit middleware — quota per student per day.
 *
 * Validates:
 * 1. MIME type must be image/* (rejects non-image files with 400)
 * 2. File size must be ≤ 5MB (rejects oversized files with 400)
 * 3. Student must not have exceeded OCR_DAILY_QUOTA_PER_STUDENT (default 30)
 *    successful requests in the past 24 hours (rejects with 429)
 *
 * This middleware should be placed AFTER authenticate (needs req.user)
 * and AFTER multer upload (needs req.file for MIME/size validation).
 *
 * Requirements: 4.5, 4.8
 */
export const ocrRateLimit = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		// Validate MIME type — must be image/*
		if (req.file) {
			if (!req.file.mimetype.startsWith("image/")) {
				res.status(400).json({
					success: false,
					error: "Chỉ chấp nhận file ảnh (image/*).",
				});
				return;
			}

			// Validate file size — must be ≤ 5MB
			if (req.file.size > OCR_MAX_FILE_SIZE) {
				res.status(400).json({
					success: false,
					error: "File ảnh không được vượt quá 5MB.",
				});
				return;
			}
		}

		// Check daily quota for the student
		if (!req.user?.id) {
			res.status(401).json({
				success: false,
				error: "Unauthorized",
			});
			return;
		}

		const studentId = await getStudentProfileId(String(req.user.id));
		const count =
			await ocrResultRepository.countSuccessfulToday(studentId);

		if (count >= OCR_DAILY_QUOTA_PER_STUDENT) {
			res.status(429).json({
				success: false,
				error: "Đã hết lượt OCR trong ngày.",
			});
			return;
		}

		next();
	} catch (error: unknown) {
		next(error);
	}
};
