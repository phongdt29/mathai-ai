import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { UnauthorizedError } from '../utils/errors';

/**
 * Xác thực server-to-server bằng API key cho cổng tích hợp ngoài.
 *
 * - Key gửi qua header `X-API-Key` (hoặc `Authorization: ApiKey <key>`).
 * - Danh sách key hợp lệ cấu hình qua env EXTERNAL_API_KEYS (phân tách dấu phẩy).
 * - So sánh timing-safe để tránh dò key qua thời gian phản hồi.
 */
export const authenticateApiKey = (
	req: Request,
	_res: Response,
	next: NextFunction,
): void => {
	const headerKey = req.headers['x-api-key'];
	const authHeader = req.headers.authorization;
	const candidate =
		(typeof headerKey === 'string' && headerKey.trim()) ||
		(authHeader?.startsWith('ApiKey ') ? authHeader.slice(7).trim() : '');

	if (!candidate) {
		next(new UnauthorizedError('Thiếu API key (header X-API-Key)'));
		return;
	}

	if (config.externalApiKeys.length === 0) {
		next(
			new UnauthorizedError(
				'Cổng API tích hợp ngoài chưa được bật (chưa cấu hình EXTERNAL_API_KEYS)',
			),
		);
		return;
	}

	const candidateHash = crypto.createHash('sha256').update(candidate).digest();
	const matched = config.externalApiKeys.some((key) => {
		const keyHash = crypto.createHash('sha256').update(key).digest();
		return crypto.timingSafeEqual(candidateHash, keyHash);
	});

	if (!matched) {
		next(new UnauthorizedError('API key không hợp lệ'));
		return;
	}

	next();
};
