import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { gamificationService } from "../services/gamification.service";
import { badgeRepository } from "../models/badge.model";
import { auditService } from "../services/audit.service";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors";

const router = Router();

// ══════════════════════════════════════════════════════════════════════════
// Student gamification routes (require student role)
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/students/me/badges ─────────────────────────────────────────
// List all badges earned by the authenticated student, joined with Badge metadata.
// Requirement 12.9

router.get(
  "/students/me/badges",
  authenticate,
  requireRole("student"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      // Resolve student profile ID from user
      const studentId = await resolveStudentProfileId(userId);
      const badges = await gamificationService.listStudentBadges(studentId);

      res.status(200).json({
        success: true,
        data: badges,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── GET /api/students/me/streak ─────────────────────────────────────────
// Get the authenticated student's current streak information.

router.get(
  "/students/me/streak",
  authenticate,
  requireRole("student"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const studentId = await resolveStudentProfileId(userId);
      const streak = await gamificationService.getStreak(studentId);

      res.status(200).json({
        success: true,
        data: streak,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── GET /api/students/me/gamification ───────────────────────────────────
// Get the full gamification profile (streak + badges + totalBadges).

router.get(
  "/students/me/gamification",
  authenticate,
  requireRole("student"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const studentId = await resolveStudentProfileId(userId);
      const profile =
        await gamificationService.getStudentGamificationProfile(studentId);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ══════════════════════════════════════════════════════════════════════════
// Leaderboard route (authenticated, any role can view)
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/leaderboard ────────────────────────────────────────────────
// Get leaderboard snapshot by scope, scope_id, period, period_key.
// Requirement 12.10

router.get(
  "/leaderboard",
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { scope, scope_id, period, period_key } = req.query;

      // Validate required query params
      if (!scope || typeof scope !== "string") {
        res.status(400).json({
          success: false,
          error: "Query parameter 'scope' is required (global|class|grade)",
        });
        return;
      }

      if (!["global", "class", "grade"].includes(scope)) {
        res.status(400).json({
          success: false,
          error: "scope must be one of: global, class, grade",
        });
        return;
      }

      if (!period || typeof period !== "string") {
        res.status(400).json({
          success: false,
          error:
            "Query parameter 'period' is required (weekly|monthly|all_time)",
        });
        return;
      }

      if (!["weekly", "monthly", "all_time"].includes(period)) {
        res.status(400).json({
          success: false,
          error: "period must be one of: weekly, monthly, all_time",
        });
        return;
      }

      if (!period_key || typeof period_key !== "string") {
        res.status(400).json({
          success: false,
          error:
            "Query parameter 'period_key' is required (e.g. '2026-W21' or '2026-05' or 'all_time')",
        });
        return;
      }

      const scopeId =
        scope_id && typeof scope_id === "string" ? scope_id : null;

      const snapshot = await gamificationService.getLeaderboard(
        scope as "global" | "class" | "grade",
        scopeId,
        period as "weekly" | "monthly" | "all_time",
        period_key as string,
      );

      // Return rankings or empty array if snapshot doesn't exist (Requirement 12.10)
      res.status(200).json({
        success: true,
        data: snapshot
          ? {
              scope: snapshot.scope,
              scope_id: snapshot.scope_id,
              period: snapshot.period,
              period_key: snapshot.period_key,
              rankings: snapshot.rankings,
              generated_at: snapshot.generated_at,
            }
          : {
              scope,
              scope_id: scopeId,
              period,
              period_key,
              rankings: [],
              generated_at: null,
            },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ══════════════════════════════════════════════════════════════════════════
// Admin gamification routes (require admin role)
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/gamification/badges ───────────────────────────────────
// List all badges (active and inactive) for admin management.

router.get(
  "/admin/gamification/badges",
  authenticate,
  requireAdminOnly,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const badges = await badgeRepository.model
        .find()
        .sort({ category: 1, name: 1 })
        .exec();

      res.status(200).json({
        success: true,
        data: badges,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── POST /api/admin/gamification/badges ──────────────────────────────────
// Create a new badge. Requirement 12.12

router.post(
  "/admin/gamification/badges",
  authenticate,
  requireAdminOnly,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        badge_id,
        name,
        description,
        icon_url,
        category,
        rarity,
        criteria,
        reward_points,
        is_active,
      } = req.body;

      // Validate required fields
      if (!badge_id || typeof badge_id !== "string") {
        throw new ValidationError("badge_id is required");
      }
      if (!name || typeof name !== "string") {
        throw new ValidationError("name is required");
      }
      if (!description || typeof description !== "string") {
        throw new ValidationError("description is required");
      }
      if (!icon_url || typeof icon_url !== "string") {
        throw new ValidationError("icon_url is required");
      }
      if (
        !category ||
        !["engagement", "mastery", "solver", "social", "special"].includes(
          category,
        )
      ) {
        throw new ValidationError(
          "category must be one of: engagement, mastery, solver, social, special",
        );
      }
      if (
        !rarity ||
        !["common", "uncommon", "rare", "legendary"].includes(rarity)
      ) {
        throw new ValidationError(
          "rarity must be one of: common, uncommon, rare, legendary",
        );
      }
      if (
        !criteria ||
        typeof criteria !== "object" ||
        !criteria.type ||
        typeof criteria.threshold !== "number"
      ) {
        throw new ValidationError(
          "criteria must include type (string) and threshold (number)",
        );
      }

      const badge = await badgeRepository.create({
        badge_id: badge_id.trim(),
        name: name.trim(),
        description: description.trim(),
        icon_url: icon_url.trim(),
        category,
        rarity,
        criteria,
        reward_points: reward_points ?? 0,
        is_active: is_active !== false,
      } as any);

      // Audit log (Requirement 12.12)
      await auditService.recordFromRequest(req, {
        action: "gamification.badge.upsert",
        resourceType: "badge",
        resourceId: badge.badge_id,
        before: null,
        after: { badge_id: badge.badge_id, name: badge.name, category },
        result: "success",
        metadata: { category, rarity },
      });

      res.status(201).json({
        success: true,
        data: badge,
        message: "Đã tạo badge",
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── PUT /api/admin/gamification/badges/:badgeId ─────────────────────────
// Update an existing badge. Requirement 12.12

router.put(
  "/admin/gamification/badges/:badgeId",
  authenticate,
  requireAdminOnly,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { badgeId } = req.params;
      const existing = await badgeRepository.findByBadgeId(badgeId);
      if (!existing) {
        throw new NotFoundError(`Badge "${badgeId}" not found`);
      }

      const before = existing.toObject ? existing.toObject() : existing;

      const allowedFields = [
        "name",
        "description",
        "icon_url",
        "category",
        "rarity",
        "criteria",
        "reward_points",
        "is_active",
      ];
      const update: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          update[field] = req.body[field];
        }
      }

      // Validate category if provided
      if (
        update.category &&
        !["engagement", "mastery", "solver", "social", "special"].includes(
          update.category as string,
        )
      ) {
        throw new ValidationError(
          "category must be one of: engagement, mastery, solver, social, special",
        );
      }

      // Validate rarity if provided
      if (
        update.rarity &&
        !["common", "uncommon", "rare", "legendary"].includes(
          update.rarity as string,
        )
      ) {
        throw new ValidationError(
          "rarity must be one of: common, uncommon, rare, legendary",
        );
      }

      const updated = await badgeRepository.model
        .findOneAndUpdate({ badge_id: badgeId }, { $set: update }, { new: true })
        .exec();

      // Audit log (Requirement 12.12)
      await auditService.recordFromRequest(req, {
        action: "gamification.badge.upsert",
        resourceType: "badge",
        resourceId: badgeId,
        before,
        after: updated,
        result: "success",
        metadata: { updated_fields: Object.keys(update) },
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: "Đã cập nhật badge",
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── PUT /api/admin/gamification/badges/:badgeId/deactivate ──────────────
// Deactivate a badge. Requirement 12.12

router.put(
  "/admin/gamification/badges/:badgeId/deactivate",
  authenticate,
  requireAdminOnly,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { badgeId } = req.params;
      const existing = await badgeRepository.findByBadgeId(badgeId);
      if (!existing) {
        throw new NotFoundError(`Badge "${badgeId}" not found`);
      }

      const before = { is_active: existing.is_active };

      const updated = await badgeRepository.model
        .findOneAndUpdate(
          { badge_id: badgeId },
          { $set: { is_active: false } },
          { new: true },
        )
        .exec();

      // Audit log (Requirement 12.12)
      await auditService.recordFromRequest(req, {
        action: "gamification.badge.deactivate",
        resourceType: "badge",
        resourceId: badgeId,
        before,
        after: { is_active: false },
        result: "success",
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: "Đã vô hiệu hóa badge",
      });
    } catch (error) {
      next(error);
    }
  },
);

// ══════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════

/**
 * Middleware: require admin role.
 */
function requireAdminOnly(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.user?.role !== "admin") {
    return next(
      new ForbiddenError(
        "Chỉ quản trị viên mới có quyền thực hiện thao tác này",
      ),
    );
  }
  next();
}

/**
 * Resolve student profile ID from user ID.
 * Looks up StudentProfile by user_id field.
 */
async function resolveStudentProfileId(userId: string): Promise<string> {
  // Dynamic import to avoid circular dependency
  const { StudentProfileModel } = await import("../models/student.model");
  const profile = await StudentProfileModel.findOne({ user_id: userId })
    .select("_id")
    .lean();
  if (!profile) {
    throw new NotFoundError("Không tìm thấy hồ sơ học sinh");
  }
  return String(profile._id);
}

export default router;
