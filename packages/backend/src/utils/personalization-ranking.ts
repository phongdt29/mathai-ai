/**
 * Module 8 — Cá nhân hóa nội dung theo sở thích.
 * Hàm thuần (không phụ thuộc DB) để xếp ưu tiên bài học theo sở thích học sinh
 * và rút trích "nhóm kiến thức yếu" top-N cho dashboard.
 */

export interface RankableLesson {
  lesson_title?: string | null;
  lesson_objective?: string | null;
  topic?: string | null;
}

/** Tách chuỗi sở thích "bóng đá, game" → ["bóng đá","game"] (chuẩn hóa thường). */
export function parseInterests(interests: string | null | undefined): string[] {
  if (!interests) return [];
  return interests
    .split(/[,;/|]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

function lessonHaystack(lesson: RankableLesson): string {
  return [lesson.lesson_title, lesson.lesson_objective, lesson.topic]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Số sở thích khớp với 1 bài học (dùng làm điểm ưu tiên). */
export function interestMatchScore(
  lesson: RankableLesson,
  interests: string[],
): number {
  if (interests.length === 0) return 0;
  const hay = lessonHaystack(lesson);
  let score = 0;
  for (const interest of interests) {
    if (interest && hay.includes(interest)) score += 1;
  }
  return score;
}

/**
 * Xếp lại danh sách bài học: bài khớp sở thích lên trước, GIỮ THỨ TỰ TƯƠNG ĐỐI
 * (stable sort) trong cùng mức điểm. Không đột biến mảng gốc.
 */
export function rankLessonsByInterest<T extends RankableLesson>(
  lessons: T[],
  interests: string | string[] | null | undefined,
): T[] {
  const parsed = Array.isArray(interests) ? interests.map((s) => s.toLowerCase()) : parseInterests(interests);
  if (parsed.length === 0) return [...lessons];

  return lessons
    .map((lesson, index) => ({
      lesson,
      index,
      score: interestMatchScore(lesson, parsed),
    }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map((entry) => entry.lesson);
}

export interface MasteryLike {
  topic?: string | null;
  mastery_level?: number | string | null;
}

export interface WeakTopic {
  topic: string;
  mastery: number;
}

/**
 * Lấy top-N chủ đề yếu nhất (mastery thấp nhất) để hiển thị trực quan.
 * Bỏ qua topic rỗng; sắp xếp tăng dần theo mastery.
 */
export function topWeakTopics(
  masteries: MasteryLike[],
  limit = 3,
  masteryThreshold = 100,
): WeakTopic[] {
  return masteries
    .map((m) => ({
      topic: (m.topic ?? "").trim(),
      mastery: Number(m.mastery_level ?? 0),
    }))
    .filter((m) => m.topic.length > 0 && m.mastery < masteryThreshold)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, Math.max(0, limit));
}

/**
 * Module 7 — chọn chủ đề "luyện thêm theo điểm yếu" cho bài tương tự của Solver.
 * Ưu tiên chủ đề yếu nhất; nếu trùng chủ đề hiện tại thì lấy chủ đề yếu kế tiếp;
 * không có dữ liệu yếu thì trả về chủ đề hiện tại (fallback).
 */
export function chooseWeakPracticeTopic(
  masteries: MasteryLike[],
  currentTopic?: string | null,
): string | null {
  const weak = topWeakTopics(masteries, 5);
  const current = (currentTopic ?? "").trim().toLowerCase();
  const different = weak.find((w) => w.topic.toLowerCase() !== current);
  if (different) return different.topic;
  if (weak.length > 0) return weak[0].topic;
  return currentTopic ?? null;
}
