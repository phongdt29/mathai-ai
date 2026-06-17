/**
 * Spec-based tests — Module 5: đề xuất sau quiz cuối buổi (≥70% tiếp / <70% ôn).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  decidePostQuizAction,
  POST_QUIZ_ADVANCE_THRESHOLD,
} from "./post-quiz-decision";

describe("decidePostQuizAction", () => {
  it("≥ 70% → advance (học bài tiếp)", () => {
    for (const pct of [70, 75, 100]) {
      assert.equal(decidePostQuizAction(pct).action, "advance", `pct=${pct}`);
    }
  });

  it("< 70% → review (ôn lại)", () => {
    for (const pct of [0, 50, 69, 69.9]) {
      assert.equal(decidePostQuizAction(pct).action, "review", `pct=${pct}`);
    }
  });

  it("biên đúng tại ngưỡng mặc định 70", () => {
    assert.equal(POST_QUIZ_ADVANCE_THRESHOLD, 70);
    assert.equal(decidePostQuizAction(69.99).action, "review");
    assert.equal(decidePostQuizAction(70).action, "advance");
  });

  it("giá trị null/undefined/không hợp lệ → review (an toàn)", () => {
    assert.equal(decidePostQuizAction(null).action, "review");
    assert.equal(decidePostQuizAction(undefined).action, "review");
    assert.equal(decidePostQuizAction(Number.NaN).action, "review");
  });

  it("cho phép tùy biến ngưỡng", () => {
    assert.equal(decidePostQuizAction(80, 85).action, "review");
    assert.equal(decidePostQuizAction(85, 85).action, "advance");
  });

  it("trả nhãn + thông điệp tiếng Việt", () => {
    assert.equal(decidePostQuizAction(90).label, "Học bài tiếp");
    assert.equal(decidePostQuizAction(40).label, "Ôn lại phần yếu");
    assert.ok(decidePostQuizAction(90).message.length > 0);
  });
});
