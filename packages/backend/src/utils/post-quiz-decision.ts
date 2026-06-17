/**
 * Module 5 — Kiểm tra cuối buổi: sau khi chấm, hệ thống đề xuất rõ ràng:
 *   ≥ 70%  → "advance" (học bài tiếp)
 *   < 70%  → "review"  (ôn lại phần yếu)
 *
 * Hàm thuần (không phụ thuộc DB) để dễ kiểm thử và tái dùng.
 */

export const POST_QUIZ_ADVANCE_THRESHOLD = 70;

export type PostQuizAction = "advance" | "review";

export interface PostQuizDecision {
  action: PostQuizAction;
  threshold: number;
  /** Nhãn tiếng Việt để hiển thị CTA. */
  label: string;
  message: string;
}

export function decidePostQuizAction(
  percentage: number | null | undefined,
  threshold: number = POST_QUIZ_ADVANCE_THRESHOLD,
): PostQuizDecision {
  const pct = Number.isFinite(percentage as number) ? (percentage as number) : 0;
  if (pct >= threshold) {
    return {
      action: "advance",
      threshold,
      label: "Học bài tiếp",
      message: "Bạn đã nắm tốt bài này. Tiếp tục bài học mới nhé!",
    };
  }
  return {
    action: "review",
    threshold,
    label: "Ôn lại phần yếu",
    message: "Hãy ôn lại phần còn yếu trước khi sang bài mới.",
  };
}
