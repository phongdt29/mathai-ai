/**
 * Spec-based tests — Adaptive learning / cấu trúc buổi học.
 *
 * Nguồn đặc tả (Đặc tả chức năng & Logic.xlsx, sheet "Logic"):
 *  - §4 Gợi ý bài học hôm nay: quiz ≥8 (≥80%) bài mới; 5–<8 (50–<80%) bài mới
 *    nhưng tăng ôn/củng cố; <5 (<50%) ưu tiên ôn lại.
 *  - "Cách sửa đúng" cho adaptive learning: chấm theo NHIỀU tín hiệu (quiz, lỗi
 *    sai lặp lại, mức độ quên, xin gợi ý, độ ổn định) và cấu trúc 20% ôn / 60%
 *    mới / 20% củng cố.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  computeAdaptiveSessionRatios,
  type SessionRatioOptions,
} from "./recommendation.service";

type Signals = Parameters<typeof computeAdaptiveSessionRatios>[0];

function signals(overrides: Partial<Signals> = {}): Signals {
  return {
    last_quiz_score: null,
    hint_usage_rate: 0,
    avg_time_per_question: null,
    recurring_error_topics: [],
    stability_last_5: 1,
    forgetting_risk_topics: [],
    ...overrides,
  };
}

const sum = (r: { review_ratio: number; new_ratio: number; reinforce_ratio: number }) =>
  r.review_ratio + r.new_ratio + r.reinforce_ratio;

describe("computeAdaptiveSessionRatios — cấu trúc buổi học đa tín hiệu", () => {
  it("không có tín hiệu bất lợi → mặc định 20% ôn / 60% mới / 20% củng cố", () => {
    assert.deepEqual(computeAdaptiveSessionRatios(signals()), {
      review_ratio: 0.2,
      new_ratio: 0.6,
      reinforce_ratio: 0.2,
    });
  });

  // ── Band điểm quiz theo đặc tả §4 ─────────────────────────────────────

  it("quiz < 50% → tăng mạnh củng cố, giảm bài mới", () => {
    const r = computeAdaptiveSessionRatios(signals({ last_quiz_score: 40 }));
    assert.deepEqual(r, { review_ratio: 0.2, new_ratio: 0.4, reinforce_ratio: 0.4 });
  });

  it("quiz trong [50%, 80%) → tăng nhẹ củng cố (bám band 5–<8 của đặc tả)", () => {
    const r = computeAdaptiveSessionRatios(signals({ last_quiz_score: 65 }));
    assert.deepEqual(r, { review_ratio: 0.2, new_ratio: 0.5, reinforce_ratio: 0.3 });
  });

  it("quiz ≥ 80% → giữ nguyên ưu tiên bài mới", () => {
    const r = computeAdaptiveSessionRatios(signals({ last_quiz_score: 85 }));
    assert.deepEqual(r, { review_ratio: 0.2, new_ratio: 0.6, reinforce_ratio: 0.2 });
  });

  it("FIX ngưỡng: quiz 75% (điểm 7.5/10) nay được tăng củng cố thay vì bị bỏ qua", () => {
    // Trước tối ưu: ngưỡng < 70 nên 75% không được điều chỉnh (new 0.6).
    // Sau tối ưu: ngưỡng < 80 nên 75% thuộc band 50–<80 → reinforce 0.3.
    const r = computeAdaptiveSessionRatios(signals({ last_quiz_score: 75 }));
    assert.equal(r.reinforce_ratio, 0.3);
    assert.equal(r.new_ratio, 0.5);
  });

  it("biên 79% được điều chỉnh, 80% thì không", () => {
    assert.equal(
      computeAdaptiveSessionRatios(signals({ last_quiz_score: 79 })).reinforce_ratio,
      0.3,
    );
    assert.equal(
      computeAdaptiveSessionRatios(signals({ last_quiz_score: 80 })).reinforce_ratio,
      0.2,
    );
  });

  // ── Tín hiệu bổ sung (đặc tả: "chấm theo nhiều tín hiệu") ──────────────

  it("lỗi sai lặp lại ≥2 chủ đề → tăng củng cố", () => {
    const r = computeAdaptiveSessionRatios(
      signals({ recurring_error_topics: ["Phân số", "Hình học"] }),
    );
    assert.deepEqual(r, { review_ratio: 0.2, new_ratio: 0.5, reinforce_ratio: 0.3 });
  });

  it("kiến thức đang quên ≥3 chủ đề → tăng ôn lại", () => {
    const r = computeAdaptiveSessionRatios(
      signals({ forgetting_risk_topics: ["A", "B", "C"] }),
    );
    assert.deepEqual(r, { review_ratio: 0.35, new_ratio: 0.45, reinforce_ratio: 0.2 });
  });

  it("xin gợi ý nhiều (> ngưỡng) → tăng ôn lại", () => {
    const r = computeAdaptiveSessionRatios(signals({ hint_usage_rate: 0.5 }));
    assert.deepEqual(r, { review_ratio: 0.25, new_ratio: 0.55, reinforce_ratio: 0.2 });
  });

  it("điểm thiếu ổn định (< 0.4) → tăng củng cố", () => {
    const r = computeAdaptiveSessionRatios(signals({ stability_last_5: 0.3 }));
    assert.deepEqual(r, { review_ratio: 0.2, new_ratio: 0.55, reinforce_ratio: 0.25 });
  });

  // ── Bất biến: clamp & chuẩn hóa ───────────────────────────────────────

  it("nhiều tín hiệu bất lợi → vẫn giữ bài mới tối thiểu 20%", () => {
    const r = computeAdaptiveSessionRatios(
      signals({
        last_quiz_score: 40,
        forgetting_risk_topics: ["A", "B", "C"],
        recurring_error_topics: ["X", "Y"],
        hint_usage_rate: 0.6,
        stability_last_5: 0.2,
      }),
    );
    assert.ok(r.new_ratio >= 0.2, `new_ratio phải ≥ 0.2, nhận ${r.new_ratio}`);
    assert.ok(Math.abs(sum(r) - 1) <= 0.011, `tổng phải ≈ 1, nhận ${sum(r)}`);
  });

  it("tổng 3 tỉ lệ luôn ≈ 1.0 với mọi tổ hợp tín hiệu", () => {
    const cases: Partial<Signals>[] = [
      {},
      { last_quiz_score: 0 },
      { last_quiz_score: 55, recurring_error_topics: ["A"] },
      { forgetting_risk_topics: ["A"], hint_usage_rate: 0.9 },
      { stability_last_5: 0, last_quiz_score: 49 },
    ];
    for (const c of cases) {
      const r = computeAdaptiveSessionRatios(signals(c));
      assert.ok(Math.abs(sum(r) - 1) <= 0.011, `tổng ≈ 1 cho ${JSON.stringify(c)} → ${sum(r)}`);
    }
  });

  it("cho phép tùy biến baseRatios qua options", () => {
    const opts: SessionRatioOptions = { baseRatios: { review: 0.3, new: 0.5, reinforce: 0.2 } };
    const r = computeAdaptiveSessionRatios(signals(), opts);
    assert.deepEqual(r, { review_ratio: 0.3, new_ratio: 0.5, reinforce_ratio: 0.2 });
  });
});
