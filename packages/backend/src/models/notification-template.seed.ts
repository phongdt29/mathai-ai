import type { NotificationChannel } from "./notification-template.model";

/**
 * Default notification templates seeded into the database.
 * Uses Mustache-style {{variable}} placeholders for dynamic content.
 * Vietnamese content for all user-facing messages.
 */

export interface NotificationTemplateSeedData {
  template_id: string;
  type: string;
  version: string;
  channels: NotificationChannel[];
  variables: string[];
  email: { subject_template: string; text_template: string; html_template: string } | null;
  sms: { text_template: string } | null;
  push: { title_template: string; body_template: string } | null;
  in_app: { title_template: string; content_template: string; severity: string } | null;
  is_active: boolean;
}

export const DEFAULT_NOTIFICATION_TEMPLATES: NotificationTemplateSeedData[] = [
  // ─── 1. Password Reset ────────────────────────────────────────────────
  {
    template_id: "password_reset.v1",
    type: "password_reset",
    version: "v1",
    channels: ["email"],
    variables: ["user_full_name", "reset_url", "expires_minutes"],
    email: {
      subject_template: "MathAI - Đặt lại mật khẩu",
      text_template:
        "Xin chào {{user_full_name}},\n\n" +
        "Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản MathAI.\n\n" +
        "Nhấn vào liên kết sau để đặt mật khẩu mới (có hiệu lực trong {{expires_minutes}} phút):\n" +
        "{{reset_url}}\n\n" +
        "Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.\n\n" +
        "Trân trọng,\nĐội ngũ MathAI",
      html_template:
        '<div style="font-family:sans-serif;max-width:600px;margin:0 auto">' +
        "<h2>Đặt lại mật khẩu MathAI</h2>" +
        "<p>Xin chào <strong>{{user_full_name}}</strong>,</p>" +
        "<p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản MathAI.</p>" +
        "<p>Nhấn vào nút bên dưới để đặt mật khẩu mới (có hiệu lực trong {{expires_minutes}} phút):</p>" +
        '<p><a href="{{reset_url}}" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px">Đặt lại mật khẩu</a></p>' +
        "<p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>" +
        "<p>Trân trọng,<br/>Đội ngũ MathAI</p>" +
        "</div>",
    },
    sms: null,
    push: null,
    in_app: null,
    is_active: true,
  },

  // ─── 2. Assignment Graded ─────────────────────────────────────────────
  {
    template_id: "assignment_graded.v1",
    type: "assignment_graded",
    version: "v1",
    channels: ["in_app", "push"],
    variables: ["student_full_name", "assignment_title", "score", "total_points", "teacher_name", "feedback"],
    email: null,
    sms: null,
    push: {
      title_template: "Bài tập đã được chấm điểm",
      body_template: "{{assignment_title}}: {{score}}/{{total_points}} điểm. Giáo viên: {{teacher_name}}",
    },
    in_app: {
      title_template: "Bài tập đã được chấm điểm",
      content_template:
        "Bài tập \"{{assignment_title}}\" đã được {{teacher_name}} chấm điểm: {{score}}/{{total_points}}." +
        "{{#feedback}} Nhận xét: {{feedback}}{{/feedback}}",
      severity: "info",
    },
    is_active: true,
  },

  // ─── 3. Parent Absent Alert ───────────────────────────────────────────
  {
    template_id: "parent_absent_alert.v1",
    type: "parent_absent_alert",
    version: "v1",
    channels: ["in_app", "email", "sms"],
    variables: ["parent_full_name", "student_full_name", "lesson_title", "lesson_date", "lesson_time"],
    email: {
      subject_template: "MathAI - {{student_full_name}} vắng buổi học",
      text_template:
        "Xin chào {{parent_full_name}},\n\n" +
        "Hệ thống MathAI ghi nhận {{student_full_name}} đã vắng buổi học:\n" +
        "- Bài học: {{lesson_title}}\n" +
        "- Ngày: {{lesson_date}}\n" +
        "- Giờ: {{lesson_time}}\n\n" +
        "Vui lòng kiểm tra và liên hệ giáo viên nếu cần.\n\n" +
        "Trân trọng,\nĐội ngũ MathAI",
      html_template:
        '<div style="font-family:sans-serif;max-width:600px;margin:0 auto">' +
        "<h2>Thông báo vắng mặt</h2>" +
        "<p>Xin chào <strong>{{parent_full_name}}</strong>,</p>" +
        "<p>Hệ thống MathAI ghi nhận <strong>{{student_full_name}}</strong> đã vắng buổi học:</p>" +
        "<ul>" +
        "<li>Bài học: {{lesson_title}}</li>" +
        "<li>Ngày: {{lesson_date}}</li>" +
        "<li>Giờ: {{lesson_time}}</li>" +
        "</ul>" +
        "<p>Vui lòng kiểm tra và liên hệ giáo viên nếu cần.</p>" +
        "<p>Trân trọng,<br/>Đội ngũ MathAI</p>" +
        "</div>",
    },
    sms: {
      text_template:
        "MathAI: {{student_full_name}} vắng buổi học \"{{lesson_title}}\" ngày {{lesson_date}}. Vui lòng kiểm tra.",
    },
    push: null,
    in_app: {
      title_template: "{{student_full_name}} vắng buổi học",
      content_template:
        "{{student_full_name}} đã vắng buổi học \"{{lesson_title}}\" vào ngày {{lesson_date}} lúc {{lesson_time}}.",
      severity: "warning",
    },
    is_active: true,
  },

  // ─── 4. Parent Weekly Summary ─────────────────────────────────────────
  {
    template_id: "parent_weekly_summary.v1",
    type: "parent_weekly_summary",
    version: "v1",
    channels: ["in_app", "email"],
    variables: [
      "parent_full_name",
      "student_full_name",
      "week_label",
      "total_sessions",
      "active_minutes",
      "attendance_rate",
      "avg_quiz_score",
      "risk_level",
      "highlights",
    ],
    email: {
      subject_template: "MathAI - Báo cáo tuần {{week_label}} của {{student_full_name}}",
      text_template:
        "Xin chào {{parent_full_name}},\n\n" +
        "Dưới đây là báo cáo tuần {{week_label}} của {{student_full_name}}:\n\n" +
        "- Số buổi học: {{total_sessions}}\n" +
        "- Thời gian học: {{active_minutes}} phút\n" +
        "- Tỉ lệ điểm danh: {{attendance_rate}}%\n" +
        "- Điểm trung bình quiz: {{avg_quiz_score}}\n" +
        "- Mức độ rủi ro: {{risk_level}}\n\n" +
        "{{highlights}}\n\n" +
        "Trân trọng,\nĐội ngũ MathAI",
      html_template:
        '<div style="font-family:sans-serif;max-width:600px;margin:0 auto">' +
        "<h2>Báo cáo tuần {{week_label}}</h2>" +
        "<p>Xin chào <strong>{{parent_full_name}}</strong>,</p>" +
        "<p>Dưới đây là báo cáo tuần của <strong>{{student_full_name}}</strong>:</p>" +
        '<table style="border-collapse:collapse;width:100%">' +
        '<tr><td style="padding:8px;border:1px solid #ddd"><strong>Số buổi học</strong></td><td style="padding:8px;border:1px solid #ddd">{{total_sessions}}</td></tr>' +
        '<tr><td style="padding:8px;border:1px solid #ddd"><strong>Thời gian học</strong></td><td style="padding:8px;border:1px solid #ddd">{{active_minutes}} phút</td></tr>' +
        '<tr><td style="padding:8px;border:1px solid #ddd"><strong>Tỉ lệ điểm danh</strong></td><td style="padding:8px;border:1px solid #ddd">{{attendance_rate}}%</td></tr>' +
        '<tr><td style="padding:8px;border:1px solid #ddd"><strong>Điểm TB quiz</strong></td><td style="padding:8px;border:1px solid #ddd">{{avg_quiz_score}}</td></tr>' +
        '<tr><td style="padding:8px;border:1px solid #ddd"><strong>Mức rủi ro</strong></td><td style="padding:8px;border:1px solid #ddd">{{risk_level}}</td></tr>' +
        "</table>" +
        "<p>{{highlights}}</p>" +
        "<p>Trân trọng,<br/>Đội ngũ MathAI</p>" +
        "</div>",
    },
    sms: null,
    push: null,
    in_app: {
      title_template: "Báo cáo tuần {{week_label}} — {{student_full_name}}",
      content_template:
        "Tuần {{week_label}}: {{total_sessions}} buổi, {{active_minutes}} phút học, điểm danh {{attendance_rate}}%, quiz TB {{avg_quiz_score}}.",
      severity: "info",
    },
    is_active: true,
  },

  // ─── 5. Risk Alert ────────────────────────────────────────────────────
  {
    template_id: "risk_alert.v1",
    type: "risk_alert",
    version: "v1",
    channels: ["in_app", "email"],
    variables: ["parent_full_name", "student_full_name", "risk_level", "risk_score", "risk_factors", "suggestions"],
    email: {
      subject_template: "MathAI - Cảnh báo rủi ro học tập: {{student_full_name}}",
      text_template:
        "Xin chào {{parent_full_name}},\n\n" +
        "Hệ thống MathAI phát hiện {{student_full_name}} đang ở mức rủi ro học tập CAO.\n\n" +
        "- Mức rủi ro: {{risk_level}}\n" +
        "- Điểm rủi ro: {{risk_score}}/100\n" +
        "- Yếu tố: {{risk_factors}}\n\n" +
        "Gợi ý hành động:\n{{suggestions}}\n\n" +
        "Vui lòng theo dõi và hỗ trợ con em học tập.\n\n" +
        "Trân trọng,\nĐội ngũ MathAI",
      html_template:
        '<div style="font-family:sans-serif;max-width:600px;margin:0 auto">' +
        '<h2 style="color:#DC2626">Cảnh báo rủi ro học tập</h2>' +
        "<p>Xin chào <strong>{{parent_full_name}}</strong>,</p>" +
        "<p>Hệ thống MathAI phát hiện <strong>{{student_full_name}}</strong> đang ở mức rủi ro học tập <strong>CAO</strong>.</p>" +
        "<ul>" +
        "<li>Mức rủi ro: <strong>{{risk_level}}</strong></li>" +
        "<li>Điểm rủi ro: <strong>{{risk_score}}/100</strong></li>" +
        "<li>Yếu tố: {{risk_factors}}</li>" +
        "</ul>" +
        "<p><strong>Gợi ý hành động:</strong></p>" +
        "<p>{{suggestions}}</p>" +
        "<p>Vui lòng theo dõi và hỗ trợ con em học tập.</p>" +
        "<p>Trân trọng,<br/>Đội ngũ MathAI</p>" +
        "</div>",
    },
    sms: null,
    push: null,
    in_app: {
      title_template: "Cảnh báo rủi ro: {{student_full_name}}",
      content_template:
        "{{student_full_name}} đang ở mức rủi ro {{risk_level}} ({{risk_score}}/100). Yếu tố: {{risk_factors}}.",
      severity: "critical",
    },
    is_active: true,
  },

  // ─── 6. Payment Success ───────────────────────────────────────────────
  {
    template_id: "payment_success.v1",
    type: "payment_success",
    version: "v1",
    channels: ["email", "in_app"],
    variables: ["user_full_name", "plan_name", "amount_vnd", "transaction_id", "paid_at", "next_billing_date"],
    email: {
      subject_template: "MathAI - Thanh toán thành công",
      text_template:
        "Xin chào {{user_full_name}},\n\n" +
        "Thanh toán của bạn đã được xử lý thành công!\n\n" +
        "- Gói: {{plan_name}}\n" +
        "- Số tiền: {{amount_vnd}} VNĐ\n" +
        "- Mã giao dịch: {{transaction_id}}\n" +
        "- Thời gian: {{paid_at}}\n" +
        "- Gia hạn tiếp theo: {{next_billing_date}}\n\n" +
        "Cảm ơn bạn đã sử dụng MathAI!\n\n" +
        "Trân trọng,\nĐội ngũ MathAI",
      html_template:
        '<div style="font-family:sans-serif;max-width:600px;margin:0 auto">' +
        '<h2 style="color:#059669">Thanh toán thành công ✓</h2>' +
        "<p>Xin chào <strong>{{user_full_name}}</strong>,</p>" +
        "<p>Thanh toán của bạn đã được xử lý thành công!</p>" +
        '<table style="border-collapse:collapse;width:100%">' +
        '<tr><td style="padding:8px;border:1px solid #ddd"><strong>Gói</strong></td><td style="padding:8px;border:1px solid #ddd">{{plan_name}}</td></tr>' +
        '<tr><td style="padding:8px;border:1px solid #ddd"><strong>Số tiền</strong></td><td style="padding:8px;border:1px solid #ddd">{{amount_vnd}} VNĐ</td></tr>' +
        '<tr><td style="padding:8px;border:1px solid #ddd"><strong>Mã giao dịch</strong></td><td style="padding:8px;border:1px solid #ddd">{{transaction_id}}</td></tr>' +
        '<tr><td style="padding:8px;border:1px solid #ddd"><strong>Thời gian</strong></td><td style="padding:8px;border:1px solid #ddd">{{paid_at}}</td></tr>' +
        '<tr><td style="padding:8px;border:1px solid #ddd"><strong>Gia hạn tiếp theo</strong></td><td style="padding:8px;border:1px solid #ddd">{{next_billing_date}}</td></tr>' +
        "</table>" +
        "<p>Cảm ơn bạn đã sử dụng MathAI!</p>" +
        "<p>Trân trọng,<br/>Đội ngũ MathAI</p>" +
        "</div>",
    },
    sms: null,
    push: null,
    in_app: {
      title_template: "Thanh toán thành công",
      content_template:
        "Gói {{plan_name}} đã được kích hoạt. Số tiền: {{amount_vnd}} VNĐ. Mã GD: {{transaction_id}}.",
      severity: "info",
    },
    is_active: true,
  },

  // ─── 7. Payment Failed ────────────────────────────────────────────────
  {
    template_id: "payment_failed.v1",
    type: "payment_failed",
    version: "v1",
    channels: ["email"],
    variables: ["user_full_name", "plan_name", "amount_vnd", "transaction_id", "error_reason", "retry_url"],
    email: {
      subject_template: "MathAI - Thanh toán không thành công",
      text_template:
        "Xin chào {{user_full_name}},\n\n" +
        "Thanh toán của bạn không thành công.\n\n" +
        "- Gói: {{plan_name}}\n" +
        "- Số tiền: {{amount_vnd}} VNĐ\n" +
        "- Mã giao dịch: {{transaction_id}}\n" +
        "- Lý do: {{error_reason}}\n\n" +
        "Vui lòng thử lại tại: {{retry_url}}\n\n" +
        "Nếu cần hỗ trợ, liên hệ support@mathai.vn.\n\n" +
        "Trân trọng,\nĐội ngũ MathAI",
      html_template:
        '<div style="font-family:sans-serif;max-width:600px;margin:0 auto">' +
        '<h2 style="color:#DC2626">Thanh toán không thành công</h2>' +
        "<p>Xin chào <strong>{{user_full_name}}</strong>,</p>" +
        "<p>Thanh toán của bạn không thành công.</p>" +
        '<table style="border-collapse:collapse;width:100%">' +
        '<tr><td style="padding:8px;border:1px solid #ddd"><strong>Gói</strong></td><td style="padding:8px;border:1px solid #ddd">{{plan_name}}</td></tr>' +
        '<tr><td style="padding:8px;border:1px solid #ddd"><strong>Số tiền</strong></td><td style="padding:8px;border:1px solid #ddd">{{amount_vnd}} VNĐ</td></tr>' +
        '<tr><td style="padding:8px;border:1px solid #ddd"><strong>Mã giao dịch</strong></td><td style="padding:8px;border:1px solid #ddd">{{transaction_id}}</td></tr>' +
        '<tr><td style="padding:8px;border:1px solid #ddd"><strong>Lý do</strong></td><td style="padding:8px;border:1px solid #ddd">{{error_reason}}</td></tr>' +
        "</table>" +
        '<p><a href="{{retry_url}}" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px">Thử lại thanh toán</a></p>' +
        "<p>Nếu cần hỗ trợ, liên hệ <a href=\"mailto:support@mathai.vn\">support@mathai.vn</a>.</p>" +
        "<p>Trân trọng,<br/>Đội ngũ MathAI</p>" +
        "</div>",
    },
    sms: null,
    push: null,
    in_app: null,
    is_active: true,
  },

  // ─── 8. Student Daily Learning Reminder (Module 9) ────────────────────
  {
    template_id: "student_daily_reminder.v1",
    type: "student_daily_reminder",
    version: "v1",
    channels: ["in_app", "push"],
    variables: ["student_full_name", "lesson_title"],
    email: null,
    sms: null,
    push: {
      title_template: "Đến giờ học rồi!",
      body_template: "{{student_full_name}} ơi, hôm nay bạn có bài: {{lesson_title}}. Cùng học nhé!",
    },
    in_app: {
      title_template: "Nhắc học hôm nay",
      content_template:
        "{{student_full_name}} ơi, hôm nay bạn có bài học \"{{lesson_title}}\". Hãy duy trì chuỗi học tập nhé!",
      severity: "info",
    },
    is_active: true,
  },

  // ─── 9. Student Forgetting Alert (Module 9) ───────────────────────────
  {
    template_id: "student_forgetting_alert.v1",
    type: "student_forgetting_alert",
    version: "v1",
    channels: ["in_app", "push"],
    variables: ["student_full_name", "topics"],
    email: null,
    sms: null,
    push: {
      title_template: "Sắp quên bài rồi!",
      body_template: "Ôn lại nhanh các chủ đề: {{topics}} để nhớ lâu hơn nhé.",
    },
    in_app: {
      title_template: "Cảnh báo sắp quên bài",
      content_template:
        "{{student_full_name}} ơi, các chủ đề sau đang cần ôn lại: {{topics}}. Dành ít phút ôn nhé!",
      severity: "warning",
    },
    is_active: true,
  },

  // ─── 10. Parent Upcoming Lesson Reminder (Module 9) ───────────────────
  {
    template_id: "parent_lesson_reminder.v1",
    type: "parent_lesson_reminder",
    version: "v1",
    channels: ["in_app", "email"],
    variables: ["parent_full_name", "student_full_name", "lesson_title", "lesson_time"],
    email: {
      subject_template: "MathAI - Lịch học hôm nay của {{student_full_name}}",
      text_template:
        "Xin chào {{parent_full_name}},\n\n" +
        "Hôm nay {{student_full_name}} có buổi học: {{lesson_title}}" +
        "{{#lesson_time}} lúc {{lesson_time}}{{/lesson_time}}.\n\n" +
        "Hãy nhắc con vào học đúng giờ nhé.\n\nTrân trọng,\nĐội ngũ MathAI",
      html_template:
        '<div style="font-family:sans-serif;max-width:600px;margin:0 auto">' +
        "<h2>Lịch học hôm nay</h2>" +
        "<p>Xin chào <strong>{{parent_full_name}}</strong>,</p>" +
        "<p>Hôm nay <strong>{{student_full_name}}</strong> có buổi học: <strong>{{lesson_title}}</strong>{{#lesson_time}} lúc {{lesson_time}}{{/lesson_time}}.</p>" +
        "<p>Hãy nhắc con vào học đúng giờ nhé.</p>" +
        "<p>Trân trọng,<br/>Đội ngũ MathAI</p>" +
        "</div>",
    },
    sms: null,
    push: null,
    in_app: {
      title_template: "Lịch học hôm nay của {{student_full_name}}",
      content_template:
        "Hôm nay {{student_full_name}} có buổi học \"{{lesson_title}}\"{{#lesson_time}} lúc {{lesson_time}}{{/lesson_time}}.",
      severity: "info",
    },
    is_active: true,
  },
];
