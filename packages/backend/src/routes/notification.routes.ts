import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../middleware/auth";
import { pushSubscriptionRepository } from "../models/push-subscription.model";
import { pushService } from "../services/push.service";

const router = Router();

// ── POST /api/notifications/push/subscribe ──────────────────────────────
// Register a new push subscription for the authenticated user.

router.post(
	"/push/subscribe",
	authenticate,
	async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const userId = req.user?.id;
			if (!userId) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}

			const { endpoint, keys, expiration_time, user_agent } = req.body;

			// Validate required fields
			if (!endpoint || typeof endpoint !== "string") {
				res.status(400).json({
					success: false,
					error: "endpoint is required and must be a string",
				});
				return;
			}

			if (
				!keys ||
				typeof keys !== "object" ||
				typeof keys.p256dh !== "string" ||
				typeof keys.auth !== "string"
			) {
				res.status(400).json({
					success: false,
					error: "keys.p256dh and keys.auth are required strings",
				});
				return;
			}

			const subscription = await pushSubscriptionRepository.upsertSubscription({
				user_id: userId,
				endpoint: endpoint.trim(),
				keys: {
					p256dh: keys.p256dh,
					auth: keys.auth,
				},
				expiration_time: expiration_time ?? null,
				user_agent: user_agent ?? req.headers["user-agent"] ?? null,
			});

			res.status(201).json({
				success: true,
				data: {
					id: subscription._id.toString(),
					endpoint: subscription.endpoint,
					is_active: subscription.is_active,
					createdAt: subscription.createdAt,
				},
			});
		} catch (error) {
			next(error);
		}
	},
);

// ── DELETE /api/notifications/push/subscribe ─────────────────────────────
// Unsubscribe (deactivate) a push subscription by endpoint.

router.delete(
	"/push/subscribe",
	authenticate,
	async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const userId = req.user?.id;
			if (!userId) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}

			const { endpoint } = req.body;

			if (!endpoint || typeof endpoint !== "string") {
				res.status(400).json({
					success: false,
					error: "endpoint is required and must be a string",
				});
				return;
			}

			// Verify the subscription belongs to this user before deactivating
			const existing = await pushSubscriptionRepository.findByEndpoint(endpoint.trim());

			if (!existing) {
				res.status(404).json({
					success: false,
					error: "Subscription not found",
				});
				return;
			}

			if (existing.user_id.toString() !== userId) {
				res.status(403).json({
					success: false,
					error: "Forbidden",
				});
				return;
			}

			await pushSubscriptionRepository.deactivateByEndpoint(endpoint.trim());

			res.status(200).json({
				success: true,
				message: "Subscription deactivated",
			});
		} catch (error) {
			next(error);
		}
	},
);

// ── GET /api/notifications/push/vapid-public-key ────────────────────────
// Return the VAPID public key for client-side subscription setup.

router.get(
	"/push/vapid-public-key",
	authenticate,
	(req: Request, res: Response): void => {
		res.status(200).json({
			success: true,
			data: {
				vapid_public_key: pushService.getVapidPublicKey(),
			},
		});
	},
);

export default router;
