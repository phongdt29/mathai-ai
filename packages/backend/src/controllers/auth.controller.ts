import type { NextFunction, Request, Response } from "express";
import { authService } from "../services/auth.service";
import { successResponse } from "../utils/response";
import { recordLoginFailure, clearLoginFailures } from "../middleware/rate-limit";

export class AuthController {
	public async register(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const result = await authService.register(req.body);
			successResponse(
				res,
				result,
				"Đăng ký tài khoản thành công",
				undefined,
				201,
			);
		} catch (error: unknown) {
			next(error);
		}
	}

	public async login(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const result = await authService.login(req.body);
			// On successful login, clear brute-force tracking
			const ip = req.ip || req.socket?.remoteAddress || "unknown";
			const email = req.body?.email;
			if (email) {
				clearLoginFailures(ip, email);
			}
			successResponse(res, result, "Đăng nhập thành công");
		} catch (error: unknown) {
			// On failed login, record the failure for brute-force protection
			const ip = req.ip || req.socket?.remoteAddress || "unknown";
			const email = req.body?.email;
			if (email && typeof email === "string") {
				recordLoginFailure(ip, email);
			}
			next(error);
		}
	}

	public async forgotPassword(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const result = await authService.requestPasswordReset(req.body, {
				ip: req.ip || req.socket?.remoteAddress || null,
				userAgent: req.headers["user-agent"] || null,
			});
			successResponse(
				res,
				result,
				"Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi trong vài phút",
			);
		} catch (error: unknown) {
			next(error);
		}
	}

	public async resetPassword(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const result = await authService.resetPassword(req.body);
			successResponse(res, result, "Đặt lại mật khẩu thành công");
		} catch (error: unknown) {
			next(error);
		}
	}

	public async refresh(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const result = await authService.refreshToken(req.body.refresh_token);
			successResponse(res, result, "Làm mới token thành công");
		} catch (error: unknown) {
			next(error);
		}
	}

	public async getMe(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		try {
			const result = await authService.getMe(String(req.user!.id));
			successResponse(res, result, "Lấy thông tin người dùng thành công");
		} catch (error: unknown) {
			next(error);
		}
	}
}

export const authController = new AuthController();

export default authController;
