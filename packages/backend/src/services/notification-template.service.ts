import { NotFoundError } from "../utils/errors";
import {
  notificationTemplateRepository,
  type INotificationTemplate,
  type NotificationTemplateRepository,
} from "../models/notification-template.model";

// ── Types ───────────────────────────────────────────────────────────────

export interface RenderedEmailChannel {
  subject: string;
  text: string;
  html: string;
}

export interface RenderedSmsChannel {
  text: string;
}

export interface RenderedPushChannel {
  title: string;
  body: string;
}

export interface RenderedInAppChannel {
  title: string;
  content: string;
  severity: string;
}

export interface RenderedTemplateOutput {
  email?: RenderedEmailChannel;
  sms?: RenderedSmsChannel;
  push?: RenderedPushChannel;
  in_app?: RenderedInAppChannel;
}

// ── Service Dependencies ───────────────────────────────────────────────

export interface NotificationTemplateServiceDependencies {
  templateRepository?: NotificationTemplateRepository;
  logger?: Pick<Console, "error" | "warn" | "info">;
}

// ── Service Implementation ─────────────────────────────────────────────

export class NotificationTemplateService {
  private readonly templateRepo: NotificationTemplateRepository;
  private readonly logger: Pick<Console, "error" | "warn" | "info">;

  constructor(dependencies: NotificationTemplateServiceDependencies = {}) {
    this.templateRepo = dependencies.templateRepository ?? notificationTemplateRepository;
    this.logger = dependencies.logger ?? console;
  }

  /**
   * Render a notification template with the given variables.
   *
   * Looks up the template by template_id from DB.
   * Throws NotFoundError if template not found or is_active=false.
   * Substitutes {{variable}} placeholders with provided values.
   *
   * @param templateId - The template identifier (e.g. "password_reset.v1")
   * @param variables - Key-value pairs for template variable substitution
   * @returns Rendered content per channel
   */
  public async render(
    templateId: string,
    variables: Record<string, string>,
  ): Promise<RenderedTemplateOutput> {
    const template = await this.templateRepo.findActiveByTemplateId(templateId);

    if (!template) {
      throw new NotFoundError(
        `Notification template "${templateId}" không tìm thấy hoặc đã bị vô hiệu hóa`,
      );
    }

    return this.renderTemplate(template, variables);
  }

  /**
   * List all active notification templates.
   */
  public async listActive(): Promise<INotificationTemplate[]> {
    return this.templateRepo.findActive();
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Render all channel outputs from a template document.
   */
  private renderTemplate(
    template: INotificationTemplate,
    variables: Record<string, string>,
  ): RenderedTemplateOutput {
    const output: RenderedTemplateOutput = {};

    if (template.email && template.channels.includes("email")) {
      output.email = {
        subject: this.interpolate(template.email.subject_template, variables),
        text: this.interpolate(template.email.text_template, variables),
        html: this.interpolate(template.email.html_template, variables),
      };
    }

    if (template.sms && template.channels.includes("sms")) {
      output.sms = {
        text: this.interpolate(template.sms.text_template, variables),
      };
    }

    if (template.push && template.channels.includes("push")) {
      output.push = {
        title: this.interpolate(template.push.title_template, variables),
        body: this.interpolate(template.push.body_template, variables),
      };
    }

    if (template.in_app && template.channels.includes("in_app")) {
      output.in_app = {
        title: this.interpolate(template.in_app.title_template, variables),
        content: this.interpolate(template.in_app.content_template, variables),
        severity: template.in_app.severity,
      };
    }

    return output;
  }

  /**
   * Simple Mustache-style {{variable}} replacement.
   * Replaces all occurrences of {{key}} with the corresponding value from variables.
   * Unmatched placeholders are left as-is (empty string replacement if key exists but value is empty).
   */
  private interpolate(
    template: string,
    variables: Record<string, string>,
  ): string {
    return template.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (match, key: string) => {
      const trimmedKey = key.trim();
      if (trimmedKey in variables) {
        return variables[trimmedKey];
      }
      // Leave unmatched placeholders as-is
      return match;
    });
  }
}

// ── Singleton export ───────────────────────────────────────────────────

export const notificationTemplateService = new NotificationTemplateService();

export default notificationTemplateService;
