import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { requireScopedAccess } from "../middleware/scoped-authorization";
import { validate } from "../middleware/validate";
import { parentMonitoringService } from "../services/parent-monitoring.service";
import { successResponse } from "../utils/response";
import { linkChildSchema, updatePreferencesSchema } from "../validators/parent.validator";

const router = Router();

router.use(authenticate, requireRole("parent"));

// GET /api/parent/children - Danh sách con
router.get("/children", async (req, res, next) => {
	try {
		const children = await parentMonitoringService.getChildren(
			String(req.user!.id),
		);
		successResponse(res, children, "Lấy danh sách con thành công");
	} catch (error: unknown) {
		next(error);
	}
});

// POST /api/parent/children/link - Liên kết phụ huynh với học sinh đã xác minh
router.post(
	"/children/link",
	validate(linkChildSchema),
	async (req, res, next) => {
		try {
			const child = await parentMonitoringService.linkChild(
				String(req.user!.id),
				req.body,
			);
			successResponse(
				res,
				child,
				"Liên kết học sinh thành công",
				undefined,
				201,
			);
		} catch (error: unknown) {
			next(error);
		}
	},
);

// DELETE /api/parent/children/:studentId - Hủy liên kết phụ huynh với học sinh
router.delete(
	"/children/:studentId",
	requireScopedAccess({
		resourceType: "student",
		action: "delete",
		resourceId: { source: "params", field: "studentId" },
	}),
	async (req, res, next) => {
		try {
			const child = await parentMonitoringService.unlinkChild(
				String(req.user!.id),
				String(req.params.studentId),
			);
			successResponse(res, child, "Hủy liên kết học sinh thành công");
		} catch (error: unknown) {
			next(error);
		}
	},
);

// GET /api/parent/children/:studentId/dashboard - Dashboard cho phụ huynh
router.get(
	"/children/:studentId/dashboard",
	requireScopedAccess({
		resourceType: "student",
		action: "read",
		resourceId: { source: "params", field: "studentId" },
	}),
	async (req, res, next) => {
		try {
			const studentId = req.params.studentId;
			const dashboard = await parentMonitoringService.getDashboard(
				String(req.user!.id) as any,
				studentId as any,
			);
			successResponse(res, dashboard, "Lấy dashboard thành công");
		} catch (error: unknown) {
			next(error);
		}
	},
);

// GET /api/parent/reports/weekly - Báo cáo tuần cho phụ huynh
router.get("/reports/weekly", async (req, res, next) => {
	try {
		const rangeDays = Number(req.query.range_days) || 7;
		const report = await parentMonitoringService.getWeeklyReport(
			String(req.user!.id),
			rangeDays,
		);
		successResponse(res, report, "Lấy báo cáo tuần thành công");
	} catch (error: unknown) {
		next(error);
	}
});

// GET /api/parent/notifications - Danh sách thông báo
router.get("/notifications", async (req, res, next) => {
	try {
		const limit = Number(req.query.limit) || 20;
		const notifications = await parentMonitoringService.getNotifications(
			String(req.user!.id) as any,
			limit,
		);
		successResponse(res, notifications, "Lấy thông báo thành công");
	} catch (error: unknown) {
		next(error);
	}
});

// GET /api/parent/notifications/unread - Thông báo chưa đọc
router.get("/notifications/unread", async (req, res, next) => {
	try {
		const notifications = await parentMonitoringService.getUnreadNotifications(
			String(req.user!.id) as any,
		);
		successResponse(res, notifications, "Lấy thông báo chưa đọc thành công");
	} catch (error: unknown) {
		next(error);
	}
});

// POST /api/parent/notifications/:id/read - Đánh dấu đã đọc
router.post("/notifications/:id/read", async (req, res, next) => {
	try {
		await parentMonitoringService.markNotificationRead(
			String(req.user!.id) as any,
			req.params.id as any,
		);
		successResponse(res, null, "Đã đánh dấu đã đọc");
	} catch (error: unknown) {
		next(error);
	}
});

// POST /api/parent/notifications/read-all - Đánh dấu tất cả đã đọc
router.post("/notifications/read-all", async (req, res, next) => {
	try {
		await parentMonitoringService.markAllNotificationsRead(
			String(req.user!.id) as any,
		);
		successResponse(res, null, "Đã đánh dấu tất cả đã đọc");
	} catch (error: unknown) {
		next(error);
	}
});

// GET /api/parent/preferences - Cài đặt thông báo
router.get("/preferences", async (req, res, next) => {
	try {
		const prefs = await parentMonitoringService.getPreferences(
			String(req.user!.id) as any,
		);
		successResponse(res, prefs, "Lấy cài đặt thông báo thành công");
	} catch (error: unknown) {
		next(error);
	}
});

// PUT /api/parent/preferences - Cập nhật cài đặt thông báo
router.put("/preferences", validate(updatePreferencesSchema), async (req, res, next) => {
	try {
		const prefs = await parentMonitoringService.updatePreferences(
			String(req.user!.id) as any,
			req.body,
		);
		successResponse(res, prefs, "Cập nhật cài đặt thông báo thành công");
	} catch (error: unknown) {
		next(error);
	}
});

export default router;
