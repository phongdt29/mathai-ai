# BÁO CÁO TÌNH TRẠNG DỰ ÁN MATHAI

**Ngày cập nhật:** 07/06/2026  
**Phiên bản:** 2.0  
**Phạm vi:** Đối chiếu tài liệu kế hoạch/roadmap với source hiện tại trong `packages/backend` và `packages/frontend`  
**Nguồn đối chiếu:** `docs/Đặc tả chức năng & Logic.xlsx`, `docs/ke-hoach-hoan-thien-du-an-mathai.md`, `docs/implementation-plan.md`, `docs/p0-foundation-audit.md`, `docs/BAO-CAO-KIEM-THU-TOAN-BO.md`, source code hiện tại

---

## I. TỔNG QUAN DỰ ÁN

| Hạng mục | Mô tả |
|----------|-------|
| Tên hệ thống | Nền tảng học toán online cá nhân hóa bằng A.I |
| Mục tiêu | Giúp học sinh lớp 6-12 cải thiện tư duy và điểm số thông qua lộ trình cá nhân hóa |
| Kiến trúc | Monorepo npm workspaces |
| Backend | Express.js + TypeScript + MongoDB/Mongoose |
| Frontend | Next.js App Router + TypeScript + Tailwind CSS |
| Runtime dữ liệu | MongoDB/Mongoose là source of truth; SQL trong `database/` là blueprint/reference |
| Vai trò hệ thống | student, parent, teacher, admin, staff |
| Trạng thái tổng quát | Feature-complete rộng cho web/backend; còn cần xác minh vận hành production |

### Nhận định nhanh

Dự án hiện đã đi xa hơn đáng kể so với báo cáo tình trạng cũ ngày 18/05/2026. Nhiều hạng mục từng được ghi là chưa có hoặc chỉ nằm trong roadmap nay đã có code triển khai trong backend/frontend, gồm billing/payment, notification đa kênh, scheduler/worker, gamification, admin/staff operations và analytics.

Tuy nhiên, trạng thái production-ready vẫn phụ thuộc vào bằng chứng vận hành thực tế: deploy backend cloud, bật worker/scheduler, cấu hình provider thật, chạy lại verification, kiểm tra payment webhook và xử lý storage bền vững cho OCR/uploads.

---

## II. TÀI LIỆU KẾ HOẠCH VÀ TRẠNG THÁI

| Tài liệu | Vai trò | Nhận xét cập nhật |
|----------|---------|-------------------|
| `AGENTS.md` | Quy chuẩn repo | Xác nhận code active ở `packages/backend` và `packages/frontend`; runtime dùng MongoDB/Mongoose. |
| `README.md` | Hướng dẫn setup/verify | Có scripts dev/build/verify, seed, production env contract; ghi chú frontend lint global còn baseline issue. |
| `docs/BAO-CAO-TINH-TRANG-DU-AN.md` | Báo cáo tình trạng | Bản cũ đã lỗi thời ở các mục notification, billing, scheduler, gamification, admin UI. File này là bản cập nhật thay thế. |
| `docs/ke-hoach-hoan-thien-du-an-mathai.md` | Roadmap P0-P3 | Nhiều mục P1/P2/P3 đã được code triển khai, nhưng vẫn cần production-like verification. |
| `docs/implementation-plan.md` | Kế hoạch triển khai chi tiết | Có một số phần lịch sử dùng stack khác; các update sau đã chốt Express + MongoDB. |
| `docs/p0-foundation-audit.md` | Audit nền tảng | Hữu ích để xác nhận MongoDB/Mongoose là runtime hiện tại và SQL là legacy/reference. |
| `docs/BAO-CAO-KIEM-THU-TOAN-BO.md` | Báo cáo kiểm thử toàn bộ | Claim production-ready/97%, nhưng cần chạy lại verification trên môi trường hiện tại để xác nhận. |

---

## III. ĐỐI CHIẾU MODULE THEO ĐẶC TẢ

| # | Module | Backend hiện tại | Frontend hiện tại | Trạng thái cập nhật |
|---|--------|------------------|-------------------|---------------------|
| 1 | Đăng ký người dùng | Có auth register/login/refresh/reset, RBAC, brute-force/rate-limit | Có form/register/settings | Đã triển khai mạnh; cần xác minh email/reset production. |
| 2 | Kiểm tra đầu vào | Có assessment generate/submit/grade/classify | Có assessment page/flow | Đã triển khai mạnh; cần kiểm thử end-to-end dữ liệu thật. |
| 3 | Giáo trình AI | Có curriculum/lesson/recommendation services | Có curriculum/lesson pages | Đã triển khai mạnh; phụ thuộc provider AI thật cho chất lượng sinh nội dung. |
| 4 | Dashboard tiến độ | Có dashboard/progress/mastery/points APIs | Có dashboard/progress/points | Đã triển khai mạnh. |
| 5 | Kiểm tra cuối buổi | Có lesson quiz/scoring/idempotency | Có lesson/quiz UI | Đã triển khai mạnh. |
| 6 | Gợi ý học tiếp | Có recommendation multi-signal/forgetting curve | Có UI/API recommendation | Đã triển khai; cần xác minh chất lượng trên dữ liệu thật. |
| 7 | AI Solver text/ảnh | Có solver text, OCR/image parse, safety, abuse detection | Có solver page text/OCR | Đã triển khai; OCR cần hardening storage/provider/rate-limit production. |
| 8 | Personalization | Có profile/theme/tutor/personality | Có settings/theme/tutor | Đã triển khai; cần audit toàn flow. |
| 9 | Thông báo | Có notification/email/SMS/push/templates/deliveries/retries | Có parent/admin notification pages | Đã vượt trạng thái in-app; cần xác minh credentials/provider thật và worker retry. |
| 10 | User flow hoàn chỉnh | Có flow register -> assessment -> curriculum -> lesson -> quiz -> recommendation | Có pages theo student/parent/teacher/admin | Web flow chính đã có; cần E2E production-like. |
| 11 | Thanh toán | Có billing/payment/subscription/webhook/entitlement services | Có admin billing và billing-related UI | Đã có code triển khai; cần kiểm chứng sandbox/production callbacks. |

---

## IV. ĐỐI CHIẾU 29 TASK CHÍNH

| # | Task | Trạng thái hiện tại | Ghi chú |
|---|------|---------------------|---------|
| 1 | Auth + RBAC | Đã triển khai mạnh | JWT, refresh, roles, scoped auth, rate-limit. |
| 2 | Đăng ký/onboarding/profile/theme/tutor | Đã triển khai | Cần xác minh với user thật và reset/email production. |
| 3 | Assessment đầu vào | Đã triển khai mạnh | AI generate, submit, grading, classification. |
| 4 | Classification sau assessment | Đã triển khai | Có service phân loại rule + AI/multi-signal. |
| 5 | Curriculum cá nhân hóa | Đã triển khai | Phụ thuộc chất lượng provider AI và dữ liệu thật. |
| 6 | Dashboard/progress/points | Đã triển khai mạnh | Có point ledger và UI points/progress. |
| 7 | Lesson/exercise/quiz | Đã triển khai mạnh | Có lifecycle lesson/quiz. |
| 8 | Recommendation nâng cao | Đã triển khai | Cần đánh giá chất lượng đề xuất trên dữ liệu thật. |
| 9 | Solver text/safety | Đã triển khai mạnh | Có progressive disclosure và safety guard. |
| 10 | Solver image/OCR | Đã triển khai, cần hardening | Cần storage bền vững và provider vision production. |
| 11 | AI Tutor Chat | Đã triển khai | Có conversations/messages/settings/tutors. |
| 12 | Reward points/ledger | Đã triển khai mạnh | Có ledger, summary/history, adjustment/backfill. |
| 13 | Parent dashboard/children/preferences | Đã triển khai | Cần E2E scope/privacy và weekly reports thật. |
| 14 | Teacher classes/assignments/gradebook | Đã triển khai mạnh | Cần xác minh dữ liệu submission thật. |
| 15 | Học sinh nhận/nộp assignment | Có dấu hiệu đã triển khai | Cần test flow student submission end-to-end. |
| 16 | Content library/template/approval | Đã triển khai | Có route/service và UI teacher/admin. |
| 17 | Admin/staff operations | Đã triển khai rộng | Có nhiều trang admin và restrictions cho staff. |
| 18 | Engagement/attendance/risk/fraud | Đã triển khai | Scheduler/worker cần chạy thật. |
| 19 | AI governance/logs/safety | Đã triển khai | Cần provider/env production và audit retention. |
| 20 | AI provider registry/CRUD | Đã triển khai | Cần test CRUD/test connection và quyền admin/staff. |
| 21 | Notification đa kênh | Đã có code, cần xác minh vận hành | Email/SMS/push phụ thuộc credentials/provider và worker retry. |
| 22 | Forgot/reset password production | Có code, cần xác minh provider | Cần gửi mail thật, token one-time/expiry, negative path. |
| 23 | Weekly report phụ huynh | Có code/job, cần bật scheduler | Cần xác minh email/report history/opt-out. |
| 24 | Backup/monitoring/production hardening | Có nền tảng, cần vận hành thật | Metrics/Sentry/health có code; backup/alert cần artifact. |
| 25 | MongoDB/Mongoose runtime + seed | Đã hoàn thiện nền | Runtime MongoDB/Mongoose đã chốt. |
| 26 | Gamification badge/streak/leaderboard | Đã triển khai | Cần kiểm thử luật nghiệp vụ và fairness. |
| 27 | Mobile app | Chưa triển khai rõ | Chưa thấy app Expo/React Native/Capacitor riêng. |
| 28 | Subscription/billing | Đã triển khai | Cần kiểm chứng provider payment, webhook, idempotency. |
| 29 | Analytics nâng cao/cohort/warehouse | Một phần đã triển khai | Có admin analytics/metrics/job; warehouse/cohort độc lập chưa rõ. |

---

## V. TRẠNG THÁI THEO PHASE ROADMAP

| Phase | Mục tiêu | Trạng thái cập nhật | Nhận xét |
|-------|----------|---------------------|----------|
| P0 | Production readiness | Đã có nền tảng, chưa đủ bằng chứng vận hành | Config, security, metrics, Sentry, health/readiness có code; cần deploy backend/worker, alert, backup/restore drill, release gate mới. |
| P1 | Core user flows | Phần lớn đã triển khai | Student/parent/teacher/admin flows có UI/API; cần E2E production-like và dữ liệu thật. |
| P2 | Reliability/cleanup | Nhiều hạng mục đã có code | OCR, AI fallback, weekly report, gamification, audit UI có triển khai; cần hardening và contract tests. |
| P3 | Product expansion | Một số mục đã vượt roadmap | Billing/gamification/admin analytics đã có; mobile app vẫn chưa rõ. |

---

## VI. ĐIỂM MẠNH HIỆN TẠI

1. **Backend domain coverage rộng:** route/service/model đã bao phủ learning, AI, billing, notifications, admin, teacher, parent, gamification và analytics.
2. **Kiến trúc production foundation tốt:** có Helmet/CORS/rate-limit, Sentry, Prometheus metrics, health/readiness và worker process.
3. **Role-based product đã khá đầy đủ:** student, parent, teacher, admin/staff đều có luồng backend/frontend tương ứng.
4. **AI learning core đã rõ:** assessment, classification, curriculum, recommendation, solver, tutor chat đều có module riêng.
5. **Các hạng mục monetization/operations đã tiến xa:** billing/payment/subscription, notification đa kênh, scheduler/worker và gamification không còn chỉ là roadmap.

---

## VII. RỦI RO VÀ KHOẢNG TRỐNG

| Rủi ro | Mức độ | Mô tả | Hành động khuyến nghị |
|--------|--------|-------|-----------------------|
| Chênh lệch tài liệu theo thời điểm | Cao | Báo cáo cũ ghi ~70%, báo cáo mới claim ~97%; source nghiêng về trạng thái mới nhưng cần verification. | Chạy lại `npm run verify` và lưu artifact mới. |
| Production deployment backend/worker | Cao | Có code worker nhưng cần process riêng, feature flag và hạ tầng chạy ổn định. | Deploy API + worker, bật `FEATURE_SCHEDULER_ENABLED`, kiểm tra readiness. |
| Provider thật cho AI/email/SMS/push/payment | Cao | Code có adapter/service nhưng production phụ thuộc env/credentials. | Smoke test từng provider ở staging/production-like. |
| OCR/uploads storage | Cao | Upload local `/uploads` không phù hợp nếu serverless/nhiều instance. | Chuyển sang object storage như S3/R2 hoặc storage bền vững. |
| Payment webhook/callback | Cao | Billing đã có code nhưng cần xác minh callback thật, idempotency, signature. | Chạy test sandbox VNPAY/MOMO và kiểm tra webhook logs. |
| Frontend lint baseline | Trung bình | README ghi global ESLint còn issue nền, gate scoped hơn. | Làm sạch global lint hoặc ghi rõ release exception. |
| Mobile app | Trung bình | Chưa thấy app mobile native/MVP riêng. | Chốt scope mobile: responsive web, API readiness hay native app. |
| Advanced warehouse/cohort analytics | Thấp-Trung bình | Có admin analytics nhưng pipeline warehouse độc lập chưa rõ. | Tách yêu cầu analytics nâng cao khỏi dashboard hiện tại. |

---

## VIII. ƯU TIÊN 30 NGÀY TỚI

### 1. Xác minh release hiện tại

- Chạy `npm run verify` từ root và lưu kết quả.
- Chạy smoke test cho backend API, frontend build, worker startup và health/readiness.
- Đối chiếu lại số lượng tests/pages/build với `docs/BAO-CAO-KIEM-THU-TOAN-BO.md`.

### 2. Chốt production operations

- Deploy backend cloud và worker process riêng.
- Bật scheduler bằng cấu hình production phù hợp.
- Cấu hình Sentry, metrics token, alerting, MongoDB Atlas network/IP whitelist.
- Thực hiện backup/restore drill và lưu artifact.

### 3. Kiểm tra provider thật

- AI provider cho solver/OCR/chat/curriculum.
- Email provider cho forgot/reset và weekly report.
- SMS/push provider cho notification đa kênh.
- VNPAY/MOMO sandbox hoặc production callback.

### 4. Hardening các luồng rủi ro cao

- Payment webhook idempotency, signature, replay protection.
- Authorization backend cho admin/teacher/parent/student/staff.
- OCR upload storage, cleanup lifecycle, file size/type validation.
- Notification retry, quiet hours, opt-out/privacy.

### 5. Quyết định phạm vi mobile

- Nếu chưa cần native app, ghi rõ mobile hiện tại là responsive web + mobile API readiness.
- Nếu cần mobile MVP, tạo kế hoạch riêng cho Expo/React Native/Capacitor.

---

## IX. KẾT LUẬN

MathAI hiện không còn ở trạng thái khoảng 70% như báo cáo cũ. Source code hiện tại cho thấy dự án đã đạt mức **feature-complete rộng cho web/backend**, với nhiều module production-oriented đã có sẵn: billing, notification đa kênh, scheduler/worker, gamification, analytics, admin/staff operations và AI governance.

Đánh giá phù hợp nhất tại thời điểm cập nhật là:

> **Gần release candidate cho web/backend, nhưng chưa nên coi là production-ready tuyệt đối nếu chưa có verification mới và bằng chứng vận hành production-like.**

Phần còn lại không còn chủ yếu là xây UI hay viết module mới, mà là **kiểm chứng, cấu hình provider thật, triển khai hạ tầng, chạy worker, hardening storage/payment/notification và lưu artifact nghiệm thu**.
