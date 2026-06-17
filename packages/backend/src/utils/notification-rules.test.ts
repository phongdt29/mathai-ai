/**
 * Spec-based tests — Module 9 + sheet Logic: quy tắc cảnh báo/nhắc nhở.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  shouldAlertConsecutiveAbsences,
  shouldAlertForgetting,
  shouldAlertLoginNoStudy,
  shouldAlertNoShow,
  shouldAlertQuizDecline,
  shouldRemindDailyLearning,
} from "./notification-rules";

describe("shouldRemindDailyLearning", () => {
  it("có buổi hôm nay & chưa học → nhắc", () => {
    assert.equal(shouldRemindDailyLearning({ hasLessonToday: true, hasStudiedToday: false }), true);
  });
  it("đã học hoặc không có buổi → không nhắc", () => {
    assert.equal(shouldRemindDailyLearning({ hasLessonToday: true, hasStudiedToday: true }), false);
    assert.equal(shouldRemindDailyLearning({ hasLessonToday: false, hasStudiedToday: false }), false);
  });
});

describe("shouldAlertNoShow (không vào sau 15')", () => {
  const start = 1_000_000;
  it("chưa vào & quá 15' → cảnh báo", () => {
    assert.equal(
      shouldAlertNoShow({ scheduledStartMs: start, nowMs: start + 15 * 60_000, hasStarted: false }),
      true,
    );
  });
  it("chưa tới 15' → chưa cảnh báo", () => {
    assert.equal(
      shouldAlertNoShow({ scheduledStartMs: start, nowMs: start + 14 * 60_000, hasStarted: false }),
      false,
    );
  });
  it("đã vào học → không cảnh báo", () => {
    assert.equal(
      shouldAlertNoShow({ scheduledStartMs: start, nowMs: start + 60 * 60_000, hasStarted: true }),
      false,
    );
  });
});

describe("shouldAlertLoginNoStudy (vào nhưng không học)", () => {
  it("có phiên & học < 10' → cảnh báo", () => {
    assert.equal(shouldAlertLoginNoStudy({ hasSession: true, effectiveStudyMinutes: 3 }), true);
  });
  it("có phiên & học đủ → không cảnh báo", () => {
    assert.equal(shouldAlertLoginNoStudy({ hasSession: true, effectiveStudyMinutes: 25 }), false);
  });
  it("không có phiên → không cảnh báo", () => {
    assert.equal(shouldAlertLoginNoStudy({ hasSession: false, effectiveStudyMinutes: 0 }), false);
  });
});

describe("shouldAlertForgetting", () => {
  it("có chủ đề nguy cơ → cảnh báo", () => {
    assert.equal(shouldAlertForgetting(["Phân số"]), true);
  });
  it("rỗng hoặc toàn chuỗi trắng → không", () => {
    assert.equal(shouldAlertForgetting([]), false);
    assert.equal(shouldAlertForgetting(["", "  "]), false);
  });
});

describe("shouldAlertConsecutiveAbsences", () => {
  it(">= 2 buổi liên tiếp → cảnh báo", () => {
    assert.equal(shouldAlertConsecutiveAbsences(2), true);
    assert.equal(shouldAlertConsecutiveAbsences(3), true);
  });
  it("< 2 → không", () => {
    assert.equal(shouldAlertConsecutiveAbsences(1), false);
  });
});

describe("shouldAlertQuizDecline (giảm 3 buổi liên tiếp)", () => {
  it("chuỗi giảm liên tiếp 3 buổi → cảnh báo", () => {
    assert.equal(shouldAlertQuizDecline([8, 7, 6]), true);
    assert.equal(shouldAlertQuizDecline([9, 8, 7, 6]), true);
  });
  it("có buổi tăng xen giữa → không (streak bị ngắt)", () => {
    assert.equal(shouldAlertQuizDecline([8, 6, 7]), false);
  });
  it("ổn định/tăng → không", () => {
    assert.equal(shouldAlertQuizDecline([6, 7, 8]), false);
    assert.equal(shouldAlertQuizDecline([7, 7, 7]), false);
  });
  it("không đủ dữ liệu → không", () => {
    assert.equal(shouldAlertQuizDecline([8, 6]), false);
  });
});
