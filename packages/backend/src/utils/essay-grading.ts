/**
 * Module 2/5 — Chấm câu tự luận bằng AI (thay vì mặc định sai).
 * Tách phần chuẩn hóa kết quả + fallback thành hàm thuần/đơn vị nhỏ để kiểm thử,
 * và một hàm `gradeEssayAnswer` nhận grader (AI) qua tham số → dễ mock.
 */

export type EssayGradeStatus = "graded" | "pending";

export interface EssayGradeResult {
  status: EssayGradeStatus;
  is_correct: boolean;
  score: number;
  max_score: number;
  feedback: string;
}

/** Kết quả "chờ chấm" khi AI chưa cấu hình hoặc lỗi. */
export function essayGradePending(maxScore = 1): EssayGradeResult {
  return {
    status: "pending",
    is_correct: false,
    score: 0,
    max_score: maxScore,
    feedback: "Câu tự luận đang chờ chấm.",
  };
}

interface RawEssayGrade {
  score?: number | string | null;
  is_correct?: boolean | null;
  feedback?: string | null;
}

/** Chuẩn hóa kết quả thô từ AI thành EssayGradeResult an toàn (clamp điểm). */
export function normalizeEssayGrade(
  raw: RawEssayGrade | null | undefined,
  maxScore = 1,
): EssayGradeResult {
  const safeMax = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 1;
  const parsedScore = Number(raw?.score);
  const score = Number.isFinite(parsedScore)
    ? Math.max(0, Math.min(safeMax, parsedScore))
    : 0;
  const isCorrect =
    typeof raw?.is_correct === "boolean"
      ? raw.is_correct
      : score >= safeMax * 0.5;
  const feedback =
    typeof raw?.feedback === "string" && raw.feedback.trim().length > 0
      ? raw.feedback.trim()
      : "Đã chấm tự động.";
  return { status: "graded", is_correct: isCorrect, score, max_score: safeMax, feedback };
}

/**
 * Chấm 1 câu tự luận: gọi `grader` (AI). Nếu grader không có (AI tắt) hoặc ném
 * lỗi → trả "pending" (chờ chấm), KHÔNG mặc định là sai/0 vĩnh viễn.
 */
export async function gradeEssayAnswer(
  grader: (() => Promise<RawEssayGrade>) | null | undefined,
  maxScore = 1,
): Promise<EssayGradeResult> {
  if (!grader) return essayGradePending(maxScore);
  try {
    const raw = await grader();
    return normalizeEssayGrade(raw, maxScore);
  } catch {
    return essayGradePending(maxScore);
  }
}
