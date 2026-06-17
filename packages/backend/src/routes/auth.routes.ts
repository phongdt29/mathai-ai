import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";
import {
	authRateLimiter,
	loginRateLimiter,
	passwordResetRateLimit,
	bruteForceProtection,
} from "../middleware/rate-limit";
import { validate } from "../middleware/validate";
import {
	forgotPasswordSchema,
	loginSchema,
	refreshSchema,
	registerSchema,
	resetPasswordSchema,
} from "../validators/auth.validator";

const router = Router();

router.post(
	"/register",
	authRateLimiter,
	validate(registerSchema),
	authController.register.bind(authController),
);
router.post(
	"/login",
	loginRateLimiter,
	validate(loginSchema),
	bruteForceProtection,
	authController.login.bind(authController),
);
router.post(
	"/forgot-password",
	passwordResetRateLimit,
	validate(forgotPasswordSchema),
	authController.forgotPassword.bind(authController),
);
router.post(
	"/reset-password",
	passwordResetRateLimit,
	validate(resetPasswordSchema),
	authController.resetPassword.bind(authController),
);
router.post(
	"/refresh",
	authRateLimiter,
	validate(refreshSchema),
	authController.refresh.bind(authController),
);
router.get("/me", authenticate, authController.getMe.bind(authController));

export default router;
