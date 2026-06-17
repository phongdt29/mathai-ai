/**
 * Spec-based tests — Module 3: lộ trình học 4 giai đoạn
 * (Ôn nền tảng → Củng cố → Nâng cao → Luyện đề).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CURRICULUM_STAGE_LABELS,
  curriculumStageLabel,
  mapModulesToStages,
} from "./curriculum-stages";

describe("mapModulesToStages", () => {
  it("4 module → đúng 4 giai đoạn theo thứ tự đặc tả", () => {
    assert.deepEqual(mapModulesToStages(4), [
      "foundation",
      "consolidation",
      "advanced",
      "practice",
    ]);
  });

  it("module cuối luôn là 'practice' (luyện đề) khi có ≥2 module", () => {
    for (const n of [2, 3, 4, 5, 6, 10]) {
      const stages = mapModulesToStages(n);
      assert.equal(stages.length, n);
      assert.equal(stages[stages.length - 1], "practice", `count=${n}`);
    }
  });

  it("3 module → foundation, consolidation, practice", () => {
    assert.deepEqual(mapModulesToStages(3), [
      "foundation",
      "consolidation",
      "practice",
    ]);
  });

  it("2 module → foundation, practice", () => {
    assert.deepEqual(mapModulesToStages(2), ["foundation", "practice"]);
  });

  it("1 module → chỉ foundation (không ép practice)", () => {
    assert.deepEqual(mapModulesToStages(1), ["foundation"]);
  });

  it(">4 module → giữ ở 'advanced' cho các module giữa, vẫn kết thúc practice", () => {
    assert.deepEqual(mapModulesToStages(6), [
      "foundation",
      "consolidation",
      "advanced",
      "advanced",
      "advanced",
      "practice",
    ]);
  });

  it("count không hợp lệ → mảng rỗng", () => {
    assert.deepEqual(mapModulesToStages(0), []);
    assert.deepEqual(mapModulesToStages(-3), []);
    assert.deepEqual(mapModulesToStages(Number.NaN), []);
  });
});

describe("curriculumStageLabel", () => {
  it("trả nhãn tiếng Việt đúng cho từng giai đoạn", () => {
    assert.equal(curriculumStageLabel("foundation"), CURRICULUM_STAGE_LABELS.foundation);
    assert.equal(curriculumStageLabel("practice"), "Giai đoạn 4: Luyện đề");
  });

  it("null/undefined → chuỗi rỗng", () => {
    assert.equal(curriculumStageLabel(null), "");
    assert.equal(curriculumStageLabel(undefined), "");
  });
});
