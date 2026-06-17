/**
 * Spec-based tests — Module "Kiểm tra đầu vào" / Logic §1 "Phân loại học lực".
 *
 * Nguồn đặc tả (Đặc tả chức năng & Logic.xlsx, sheet "Logic"):
 *   Điểm trung bình toán cuối kỳ:
 *     <= 5  → trung bình
 *     <= 8  → khá
 *     >  8  → giỏi
 *
 * Ghi chú thực tế: implementation bổ sung thêm bậc "yeu" cho điểm <= 3.5
 * (đúng theo khuyến nghị trong chính đặc tả: "Không chỉ là 3 nhãn"), nên với
 * điểm > 3.5 quy tắc 3 bậc của đặc tả vẫn được giữ nguyên.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classificationService } from "./classification.service";

describe("classifyByScore — phân loại học lực theo điểm trung bình (Logic §1)", () => {
  // ── Quy tắc 3 bậc của đặc tả (áp dụng cho điểm > 3.5) ──────────────────

  it("điểm trong (3.5, 5] → trung bình (spec: <= 5)", () => {
    for (const score of [3.6, 4, 4.9, 5]) {
      assert.equal(classificationService.classifyByScore(score).level, "trung_binh");
    }
  });

  it("điểm trong (5, 8] → khá (spec: <= 8)", () => {
    for (const score of [5.1, 6, 7, 8]) {
      assert.equal(classificationService.classifyByScore(score).level, "kha");
    }
  });

  it("điểm > 8 → giỏi (spec: > 8)", () => {
    for (const score of [8.1, 9, 9.5, 10]) {
      assert.equal(classificationService.classifyByScore(score).level, "gioi");
    }
  });

  // ── Bậc mở rộng theo implementation: "yeu" cho điểm <= 3.5 ─────────────

  it("điểm <= 3.5 → yeu (bậc mở rộng ngoài 3 nhãn của spec)", () => {
    for (const score of [0, 1, 2.5, 3.5]) {
      assert.equal(classificationService.classifyByScore(score).level, "yeu");
    }
  });

  // ── Kiểm tra biên (boundary) — đảm bảo không lệch 1 đơn vị ─────────────

  it("biên 5.0 thuộc 'trung bình', 5.01 thuộc 'khá'", () => {
    assert.equal(classificationService.classifyByScore(5).level, "trung_binh");
    assert.equal(classificationService.classifyByScore(5.01).level, "kha");
  });

  it("biên 8.0 thuộc 'khá', 8.01 thuộc 'giỏi'", () => {
    assert.equal(classificationService.classifyByScore(8).level, "kha");
    assert.equal(classificationService.classifyByScore(8.01).level, "gioi");
  });

  it("biên 3.5 thuộc 'yeu', 3.51 thuộc 'trung bình'", () => {
    assert.equal(classificationService.classifyByScore(3.5).level, "yeu");
    assert.equal(classificationService.classifyByScore(3.51).level, "trung_binh");
  });

  // ── Metadata trả về đúng hợp đồng ─────────────────────────────────────

  it("luôn trả về source='math_average_score' và echo lại điểm gốc", () => {
    const result = classificationService.classifyByScore(7.25);
    assert.equal(result.source, "math_average_score");
    assert.equal(result.score, 7.25);
    assert.equal(result.level, "kha");
  });

  // ── Ca biên giá trị bất thường ────────────────────────────────────────

  it("điểm tối thiểu 0 và tối đa 10 vẫn phân loại hợp lệ", () => {
    assert.equal(classificationService.classifyByScore(0).level, "yeu");
    assert.equal(classificationService.classifyByScore(10).level, "gioi");
  });
});
