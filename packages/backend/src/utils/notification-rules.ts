/**
 * Module 9 — Thông báo: các quy tắc quyết định cảnh báo/nhắc nhở.
 * Hàm THUẦN (không phụ thuộc DB/thời gian thực) để dễ kiểm thử và tái dùng trong
 * các scheduled job. Ngưỡng bám theo sheet "Logic" của đặc tả.
 */

/** Ngưỡng mặc định (phút). */
export const NO_SHOW_GRACE_MINUTES = 15; // không vào sau 15' từ giờ học → cảnh báo
export const LOGIN_NO_STUDY_GRACE_MINUTES = 10; // vào nhưng không học >10' → nguy cơ
export const CONSECUTIVE_ABSENCE_THRESHOLD = 2; // vắng 2 buổi liên tiếp
export const QUIZ_DECLINE_THRESHOLD = 3; // điểm giảm 3 buổi liên tiếp

/** Nhắc học hằng ngày: có buổi học hôm nay nhưng chưa học. */
export function shouldRemindDailyLearning(input: {
  hasLessonToday: boolean;
  hasStudiedToday: boolean;
}): boolean {
  return input.hasLessonToday && !input.hasStudiedToday;
}

/** Cảnh báo "không vào học" sau khoảng ân hạn kể từ giờ học theo lịch. */
export function shouldAlertNoShow(input: {
  scheduledStartMs: number;
  nowMs: number;
  hasStarted: boolean;
  graceMinutes?: number;
}): boolean {
  const grace = input.graceMinutes ?? NO_SHOW_GRACE_MINUTES;
  if (input.hasStarted) return false;
  return input.nowMs - input.scheduledStartMs >= grace * 60_000;
}

/** Cảnh báo "đăng nhập nhưng không học": có phiên nhưng học thật quá ít. */
export function shouldAlertLoginNoStudy(input: {
  hasSession: boolean;
  effectiveStudyMinutes: number;
  minStudyMinutes?: number;
}): boolean {
  const minStudy = input.minStudyMinutes ?? LOGIN_NO_STUDY_GRACE_MINUTES;
  if (!input.hasSession) return false;
  return input.effectiveStudyMinutes < minStudy;
}

/** Cảnh báo "sắp quên bài": có chủ đề trong vùng nguy cơ quên. */
export function shouldAlertForgetting(forgettingRiskTopics: string[]): boolean {
  return forgettingRiskTopics.filter((t) => t && t.trim().length > 0).length > 0;
}

/** Cảnh báo vắng liên tiếp. */
export function shouldAlertConsecutiveAbsences(
  consecutiveAbsences: number,
  threshold: number = CONSECUTIVE_ABSENCE_THRESHOLD,
): boolean {
  return consecutiveAbsences >= threshold;
}

/**
 * Cảnh báo điểm quiz giảm liên tiếp: chuỗi gần nhất giảm đều qua >= threshold buổi.
 * `recentPercentages` xếp theo thời gian TĂNG DẦN (cũ → mới).
 */
export function shouldAlertQuizDecline(
  recentPercentages: number[],
  threshold: number = QUIZ_DECLINE_THRESHOLD,
): boolean {
  const valid = recentPercentages.filter((p) => Number.isFinite(p));
  if (valid.length < threshold) return false;
  // Đếm số lần giảm liên tiếp tính từ cuối chuỗi.
  let declines = 0;
  for (let i = valid.length - 1; i > 0; i -= 1) {
    if (valid[i] < valid[i - 1]) {
      declines += 1;
    } else {
      break;
    }
  }
  return declines >= threshold - 1 && valid.length >= threshold;
}
