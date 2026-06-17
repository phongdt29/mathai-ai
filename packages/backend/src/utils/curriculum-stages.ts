/**
 * Lộ trình học 4 giai đoạn theo đặc tả Module 3:
 *   GĐ1 Ôn nền tảng → GĐ2 Củng cố → GĐ3 Nâng cao → GĐ4 Luyện đề.
 *
 * Hàm thuần (không phụ thuộc DB) để gán giai đoạn cho từng module theo thứ tự,
 * và để hiển thị nhãn tiếng Việt ở frontend.
 */

export type CurriculumStage =
  | "foundation"
  | "consolidation"
  | "advanced"
  | "practice";

export const CURRICULUM_STAGE_ORDER: readonly CurriculumStage[] = [
  "foundation",
  "consolidation",
  "advanced",
  "practice",
];

export const CURRICULUM_STAGE_LABELS: Record<CurriculumStage, string> = {
  foundation: "Giai đoạn 1: Ôn lại nền tảng",
  consolidation: "Giai đoạn 2: Củng cố kiến thức",
  advanced: "Giai đoạn 3: Nâng cao",
  practice: "Giai đoạn 4: Luyện đề",
};

/** Nhãn ngắn gọn để hiển thị badge. */
export const CURRICULUM_STAGE_SHORT_LABELS: Record<CurriculumStage, string> = {
  foundation: "Ôn nền tảng",
  consolidation: "Củng cố",
  advanced: "Nâng cao",
  practice: "Luyện đề",
};

export function curriculumStageLabel(stage: CurriculumStage | null | undefined): string {
  if (!stage) return "";
  return CURRICULUM_STAGE_LABELS[stage] ?? "";
}

/**
 * Gán giai đoạn cho `count` module theo thứ tự, đảm bảo:
 * - Phủ đủ 4 giai đoạn theo trình tự khi có thể.
 * - Module cuối luôn là "practice" (luyện đề) khi count >= 2.
 * - Khi count > 4: các module giữa kéo giãn đều qua 4 giai đoạn, vẫn kết thúc ở practice.
 * - Khi count < 4: lấy các giai đoạn đầu theo thứ tự, nhưng module cuối vẫn là practice
 *   nếu count >= 2 (để luôn có buổi luyện đề khép lộ trình).
 */
export function mapModulesToStages(count: number): CurriculumStage[] {
  if (!Number.isFinite(count) || count <= 0) return [];
  if (count === 1) return ["foundation"];

  const stages: CurriculumStage[] = [];
  for (let i = 0; i < count; i += 1) {
    if (i === count - 1) {
      // Module cuối luôn là "luyện đề" để khép lộ trình.
      stages.push("practice");
      continue;
    }
    // Các module trước: foundation → consolidation → advanced (giữ ở advanced nếu dư).
    stages.push(CURRICULUM_STAGE_ORDER[Math.min(i, 2)]);
  }
  return stages;
}
