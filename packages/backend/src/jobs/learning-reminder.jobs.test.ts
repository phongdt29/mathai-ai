import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

import { studentProfileRepository } from "../models/student.model";
import { recommendationService } from "../services/recommendation.service";
import { notificationService } from "../services/notification.service";
import { studentForgettingAlertJob } from "./learning-reminder.jobs";

const context = {
  jobName: "student.forgetting_alert",
  trigger: "manual" as const,
} as never;

afterEach(() => {
  mock.restoreAll();
});

describe("studentForgettingAlertJob", () => {
  it("chỉ gửi cảnh báo cho học sinh có chủ đề sắp quên", async () => {
    mock.method(studentProfileRepository, "findAllStudentIds", async () => [
      "s1",
      "s2",
    ]);
    mock.method(
      recommendationService,
      "getAdaptiveRecommendation",
      async (studentId: string) =>
        ({
          signals: {
            forgetting_risk_topics: studentId === "s1" ? ["Phân số"] : [],
          },
        }) as never,
    );
    mock.method(
      studentProfileRepository,
      "findWithUser",
      async () => ({ user_id: "u1", user: { full_name: "An" } }) as never,
    );
    const sendMock = mock.method(
      notificationService,
      "send",
      async () => ({ delivery_id: "d1", channel_results: [] }) as never,
    );

    const summary = await studentForgettingAlertJob.run(context);

    assert.equal(sendMock.mock.callCount(), 1);
    const arg = sendMock.mock.calls[0]?.arguments[0] as {
      type: string;
      recipient: { user_id: string };
      template_id: string;
    };
    assert.equal(arg.type, "student_forgetting_alert");
    assert.equal(arg.template_id, "student_forgetting_alert.v1");
    assert.equal(arg.recipient.user_id, "u1");
    assert.deepEqual(summary.metrics, { scanned: 2, alerted: 1, failed: 0 });
  });

  it("fail-soft: lỗi 1 học sinh không chặn các học sinh khác", async () => {
    mock.method(studentProfileRepository, "findAllStudentIds", async () => [
      "bad",
      "good",
    ]);
    mock.method(
      recommendationService,
      "getAdaptiveRecommendation",
      async (studentId: string) => {
        if (studentId === "bad") throw new Error("rec failed");
        return { signals: { forgetting_risk_topics: ["Hình học"] } } as never;
      },
    );
    mock.method(
      studentProfileRepository,
      "findWithUser",
      async () => ({ user_id: "u2", user: { full_name: "Bình" } }) as never,
    );
    const sendMock = mock.method(
      notificationService,
      "send",
      async () => ({ delivery_id: "d2", channel_results: [] }) as never,
    );

    const summary = await studentForgettingAlertJob.run(context);

    assert.equal(sendMock.mock.callCount(), 1);
    assert.equal(summary.metrics?.failed, 1);
    assert.equal(summary.metrics?.alerted, 1);
    assert.equal(summary.ok, true);
  });

  it("không có chủ đề sắp quên → không gửi", async () => {
    mock.method(studentProfileRepository, "findAllStudentIds", async () => ["s1"]);
    mock.method(
      recommendationService,
      "getAdaptiveRecommendation",
      async () => ({ signals: { forgetting_risk_topics: [] } }) as never,
    );
    const sendMock = mock.method(notificationService, "send", async () => ({}) as never);

    const summary = await studentForgettingAlertJob.run(context);

    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(summary.metrics?.alerted, 0);
  });
});
