import { type Request, type Response, type NextFunction, Router } from "express";
import { authenticate } from "../middleware/auth";
import { analyticsCohortRetentionRepo } from "../models/analytics-cohort-retention.model";
import { analyticsDailyRevenueRepo } from "../models/analytics-daily-revenue.model";
import { analyticsLessonEngagementRepo } from "../models/analytics-lesson-engagement.model";
import { analyticsDailyUserActivityRepo } from "../models/analytics-daily-user-activity.model";
import { ForbiddenError, ValidationError } from "../utils/errors";

const router = Router();
router.use(authenticate);

// ── Middleware: ensure admin role ───────────────────────────────────────

function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return next(
      new ForbiddenError(
        "Chỉ quản trị viên mới có quyền truy cập analytics",
      ),
    );
  }
  next();
}

router.use(requireAdmin);

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Get default date range: last 30 days in ICT.
 */
function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const ictNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);

  const to = formatDateICT(ictNow);

  const from30 = new Date(ictNow.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = formatDateICT(from30);

  return { from, to };
}

function formatDateICT(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Validate date string format YYYY-MM-DD.
 */
function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
}

/**
 * Parse from/to query params with defaults.
 */
function parseDateRange(query: Record<string, unknown>): { from: string; to: string } {
  const defaults = getDefaultDateRange();
  const from = typeof query.from === "string" && isValidDate(query.from) ? query.from : defaults.from;
  const to = typeof query.to === "string" && isValidDate(query.to) ? query.to : defaults.to;
  return { from, to };
}

// ══════════════════════════════════════════════════════════════════════════
// GET /api/admin/analytics/cohorts — cohort retention data
// ══════════════════════════════════════════════════════════════════════════

router.get("/cohorts", async (req, res, next) => {
  try {
    const fromWeek = typeof req.query.from_week === "string" ? req.query.from_week : undefined;
    const toWeek = typeof req.query.to_week === "string" ? req.query.to_week : undefined;

    let data;
    if (fromWeek && toWeek) {
      // Validate week format (e.g. "2024-W01")
      const weekPattern = /^\d{4}-W\d{2}$/;
      if (!weekPattern.test(fromWeek) || !weekPattern.test(toWeek)) {
        throw new ValidationError("from_week and to_week must be in format YYYY-Wnn");
      }
      data = await analyticsCohortRetentionRepo.findByCohortRange(fromWeek, toWeek);
    } else if (fromWeek) {
      const weekPattern = /^\d{4}-W\d{2}$/;
      if (!weekPattern.test(fromWeek)) {
        throw new ValidationError("from_week must be in format YYYY-Wnn");
      }
      data = await analyticsCohortRetentionRepo.findByCohortWeek(fromWeek);
    } else {
      // Default: last 12 weeks
      const now = new Date();
      const ictNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      const toWeekStr = getISOWeekString(ictNow);
      const from12Weeks = new Date(ictNow.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
      const fromWeekStr = getISOWeekString(from12Weeks);
      data = await analyticsCohortRetentionRepo.findByCohortRange(fromWeekStr, toWeekStr);
    }

    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// GET /api/admin/analytics/revenue — daily revenue data
// ══════════════════════════════════════════════════════════════════════════

router.get("/revenue", async (req, res, next) => {
  try {
    const { from, to } = parseDateRange(req.query as Record<string, unknown>);
    const data = await analyticsDailyRevenueRepo.findByDateRange(from, to);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// GET /api/admin/analytics/engagement — lesson engagement data
// ══════════════════════════════════════════════════════════════════════════

router.get("/engagement", async (req, res, next) => {
  try {
    const { from, to } = parseDateRange(req.query as Record<string, unknown>);
    const lessonId = typeof req.query.lesson_id === "string" ? req.query.lesson_id : undefined;
    const data = await analyticsLessonEngagementRepo.findByDateRange(from, to, lessonId);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// GET /api/admin/analytics/users — daily user activity data
// ══════════════════════════════════════════════════════════════════════════

router.get("/users", async (req, res, next) => {
  try {
    const { from, to } = parseDateRange(req.query as Record<string, unknown>);
    const role = typeof req.query.role === "string" ? req.query.role : undefined;
    const validRoles = ["student", "parent", "teacher", "admin", "staff"];
    const filterRole = role && validRoles.includes(role) ? role as any : undefined;
    const data = await analyticsDailyUserActivityRepo.findByDateRange(from, to, filterRole);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// ── Helper: ISO week string ─────────────────────────────────────────────

function getISOWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export default router;
