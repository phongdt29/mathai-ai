import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { NotificationTemplateService } from "./notification-template.service";
import type { INotificationTemplate, NotificationTemplateRepository } from "../models/notification-template.model";

// ── Mock template data ──────────────────────────────────────────────────

function createMockTemplate(overrides: Partial<INotificationTemplate> = {}): INotificationTemplate {
  return {
    _id: "mock-id",
    template_id: "password_reset.v1",
    type: "password_reset",
    version: "v1",
    channels: ["email", "in_app"],
    email: {
      subject_template: "Đặt lại mật khẩu cho {{user_name}}",
      text_template: "Xin chào {{user_name}}, nhấn vào link: {{reset_url}}",
      html_template: "<p>Xin chào {{user_name}}, <a href=\"{{reset_url}}\">đặt lại mật khẩu</a></p>",
    },
    sms: null,
    push: null,
    in_app: {
      title_template: "Yêu cầu đặt lại mật khẩu",
      content_template: "Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản {{user_name}}.",
      severity: "info",
    },
    variables: ["user_name", "reset_url"],
    is_active: true,
    created_by: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as INotificationTemplate;
}

function createMultiChannelTemplate(): INotificationTemplate {
  return createMockTemplate({
    template_id: "parent_absent_alert.v1",
    type: "parent_absent_alert",
    channels: ["email", "sms", "push", "in_app"],
    email: {
      subject_template: "Thông báo vắng mặt: {{student_name}}",
      text_template: "{{student_name}} đã vắng mặt buổi học {{lesson_name}} ngày {{date}}.",
      html_template: "<p><strong>{{student_name}}</strong> đã vắng mặt buổi học {{lesson_name}} ngày {{date}}.</p>",
    },
    sms: {
      text_template: "[MathAI] {{student_name}} vắng mặt buổi {{lesson_name}} ngày {{date}}.",
    },
    push: {
      title_template: "Vắng mặt: {{student_name}}",
      body_template: "{{student_name}} đã vắng buổi {{lesson_name}}",
    },
    in_app: {
      title_template: "Thông báo vắng mặt",
      content_template: "{{student_name}} đã vắng mặt buổi học {{lesson_name}} vào ngày {{date}}.",
      severity: "warning",
    },
    variables: ["student_name", "lesson_name", "date"],
  });
}

// ── Mock repository ─────────────────────────────────────────────────────

function createMockRepository(templates: INotificationTemplate[] = []): NotificationTemplateRepository {
  return {
    findActiveByTemplateId: async (templateId: string) => {
      return templates.find((t) => t.template_id === templateId && t.is_active) ?? null;
    },
    findActive: async () => {
      return templates.filter((t) => t.is_active);
    },
  } as unknown as NotificationTemplateRepository;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("NotificationTemplateService", () => {
  let service: NotificationTemplateService;
  let mockRepo: NotificationTemplateRepository;

  describe("render()", () => {
    it("should render email and in_app channels with variable substitution", async () => {
      const template = createMockTemplate();
      mockRepo = createMockRepository([template]);
      service = new NotificationTemplateService({ templateRepository: mockRepo });

      const result = await service.render("password_reset.v1", {
        user_name: "Nguyễn Văn A",
        reset_url: "https://mathai.vn/reset?token=abc123",
      });

      assert.ok(result.email);
      assert.equal(result.email.subject, "Đặt lại mật khẩu cho Nguyễn Văn A");
      assert.equal(result.email.text, "Xin chào Nguyễn Văn A, nhấn vào link: https://mathai.vn/reset?token=abc123");
      assert.ok(result.email.html.includes("Nguyễn Văn A"));
      assert.ok(result.email.html.includes("https://mathai.vn/reset?token=abc123"));

      assert.ok(result.in_app);
      assert.equal(result.in_app.title, "Yêu cầu đặt lại mật khẩu");
      assert.equal(result.in_app.content, "Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản Nguyễn Văn A.");
      assert.equal(result.in_app.severity, "info");

      // SMS and push should not be present (not in channels)
      assert.equal(result.sms, undefined);
      assert.equal(result.push, undefined);
    });

    it("should render all 4 channels when template supports them", async () => {
      const template = createMultiChannelTemplate();
      mockRepo = createMockRepository([template]);
      service = new NotificationTemplateService({ templateRepository: mockRepo });

      const result = await service.render("parent_absent_alert.v1", {
        student_name: "Trần Minh B",
        lesson_name: "Toán 10 - Chương 3",
        date: "2024-01-15",
      });

      assert.ok(result.email);
      assert.equal(result.email.subject, "Thông báo vắng mặt: Trần Minh B");
      assert.ok(result.email.text.includes("Trần Minh B"));
      assert.ok(result.email.text.includes("Toán 10 - Chương 3"));
      assert.ok(result.email.text.includes("2024-01-15"));

      assert.ok(result.sms);
      assert.equal(result.sms.text, "[MathAI] Trần Minh B vắng mặt buổi Toán 10 - Chương 3 ngày 2024-01-15.");

      assert.ok(result.push);
      assert.equal(result.push.title, "Vắng mặt: Trần Minh B");
      assert.equal(result.push.body, "Trần Minh B đã vắng buổi Toán 10 - Chương 3");

      assert.ok(result.in_app);
      assert.equal(result.in_app.title, "Thông báo vắng mặt");
      assert.equal(result.in_app.severity, "warning");
    });

    it("should throw NotFoundError when template_id does not exist", async () => {
      mockRepo = createMockRepository([]);
      service = new NotificationTemplateService({ templateRepository: mockRepo });

      await assert.rejects(
        () => service.render("nonexistent.v1", { foo: "bar" }),
        (error: Error) => {
          assert.ok(error.message.includes("nonexistent.v1"));
          assert.ok(error.message.includes("không tìm thấy"));
          return true;
        },
      );
    });

    it("should throw NotFoundError when template is inactive", async () => {
      const template = createMockTemplate({ is_active: false });
      mockRepo = createMockRepository([template]);
      service = new NotificationTemplateService({ templateRepository: mockRepo });

      await assert.rejects(
        () => service.render("password_reset.v1", { user_name: "Test" }),
        (error: Error) => {
          assert.ok(error.message.includes("không tìm thấy"));
          return true;
        },
      );
    });

    it("should leave unmatched placeholders as-is", async () => {
      const template = createMockTemplate();
      mockRepo = createMockRepository([template]);
      service = new NotificationTemplateService({ templateRepository: mockRepo });

      const result = await service.render("password_reset.v1", {
        user_name: "Test User",
        // reset_url is intentionally missing
      });

      assert.ok(result.email);
      assert.ok(result.email.text.includes("{{reset_url}}"));
      assert.ok(result.email.text.includes("Test User"));
    });

    it("should handle empty string variables correctly", async () => {
      const template = createMockTemplate();
      mockRepo = createMockRepository([template]);
      service = new NotificationTemplateService({ templateRepository: mockRepo });

      const result = await service.render("password_reset.v1", {
        user_name: "",
        reset_url: "https://mathai.vn/reset",
      });

      assert.ok(result.email);
      assert.equal(result.email.subject, "Đặt lại mật khẩu cho ");
      assert.ok(result.email.text.includes("Xin chào , nhấn vào link:"));
    });

    it("should handle variables with dots (nested-style keys)", async () => {
      const template = createMockTemplate({
        email: {
          subject_template: "Hello {{user.full_name}}",
          text_template: "Welcome {{user.full_name}} from {{org.name}}",
          html_template: "<p>{{user.full_name}}</p>",
        },
      });
      mockRepo = createMockRepository([template]);
      service = new NotificationTemplateService({ templateRepository: mockRepo });

      const result = await service.render("password_reset.v1", {
        "user.full_name": "Nguyễn Văn C",
        "org.name": "MathAI",
      });

      assert.ok(result.email);
      assert.equal(result.email.subject, "Hello Nguyễn Văn C");
      assert.equal(result.email.text, "Welcome Nguyễn Văn C from MathAI");
    });

    it("should handle whitespace around variable names in templates", async () => {
      const template = createMockTemplate({
        email: {
          subject_template: "{{ user_name }} - {{ action }}",
          text_template: "{{  user_name  }} did {{action}}",
          html_template: "<p>{{ user_name}}</p>",
        },
      });
      mockRepo = createMockRepository([template]);
      service = new NotificationTemplateService({ templateRepository: mockRepo });

      const result = await service.render("password_reset.v1", {
        user_name: "Alice",
        action: "reset",
      });

      assert.ok(result.email);
      assert.equal(result.email.subject, "Alice - reset");
      assert.equal(result.email.text, "Alice did reset");
      assert.equal(result.email.html, "<p>Alice</p>");
    });
  });

  describe("listActive()", () => {
    it("should return all active templates", async () => {
      const templates = [
        createMockTemplate({ template_id: "t1", is_active: true }),
        createMockTemplate({ template_id: "t2", is_active: true }),
        createMockTemplate({ template_id: "t3", is_active: false }),
      ];
      mockRepo = createMockRepository(templates);
      service = new NotificationTemplateService({ templateRepository: mockRepo });

      const result = await service.listActive();
      assert.equal(result.length, 2);
    });
  });
});
