# Kế hoạch hoàn thiện dự án Math AI

Tài liệu này tổng hợp hiện trạng, mức ưu tiên, roadmap theo phase/sprint và backlog chi tiết để tiếp tục hoàn thiện dự án Math AI. Nội dung chỉ mang tính tài liệu hoá, không triển khai code và không chạy test.

## Mục lục

- [1. Phạm vi và nguyên tắc triển khai](#1-pham-vi-va-nguyen-tac-trien-khai)
- [2. Bảng chức năng theo trạng thái](#2-bang-chuc-nang-theo-trang-thai)
- [3. Danh sách tasks và tiến độ hiện tại](#3-danh-sach-tasks-va-tien-do-hien-tai)
- [4. Mức độ ưu tiên để hoàn thành](#4-muc-do-uu-tien-de-hoan-thanh)
- [5. Kế hoạch hoàn thiện theo phase/sprint](#5-ke-hoach-hoan-thien-theo-phasesprint)
- [6. Backlog task chi tiết](#6-backlog-task-chi-tiet)
- [7. Tiêu chí nghiệm thu/chất lượng chung](#7-tieu-chi-nghiem-thuchat-luong-chung)
- [8. Kết luận](#8-ket-luan)

<a id="1-pham-vi-va-nguyen-tac-trien-khai"></a>
## 1. Phạm vi và nguyên tắc triển khai

- Runtime hiện tại đang bám theo MongoDB/Mongoose tại [`packages/backend/src/config/database.ts`](packages/backend/src/config/database.ts) và route registry tại [`packages/backend/src/routes/index.ts`](packages/backend/src/routes/index.ts).
- Các file SQL như [`database/schema.sql`](database/schema.sql) và [`mathai/database/schema.sql`](mathai/database/schema.sql) được xem là blueprint/legacy cho đến khi có quyết định migration rõ ràng.
- Thứ tự ưu tiên xuyên suốt dự án là **P0 → P1 → P2 → P3**.
- Không được phá baseline audit đã pass, gồm:
  - Student audit: [`test-screenshots/student-business-audit/student-business-audit-2026-05-07T07-17-16-669Z.md`](test-screenshots/student-business-audit/student-business-audit-2026-05-07T07-17-16-669Z.md)
  - Business audit: [`test-screenshots/business-audit/business-audit-2026-05-07T06-48-38-498Z.md`](test-screenshots/business-audit/business-audit-2026-05-07T06-48-38-498Z.md)
  - Teacher audit: [`test-screenshots/teacher-business-audit/teacher-business-audit-2026-05-07T08-52-05-467Z.md`](test-screenshots/teacher-business-audit/teacher-business-audit-2026-05-07T08-52-05-467Z.md)
  - Staff audit: [`test-screenshots/staff-business-audit/staff-business-audit-2026-05-07T09-30-38-524Z.md`](test-screenshots/staff-business-audit/staff-business-audit-2026-05-07T09-30-38-524Z.md)
- Mục tiêu ưu tiên là giữ an toàn cho baseline dev/staging đã pass, sau đó mới mở rộng sang production readiness, core user flows, reliability/cleanup và product expansion.

<a id="2-bang-chuc-nang-theo-trang-thai"></a>
## 2. Bảng chức năng theo trạng thái

| Trạng thái | Chức năng chính | Ghi chú |
|---|---|---|
| Đã hoàn thiện | Auth login/RBAC; Dashboard học sinh/progress/mastery/points; Assessment start/save/submit/result; Curriculum/lesson/exercise/quiz; Solver text/safety/history/examples; AI tutor chat; Reward points/point ledger; Teacher classes/assignments/gradebook; Content library/template/approval; Admin/staff operations; Engagement/attendance/risk/fraud review; MongoDB/Mongoose runtime + seed dev/staging | Đây là nền tảng hiện tại đã có mức dev/staging ổn định và baseline audit đã pass. |
| Đang hoàn thiện | Register/onboarding/profile/theme/tutor user thật; Classification tự động sau assessment; Recommendation/curriculum cá nhân hóa nâng cao; Parent monitoring hoàn chỉnh, parent-child linking, weekly reports; Solver image/OCR production; Forgot/reset password production; Notification email/SMS/push/scheduler; AI provider registry/CRUD production; Student assignment submission; Production hardening/backup/monitoring/deployment verification | Đây là các gap gần nhất cần đóng để đi vào core user flows và production readiness. |
| Sẽ hoàn thiện | Analytics taxonomy; Advanced analytics dashboard; Billing architecture/MVP; Mobile API readiness; Mobile app MVP; Reporting/export nâng cao; Content operations nâng cao | Đây là các hạng mục mở rộng ở phase sau, chỉ nên làm khi nền tảng và core flows đã ổn định. |

<a id="3-danh-sach-tasks-va-tien-do-hien-tai"></a>
## 3. Danh sách tasks và tiến độ hiện tại

| Nhóm | Mã task chính | Tiến độ hiện tại | Nhận xét |
|---|---|---|---|
| Nền tảng production readiness | P0-01 → P0-10 | Cần hoàn thiện khẩn cấp | Đây là nhóm chặn production, bao gồm config, runtime, backup/restore, monitoring, security, email và release gate. |
| Core user flows | P1-01 → P1-11 | Đang mở rộng dần | Đã có khung chức năng ở dev/staging, nhưng còn thiếu user thật, onboarding, parent-child linking, assignment submission và gradebook thật. |
| Reliability / cleanup | P2-01 → P2-08 | Chưa hoàn tất | Tập trung vào OCR production, timeout/retry/fallback, cleanup contract, backfill, weekly report và audit UI. |
| Product expansion | P3-01 → P3-08 | Lên kế hoạch | Chỉ triển khai khi P0/P1/P2 đã ổn định để tránh làm loãng nguồn lực. |

**Tình trạng tổng quát hiện tại:**

- Các luồng nền tảng đã có: auth, dashboard học sinh, assessment, curriculum, solver text, AI tutor, reward points, teacher/admin/staff operations.
- Các luồng còn thiếu để chuyển sang core production: user thật, onboarding thật, parent monitoring hoàn chỉnh, assignment submission, OCR production, notification, release gate.
- Các hạng mục mở rộng giá trị sản phẩm nhưng chưa cấp bách: analytics, billing, mobile, reporting/export, content ops.

<a id="4-muc-do-uu-tien-de-hoan-thanh"></a>
## 4. Mức độ ưu tiên để hoàn thành

| Mức ưu tiên | Ý nghĩa | Trọng tâm |
|---|---|---|
| P0 | Chặn release nếu chưa hoàn thành | Production config, chốt runtime, backup/restore, deployment verification, monitoring/alerting, security hardening, forgot/reset password, email provider tối thiểu, student audit production-like, CI/manual release gate. |
| P1 | Mở khóa core user flows thật | Register/onboarding user thật, parent-child linking, parent monitoring, auto classification, recommendation nâng cao, assignment list/detail, assignment submission, gradebook thật, AI provider registry/CRUD, teacher assignment detail contract. |
| P2 | Cải thiện độ tin cậy và dọn nợ kỹ thuật | Solver OCR production, timeout/retry/fallback, admin settings cleanup, route/API contract cleanup, reward points release/backfill, weekly parent report, gamification nền, teacher/staff UI audit đầy đủ. |
| P3 | Mở rộng sản phẩm | Analytics taxonomy, advanced analytics dashboard, billing architecture/MVP, mobile API readiness, mobile app MVP, reporting/export nâng cao, content operations nâng cao. |

**Top task cần ưu tiên ngay:** **P0-01 Chuẩn hóa production config**.

**Thứ tự ưu tiên khuyến nghị:**

1. P0-01 → P0-06.
2. P0-08 → P0-07.
3. P0-09 → P0-10.
4. P1-01 → P1-04.
5. P1-05 → P1-06.
6. P1-07 → P1-09.
7. P1-10 → P1-11.
8. P2-01 → P2-08.
9. P3-01 → P3-08.

<a id="5-ke-hoach-hoan-thien-theo-phasesprint"></a>
## 5. Kế hoạch hoàn thiện theo phase/sprint

| Phase | Mục tiêu | Gói task | Kết quả mong đợi |
|---|---|---|---|
| Phase 0 — Production readiness | Đưa hệ thống tới trạng thái sẵn sàng triển khai an toàn | P0-01 → P0-10 | Có config production, runtime được chốt, backup/restore drill, monitoring/alerting, security hardening, email/reset password tối thiểu, student E2E audit production-like và release gate rõ ràng. |
| Phase 1 — Core user flows | Hoàn thiện các luồng người dùng thật và liên kết dữ liệu nghiệp vụ | P1-01 → P1-11 | Có register/onboarding thật, parent-child linking, parent monitoring, auto classification, recommendation nâng cao, assignment list/detail, assignment submission, gradebook thật, AI provider registry/CRUD và contract teacher assignment ổn định. |
| Phase 2 — Reliability/cleanup | Giảm rủi ro vận hành và dọn dẹp kỹ thuật | P2-01 → P2-08 | Solver OCR production, AI timeout/retry/fallback, cleanup settings/contracts, reward points release/backfill, weekly parent report, gamification nền và UI audit đầy đủ cho teacher/staff. |
| Phase 3 — Product expansion | Mở rộng năng lực phân tích, thương mại và đa nền tảng | P3-01 → P3-08 | Có analytics taxonomy, dashboard nâng cao, billing architecture/MVP, mobile API readiness, mobile app MVP, reporting/export nâng cao và content operations nâng cao. |

**Gợi ý nhịp sprint:** mỗi phase có thể chia thành 1–2 sprint tuỳ quy mô team và tình trạng phụ thuộc của từng task.

<a id="6-backlog-task-chi-tiet"></a>
## 6. Backlog task chi tiết

### 6.1. Phase 0 — Production readiness

| Mã | Task | Ưu tiên | Phụ thuộc | Definition of Done |
|---|---|---|---|---|
| P0-01 | Chuẩn hóa production config | P0 | Môi trường runtime, secrets, biến môi trường | Có cấu hình staging/production tách biệt, biến môi trường được validate, không hardcode secret, ứng dụng khởi động ổn định ở production-like. |
| P0-02 | Chốt MongoDB/Mongoose runtime | P0 | P0-01 | Quyết định runtime được ghi nhận rõ ràng, kết nối database/index ổn định, seed/backfill tương thích và không cần nhánh SQL cho core flow hiện tại. |
| P0-03 | Backup/restore drill | P0 | P0-02, hạ tầng lưu trữ | Có quy trình backup/restore, đã diễn tập restore thành công, ghi nhận RTO/RPO và artifact xác nhận. |
| P0-04 | Deployment verification | P0 | P0-01, P0-02 | Có checklist triển khai production-like, đã chạy xác minh thành công và lưu bằng chứng nghiệm thu. |
| P0-05 | Monitoring/alerting | P0 | P0-01, P0-04 | Có log/metric/alert cho các luồng quan trọng, ngưỡng cảnh báo rõ ràng và đã test một cảnh báo mẫu. |
| P0-06 | Security hardening | P0 | P0-01, P0-02, P0-04 | RBAC/scope/auth/session được kiểm tra, secret hygiene đạt yêu cầu, có chống user enumeration và rate limiting phù hợp. |
| P0-07 | Forgot/reset password | P0 | P0-08, auth flow | Người dùng có thể quên/đặt lại mật khẩu an toàn, token hết hạn, không lộ thông tin tài khoản và có kiểm tra negative path. |
| P0-08 | Email provider tối thiểu | P0 | P0-01 | Tích hợp ít nhất một email provider chạy được ở staging/production-like, gửi mail test thành công và có cấu hình dự phòng tối thiểu. |
| P0-09 | Student E2E audit production-like | P0 | P0-04, P0-05, P0-06, P0-07, P0-08 | Student happy path và negative path chạy được ở môi trường production-like, có artifact audit và không làm hỏng baseline đã pass. |
| P0-10 | CI/manual release gate | P0 | P0-04, P0-05, P0-09 | Có gate release rõ ràng, checklist CI/manual, điều kiện pass/fail được chuẩn hóa và có quy trình sign-off. |

### 6.2. Phase 1 — Core user flows

| Mã | Task | Ưu tiên | Phụ thuộc | Definition of Done |
|---|---|---|---|---|
| P1-01 | Register user thật | P1 | P0-01, P0-06, P0-07, P0-08 | Có luồng đăng ký người dùng thật, validate dữ liệu, xử lý trùng lặp an toàn và không cho user enumeration. |
| P1-02 | Onboarding user thật | P1 | P1-01, P0-06 | Có first-run onboarding, chọn vai trò/cá nhân hoá tối thiểu, lưu profile/theme và duy trì trạng thái sau đăng nhập. |
| P1-03 | Parent-child linking | P1 | P1-01, P0-06 | Có luồng liên kết/bỏ liên kết phụ huynh-học sinh, kiểm tra quyền truy cập và lưu lịch sử thay đổi. |
| P1-04 | Parent monitoring hoàn chỉnh | P1 | P1-03, P1-05, P1-06 | Dashboard phụ huynh hiển thị tiến độ, cảnh báo và tuần báo cho đúng child scope, RBAC đầy đủ. |
| P1-05 | Auto classification sau assessment | P1 | Kết quả assessment, scoring, dữ liệu học sinh | Sau khi submit assessment, hệ thống tự gán classification, xử lý idempotent và có khả năng backfill dữ liệu cũ. |
| P1-06 | Recommendation nâng cao | P1 | P1-05, curriculum data | Có recommendation cá nhân hóa theo classification/progress, có lý do đề xuất và fallback an toàn. |
| P1-07 | Student assignment list/detail | P1 | Teacher assignment API, P0-06 | Học sinh xem được danh sách và chi tiết bài tập được giao, trạng thái chính xác và có filter/pagination hợp lý. |
| P1-08 | Student assignment submission | P1 | P1-07, storage/upload flow | Học sinh nộp bài thành công, lưu trạng thái submit/draft nếu có, kiểm tra dữ liệu đầu vào và payload hợp lệ. |
| P1-09 | Gradebook từ submission thật | P1 | P1-08, teacher grading flow | Gradebook phản ánh bài nộp thật, tính điểm/ghi chú được lưu bền vững và có thể tái tính khi cần. |
| P1-10 | AI provider registry/CRUD | P1 | P0-01, P0-06, P0-05 | Admin có thể tạo/xem/cập nhật/khóa provider AI, log audit đầy đủ và kiểm tra validation rõ ràng. |
| P1-11 | Teacher assignment detail contract | P1 | P1-07, P1-10 | API/contract chi tiết assignment cho giáo viên ổn định, frontend/backend đồng bộ và có tài liệu các edge case chính. |

### 6.3. Phase 2 — Reliability/cleanup

| Mã | Task | Ưu tiên | Phụ thuộc | Definition of Done |
|---|---|---|---|---|
| P2-01 | Solver OCR production | P2 | P0-06, OCR service, storage/upload flow | Upload ảnh → OCR → trích xuất lời giải chạy được ở production-like, có fallback khi OCR lỗi và có log phục vụ điều tra. |
| P2-02 | AI timeout/retry/fallback | P2 | AI provider/service layer | Có timeout, retry và fallback response cho các tác vụ AI, giảm lỗi treo và có ghi nhận lỗi rõ ràng. |
| P2-03 | Admin settings cleanup | P2 | P1-10, P0-06 | Schema/settings được dọn sạch, các flag cũ được map hoặc loại bỏ, UI/API nhất quán. |
| P2-04 | Route/API contract cleanup | P2 | Route registry, frontend contracts | Các route/API được chuẩn hóa, endpoint deprecated được xử lý và contract tests không còn mơ hồ. |
| P2-05 | Reward points release/backfill | P2 | Point ledger, migration/backfill scripts | Job release/backfill idempotent, số dư points đối soát đúng và có report xác minh. |
| P2-06 | Weekly parent report | P2 | P1-03, P1-04, P0-08 | Scheduler gửi báo cáo tuần cho phụ huynh, nội dung đúng scope và có kiểm tra quyền riêng tư/cấu hình opt-out nếu có. |
| P2-07 | Gamification nền | P2 | Reward points/point ledger | Có luật gamification nền tảng như streak/badge/mốc thưởng, không xung đột với ledger hiện tại. |
| P2-08 | Teacher/staff UI audit đầy đủ | P2 | P0-04, P0-05, P1-07, P1-10, P2-03 | Hoàn tất audit UI cho teacher/staff, toàn bộ issue chính được ghi nhận, xử lý và lưu bằng chứng. |

### 6.4. Phase 3 — Product expansion

| Mã | Task | Ưu tiên | Phụ thuộc | Definition of Done |
|---|---|---|---|---|
| P3-01 | Analytics taxonomy | P3 | Core event model | Có taxonomy sự kiện, dimension/metric/ownership được mô tả và thống nhất trong tài liệu. |
| P3-02 | Advanced analytics dashboard | P3 | P3-01, data pipeline | Dashboard có bộ lọc, KPI và khả năng xem theo ngữ cảnh phù hợp, dữ liệu được kiểm chứng. |
| P3-03 | Billing architecture | P3 | Product/finance requirements | Có tài liệu kiến trúc billing, mô hình dữ liệu, risk assessment và lộ trình tích hợp được phê duyệt. |
| P3-04 | Billing MVP | P3 | P3-03 | Có MVP billing chạy trong môi trường được kiểm soát, đáp ứng được luồng thanh toán/hóa đơn tối thiểu. |
| P3-05 | Mobile API readiness | P3 | P2-04, auth/session layer | Có API phù hợp cho mobile, pagination/auth/token được chuẩn hóa và tài liệu sử dụng rõ ràng. |
| P3-06 | Mobile app MVP | P3 | P3-05 | Có app mobile MVP với các flow lõi, build/release package và hướng dẫn chạy cơ bản. |
| P3-07 | Reporting/export nâng cao | P3 | Data models, permissions | Có export/report nâng cao, hỗ trợ lọc và kiểm soát quyền truy cập dữ liệu. |
| P3-08 | Content operations nâng cao | P3 | Content library/approval flow | Có bulk operations, rollback, audit trail và quy trình vận hành nội dung nâng cao. |

<a id="7-tieu-chi-nghiem-thuchat-luong-chung"></a>
## 7. Tiêu chí nghiệm thu/chất lượng chung

- Có API/UI/runbook hoạt động ở dev/staging; riêng các hạng mục production phải có thêm production-like verification.
- Có happy path và negative path cho các luồng quan trọng.
- Có kiểm tra RBAC/scope khi chức năng liên quan quyền truy cập.
- Migration/backfill phải idempotent và có khả năng chạy lại an toàn.
- Có log, monitoring và artifact nghiệm thu để đối soát.
- Không làm hỏng baseline audit đã pass.
- Không lộ secret, không user enumeration, không bypass scope/RBAC.
- Nếu thay đổi hành vi nghiệp vụ, phải cập nhật tài liệu và evidence liên quan trước khi chốt.

<a id="8-ket-luan"></a>
## 8. Kết luận

Kế hoạch này ưu tiên chốt nền tảng production trước, sau đó hoàn thiện core user flows, tiếp theo là reliability/cleanup và cuối cùng mới mở rộng sang analytics, billing và mobile. Cách sắp xếp này giúp giữ an toàn cho baseline đã pass, giảm rủi ro release và tạo đường triển khai rõ ràng cho các phase tiếp theo.
