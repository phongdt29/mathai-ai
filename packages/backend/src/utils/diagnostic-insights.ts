/**
 * Module 2 — Output đặc tả của bài kiểm tra đầu vào: ngoài "nhóm kiến thức yếu",
 * cần xuất rõ "tốc độ làm bài" và "mức độ hiểu". Hàm thuần, không phụ thuộc DB.
 */

export type AnswerSpeed = "fast" | "normal" | "slow";
export type ComprehensionLevel = "beginner" | "intermediate" | "advanced";

/** Ngưỡng giây/câu (mặc định) để phân loại tốc độ làm bài. */
export const SPEED_FAST_MAX_SECONDS = 45;
export const SPEED_SLOW_MIN_SECONDS = 120;

/**
 * Phân loại tốc độ làm bài theo thời gian trung bình mỗi câu (giây).
 * < 45s: nhanh · 45–120s: bình thường · > 120s: chậm. Null → "normal".
 */
export function classifySpeed(
  timePerQuestionSeconds: number | null | undefined,
  options: { fastMax?: number; slowMin?: number } = {},
): AnswerSpeed {
  const fastMax = options.fastMax ?? SPEED_FAST_MAX_SECONDS;
  const slowMin = options.slowMin ?? SPEED_SLOW_MIN_SECONDS;
  if (!Number.isFinite(timePerQuestionSeconds as number)) return "normal";
  const t = timePerQuestionSeconds as number;
  if (t <= 0) return "normal";
  if (t < fastMax) return "fast";
  if (t > slowMin) return "slow";
  return "normal";
}

export const SPEED_LABELS: Record<AnswerSpeed, string> = {
  fast: "Nhanh",
  normal: "Bình thường",
  slow: "Chậm",
};

export const COMPREHENSION_LABELS: Record<ComprehensionLevel, string> = {
  beginner: "Mới bắt đầu",
  intermediate: "Khá ổn",
  advanced: "Vững",
};

/**
 * Mức độ hiểu = độ chính xác trung bình theo chủ đề (0–100) có hiệu chỉnh bởi độ
 * ổn định (0–1): điểm ổn định cao thì giữ nguyên, thiếu ổn định thì hạ nhẹ.
 *   score = accuracyAvg * (0.6 + 0.4 * stability)
 *   ≥ 75 → advanced · ≥ 50 → intermediate · còn lại → beginner
 */
export function computeComprehensionLevel(
  topicAccuracyAvg: number | null | undefined,
  stability: number | null | undefined,
): ComprehensionLevel {
  const acc = Number.isFinite(topicAccuracyAvg as number)
    ? Math.max(0, Math.min(100, topicAccuracyAvg as number))
    : 0;
  const stab = Number.isFinite(stability as number)
    ? Math.max(0, Math.min(1, stability as number))
    : 0.5;
  const score = acc * (0.6 + 0.4 * stab);
  if (score >= 75) return "advanced";
  if (score >= 50) return "intermediate";
  return "beginner";
}

/** Trung bình cộng các giá trị độ chính xác theo chủ đề (0–100). */
export function averageAccuracy(values: number[]): number {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return 0;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}
