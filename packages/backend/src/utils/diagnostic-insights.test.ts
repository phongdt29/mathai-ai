/**
 * Spec-based tests — Module 2 output: tốc độ làm bài + mức độ hiểu.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  averageAccuracy,
  classifySpeed,
  computeComprehensionLevel,
} from "./diagnostic-insights";

describe("classifySpeed", () => {
  it("< 45s/câu → fast", () => {
    assert.equal(classifySpeed(20), "fast");
    assert.equal(classifySpeed(44), "fast");
  });
  it("45–120s/câu → normal", () => {
    assert.equal(classifySpeed(45), "normal");
    assert.equal(classifySpeed(90), "normal");
    assert.equal(classifySpeed(120), "normal");
  });
  it("> 120s/câu → slow", () => {
    assert.equal(classifySpeed(121), "slow");
    assert.equal(classifySpeed(300), "slow");
  });
  it("null/0/không hợp lệ → normal", () => {
    assert.equal(classifySpeed(null), "normal");
    assert.equal(classifySpeed(undefined), "normal");
    assert.equal(classifySpeed(0), "normal");
    assert.equal(classifySpeed(Number.NaN), "normal");
  });
  it("cho phép tùy biến ngưỡng", () => {
    assert.equal(classifySpeed(50, { fastMax: 60 }), "fast");
    assert.equal(classifySpeed(70, { slowMin: 60 }), "slow");
  });
});

describe("computeComprehensionLevel", () => {
  it("độ chính xác cao + ổn định → advanced", () => {
    assert.equal(computeComprehensionLevel(90, 1), "advanced");
  });
  it("trung bình → intermediate", () => {
    assert.equal(computeComprehensionLevel(70, 0.8), "intermediate");
  });
  it("thấp → beginner", () => {
    assert.equal(computeComprehensionLevel(40, 0.5), "beginner");
  });
  it("thiếu ổn định hạ mức so với cùng độ chính xác", () => {
    const stable = computeComprehensionLevel(80, 1);
    const shaky = computeComprehensionLevel(80, 0);
    assert.equal(stable, "advanced");
    assert.notEqual(shaky, "advanced");
  });
  it("giá trị thiếu → mặc định an toàn (beginner khi accuracy=0)", () => {
    assert.equal(computeComprehensionLevel(null, null), "beginner");
  });
  it("clamp accuracy ngoài [0,100]", () => {
    assert.equal(computeComprehensionLevel(150, 1), "advanced");
    assert.equal(computeComprehensionLevel(-20, 1), "beginner");
  });
});

describe("averageAccuracy", () => {
  it("trung bình các giá trị hợp lệ, làm tròn", () => {
    assert.equal(averageAccuracy([100, 50, 0]), 50);
    assert.equal(averageAccuracy([80, 90]), 85);
  });
  it("rỗng → 0", () => {
    assert.equal(averageAccuracy([]), 0);
  });
});
