/**
 * Spec-based tests — Module 2/5: chấm tự luận AI + fallback "chờ chấm".
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  essayGradePending,
  gradeEssayAnswer,
  normalizeEssayGrade,
} from "./essay-grading";

describe("normalizeEssayGrade", () => {
  it("chuẩn hóa điểm + clamp theo max", () => {
    const r = normalizeEssayGrade({ score: 1.5, feedback: "Tốt" }, 2);
    assert.equal(r.status, "graded");
    assert.equal(r.score, 1.5);
    assert.equal(r.max_score, 2);
    assert.equal(r.feedback, "Tốt");
  });
  it("điểm vượt max → clamp; âm → 0", () => {
    assert.equal(normalizeEssayGrade({ score: 5 }, 2).score, 2);
    assert.equal(normalizeEssayGrade({ score: -1 }, 2).score, 0);
  });
  it("suy luận is_correct theo ngưỡng 50% khi AI không trả", () => {
    assert.equal(normalizeEssayGrade({ score: 2 }, 2).is_correct, true);
    assert.equal(normalizeEssayGrade({ score: 0.4 }, 2).is_correct, false);
  });
  it("tôn trọng is_correct AI cung cấp", () => {
    assert.equal(normalizeEssayGrade({ score: 0, is_correct: true }, 2).is_correct, true);
  });
  it("feedback rỗng → mặc định", () => {
    assert.equal(normalizeEssayGrade({ score: 1 }, 1).feedback, "Đã chấm tự động.");
  });
});

describe("gradeEssayAnswer", () => {
  it("không có grader (AI tắt) → pending", async () => {
    const r = await gradeEssayAnswer(null, 2);
    assert.equal(r.status, "pending");
    assert.equal(r.is_correct, false);
    assert.equal(r.max_score, 2);
  });
  it("grader lỗi → pending (không phạt thành sai vĩnh viễn)", async () => {
    const r = await gradeEssayAnswer(async () => {
      throw new Error("AI down");
    }, 1);
    assert.equal(r.status, "pending");
  });
  it("grader ok → graded chuẩn hóa", async () => {
    const r = await gradeEssayAnswer(async () => ({ score: 1, is_correct: true, feedback: "Đúng" }), 1);
    assert.equal(r.status, "graded");
    assert.equal(r.is_correct, true);
    assert.equal(r.score, 1);
  });
});

describe("essayGradePending", () => {
  it("trả trạng thái chờ chấm với max chỉ định", () => {
    const r = essayGradePending(3);
    assert.equal(r.status, "pending");
    assert.equal(r.max_score, 3);
    assert.equal(r.score, 0);
  });
});
