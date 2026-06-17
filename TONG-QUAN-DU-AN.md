# MathAI — Tài liệu Tổng quan Dự án (Chi tiết)

> Nền tảng học Toán online ứng dụng AI: cá nhân hóa lộ trình học, sinh đề/giáo trình tự động, giải bài từng bước, AI tutor, gamification, billing và vận hành đa vai trò (học sinh / phụ huynh / giáo viên / admin).

Tài liệu này mô tả kiến trúc, cấu trúc mã nguồn, mô hình dữ liệu, API, cấu hình và quy trình vận hành của toàn bộ dự án. Cập nhật: 2026-06-10.

---

## 1. Tổng quan

| Hạng mục | Mô tả |
| --- | --- |
| Tên | MathAI — Nền tảng học toán online sử dụng AI |
| Loại | Monorepo (npm workspaces): backend API + frontend web |
| Ngôn ngữ chính | TypeScript (strict mode) |
| Runtime DB | MongoDB / Mongoose (SQL trong `database/` chỉ là blueprint tham chiếu, **không** phải schema runtime) |
| Đối tượng người dùng | 4 vai trò: Học sinh, Phụ huynh, Giáo viên, Admin/Staff |
| Quy mô mã nguồn | ~596 file tracked; backend ~70 models, ~80 services, ~30 nhóm route; frontend Next.js App Router đa route-group |

### Tech Stack

- **Frontend**: Next.js 16 (App Router), React 18, TypeScript, Tailwind CSS, KaTeX + react-markdown (render Toán), lucide-react, Sentry.
- **Backend**: Node.js, Express 4, TypeScript, Mongoose 8, Zod (validation), JWT + bcryptjs (auth), Helmet/CORS (bảo mật), express-rate-limit, prom-client (metrics), node-cron (scheduler), multer (upload), web-push, Sentry.
- **AI**: OpenAI SDK (chat completions) qua provider registry có hỗ trợ fallback, governance & safety guard.
- **Thanh toán**: VNPAY, MoMo, SePay (adapter pattern).
- **Testing**: Node built-in test runner qua `tsx` (backend) và Bun/Node (frontend); fast-check (property-based).
- **Quan sát/Observability**: Sentry, Prometheus `/metrics`, health/readiness endpoints.

---

## 2. Cấu trúc Monorepo

```text
mathai/
├── package.json                # Root workspaces config + script tổng
├── .env.example                # Template biến môi trường (đầy đủ mọi phase)
├── vercel.json / .vercelignore # Cấu hình deploy Vercel
├── database/schema.sql         # SQL legacy/reference (KHÔNG phải runtime)
├── deploy/                     # Asset & script deploy (backend/frontend/database)
├── docs/                       # Tài liệu nghiệp vụ, kế hoạch, runbook, operations
├── scripts/                    # Script audit, deploy-verify, backup plan, UI review
├── test-screenshots/           # Output audit nghiệp vụ & UI (evidence)
└── packages/
    ├── backend/                # Express + TypeScript API
    └── frontend/               # Next.js 16 + Tailwind
```

> ⚠️ Lưu ý: tồn tại thư mục lồng `mathai/` ở gốc — **bỏ qua** trừ khi task nhắm rõ vào nó. Mã nguồn hoạt động nằm ở `packages/backend` và `packages/frontend`.

### Tài liệu MD có sẵn ở gốc

`README.md`, `AGENTS.md` (hướng dẫn repo), `CODEBASE_EXPLORATION.md`, `DIRECTORY_TREE.md`, `FEATURES_MATRIX.md`, `IMPLEMENTATION_STATUS.md`, `QUICK_REFERENCE.md`, `PROJECT_EXPLORATION_SUMMARY.md`, `EMOJI_ANALYSIS.md`. Thư mục `docs/` chứa báo cáo chi tiết, kế hoạch theo phase, hợp đồng sản phẩm (`product/`), runbook vận hành (`operations/`, `runbooks/`).

---

## 3. Backend (`packages/backend`)

### 3.1 Bootstrap & vòng đời

- [src/index.ts](packages/backend/src/index.ts) — entrypoint API server (kết nối DB + listen).
- [src/app.ts](packages/backend/src/app.ts) — khởi tạo Express app, thứ tự middleware quan trọng:
  1. `initSentry()` (sớm nhất)
  2. `metricsCollector` (Prometheus, bắt mọi request)
  3. `helmet` (HSTS, CSP cho phép `*.vnpayment.vn` / `*.momo.vn`, frameguard deny)
  4. `cors` (đa origin qua `CORS_ORIGIN` phân tách dấu phẩy, `credentials: true`)
  5. `morgan` log
  6. `GET /metrics` (bảo vệ bằng Bearer `METRICS_TOKEN`)
  7. **Webhook routes mount TRƯỚC `express.json()`** để giữ raw body cho HMAC verify
  8. `express.json()` + `urlencoded`
  9. `globalApiRateLimit` cho `/api/*` (600 req/phút/IP)
  10. Static `/uploads`
  11. OpenAPI spec: `GET /api/openapi.json`, `/api/v1/openapi.json`
  12. Router mount kép: `/api/v1` (chuẩn mới) và `/api` (tương thích ngược)
  13. `/health` (liveness + version) và `/health/ready` (readiness: ping MongoDB + email config)
  14. `errorHandler` (cuối cùng)
- [src/worker.ts](packages/backend/src/worker.ts) — **process riêng** chạy scheduler/cron (bật bằng `FEATURE_SCHEDULER_ENABLED`). Đăng ký 12 job (xem §3.7). Graceful shutdown trên SIGTERM/SIGINT.
- [api/index.ts](packages/backend/api/index.ts) — adapter serverless (Vercel).

### 3.2 Config ([src/config/](packages/backend/src/config/))

- [config/index.ts](packages/backend/src/config/index.ts) — `buildConfig()` validate nghiêm ngặt biến môi trường. Ở `NODE_ENV=production` bắt buộc: `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`, `APP_BASE_URL` phải hợp lệ, non-localhost, không chứa placeholder; JWT secrets phải ≥32 ký tự và khác nhau; chặn `ENABLE_DEMO_AUTH_TOKENS`. Email `console` bị cấm trong production.
- `database.ts` (kết nối Mongoose), `openai.ts` (client factory), `sentry.ts`, `feature-flags.ts` (registry feature flag từ env).

### 3.3 Middleware ([src/middleware/](packages/backend/src/middleware/))

`auth` (JWT verify), `role` (RBAC theo vai trò), `scoped-authorization` (phân quyền theo phạm vi dữ liệu — lớp/học sinh/con), `api-key` (tích hợp ngoài `X-API-Key`), `rate-limit` (global + brute-force login), `validate` (Zod), `upload` (multer), `cors`, `metrics`, `errorHandler` (kèm test bảo mật không lộ thông tin nhạy cảm).

### 3.4 Models — Mongoose (~70 collection)

Nhóm theo miền nghiệp vụ:

- **Identity & RBAC**: `user`, `role-profile`, `teacher`, `student`, `parent-child`, `permission-grant`, `password-reset-request`.
- **Học tập / Nội dung**: `curriculum`, `lesson`, `content-library`, `content-assignment`, `progress`, `assessment`, `gradebook`, `solver`, `chat`, `ai-tutor`.
- **AI & Governance**: `ai-log`, `approval`, `audit-log`, `webhook-log`, `ocr-result`.
- **Gamification**: `point-ledger`, `badge`, `student-badge`, `student-streak`, `leaderboard-snapshot`, `engagement`.
- **Billing & Payment**: `plan`, `subscription`, `invoice`, `billing-transaction`, `payment-transaction`, `payment-gateway-config`, `entitlement-grant`.
- **Anti-fraud & Risk**: `fraud-signal`.
- **Notification**: `notification`, `notification-template` (+ seed), `notification-delivery`, `push-subscription`.
- **Analytics**: `analytics-daily-revenue`, `analytics-daily-user-activity`, `analytics-lesson-engagement`, `analytics-cohort-retention`.
- **Hạ tầng**: `base.model` (helper chung), `setting`, `scheduled-job`.

### 3.5 Services ([src/services/](packages/backend/src/services/), ~80 file)

Lớp logic nghiệp vụ chính:

- **AI core**: [ai.service.ts](packages/backend/src/services/ai.service.ts) (chat completion có timeout/retry/fallback, redact dữ liệu nhạy cảm khi log), `ai-provider-registry.service` (chọn provider + fallback), `ai-governance.service`, `ai-safety-guard.service`, `classification.service`, `recommendation.service`, `personalization.service`.
- **Học tập**: `assessment.service`, `assessment-auto-classification`, `assessment-anomaly-detector.service`, `curriculum.service`, `lesson.service`, `solver.service`, `solver-abuse-detector.service`, `content-library.service`, `student-assignment.service`, `gradebook.service`.
- **Người dùng & quyền**: `auth.service`, `student.service`, `teacher.service`, `scoped-authorization.service`, `admin-approval.service`, `audit.service`, `parent-monitoring.service`.
- **Gamification**: `gamification.service`, `point.service`.
- **Billing/Payment**: `billing.service`, `service-plan-catalog`, [payment/](packages/backend/src/services/payment/) (registry + adapter `momo`, `vnpay`, `sepay`, `gateway-credentials`, `gateway.types`).
- **Notification**: `notification.service`, `notification-template.service`, `notification-preference.service`, `email.service`, `sms.service`, `push.service`.
- **Risk & Fraud**: `risk.service`, `fraud-signal.service`, `fraud-signal-review.service`.
- **Analytics & vận hành**: `analytics-aggregate.service`, `attendance.service`, `engagement.service`, `scheduler.service`, `health.service`, `ocr-storage.service`, `parent-weekly-report-scheduler.service`.

### 3.6 Routes ([src/routes/](packages/backend/src/routes/))

Đăng ký trong [routes/index.ts](packages/backend/src/routes/index.ts), mount kép dưới `/api` và `/api/v1`:

| Prefix | Mô tả |
| --- | --- |
| `/auth` | Đăng ký, đăng nhập, refresh, reset mật khẩu |
| `/students` | Hồ sơ & dữ liệu học sinh |
| `/assessments` | Sinh/đánh giá đề kiểm tra |
| `/curricula`, `/curriculum` | Sinh & quản lý giáo trình cá nhân hóa |
| `/lessons` | Bài học, gợi ý bài học hôm nay |
| `/solver` | AI giải toán từng bước |
| `/chat` | AI tutor hội thoại |
| `/dashboard` | Tiến độ học tập |
| `/engagement` | Tương tác / streak |
| `/parent` | Cổng phụ huynh |
| `/teacher` | Cổng giáo viên |
| `/admin`, `/admin/analytics`, `/admin/billing` | Quản trị, phân tích, billing |
| `/content-library` | Thư viện nội dung (curricula/lessons/assignments) |
| `/risk-review` | Soát xét rủi ro |
| `/notifications` | Thông báo & template |
| `/billing` | Gói, hóa đơn, thanh toán phía người dùng |
| `/external` | Tích hợp server-to-server (`X-API-Key`) |
| (gamification) | Điểm thưởng, badge, leaderboard |
| `/api/webhooks/*` | Webhook thanh toán (mount riêng, raw body) |

### 3.7 Worker & Scheduled Jobs ([src/jobs/](packages/backend/src/jobs/))

Chạy bằng process `worker.ts` (cron qua `scheduler.service`, timezone `Asia/Ho_Chi_Minh`). 12 job:

| Job | File | Mục đích |
| --- | --- | --- |
| A/B Attendance | `attendance.jobs` | Đánh dấu vắng pending & finalize |
| C Risk | `risk.jobs` | Tính điểm rủi ro hằng ngày |
| D Parent report | `parent-report.jobs` | Gửi báo cáo tuần cho phụ huynh |
| E Notification | `notification.jobs` | Retry thông báo thất bại |
| F OCR | `ocr.jobs` | Dọn kết quả OCR hết hạn |
| G Payment | `payment.jobs` | Hết hạn payment intent treo |
| H/I Subscription | `subscription.jobs` | Gia hạn & hết hạn quá hạn |
| J Billing | `billing.jobs` | Nhắc hóa đơn |
| K Analytics | `analytics.jobs` | Refresh analytics ngày |
| L Gamification | `gamification.jobs` | Refresh leaderboard |

### 3.8 Scripts vận hành ([scripts/](packages/backend/scripts/))

`seed.ts` (seed demo, chặn production trừ `SEED_ALLOW_PRODUCTION=true`), `backfill-assessment-attempt-points.ts`, `backfill-assessment-classifications.ts`, `migrate-point-ledger-indexes.ts`, `send-parent-weekly-reports.ts` — đều có test đi kèm.

### 3.9 Khác

- `docs/openapi.ts` — sinh OpenAPI spec cho đối tác.
- `constants/` — `ai-governance.ts`, `math-format.ts`.
- `utils/` — `errors.ts`, `helpers.ts`, `response.ts`, `scoring.ts`, `rubric-grading.ts`, `openai-chat-compat.ts`.
- `validators/` — Zod schema cho auth, assessment, curriculum, student, parent, content-library.

---

## 4. Frontend (`packages/frontend`)

Next.js 16 App Router, chia theo **route group** (mỗi group có `layout.tsx` riêng cho RBAC/giao diện):

| Route group | Đường dẫn | Vai trò |
| --- | --- | --- |
| `(auth)` | `/login`, `/register`, `/forgot-password`, `/reset-password` | Công khai |
| `(dashboard)` | `/dashboard/*` (lessons, assessment, assignments, chat, curriculum, solver, progress, points, billing, settings) | Học sinh |
| `(parent)` | `/parent/*` (children, reports, notifications, settings) | Phụ huynh |
| `(teacher)` | `/teacher/*` (classes, students, gradebook, assignments, analytics, content-library, proposals) | Giáo viên |
| `(admin)` | `/admin/*` (users, teachers, students, classes, content, content-library, assignments, analytics, billing, ai-governance, ai-logs, ai-providers, audit, activity, risk-review, scheduler, notifications, reports, proposals, settings, tutors) | Admin/Staff |

### Thành phần chính

- **API routes** (`src/app/api/`): `ai/chat/route.ts`, `ai/models/route.ts` (proxy AI phía Next).
- **Components** (`src/components/`): `MathMarkdown` (render LaTeX/KaTeX), `FunctionGraph`, `LessonIllustration`, `LessonTimelineNav`, các form/detail/stats cho Assignment, Lesson template, Curriculum template, `SubmissionAttachmentUploader`, `SubmissionHistory`, `LateBadge`, `ContentAssignmentDialog`, `ContentLibraryList`.
- **lib/** (`src/lib/`): `api.ts` + `api-routes.ts` (client API), `chat.ts`, `content-library.ts`, `lesson-content.ts` / `lesson-endpoints.ts` / `lesson-fallbacks.ts`, `math-text.ts`, `function-graph.ts`, `recommendation-ui.ts`, `auth-onboarding.ts`, `demo-auth.ts`, `env-config.ts`.
- **hooks/contexts**: `useAuth.ts`, `AgeThemeContext.tsx` (theme cá nhân hóa theo độ tuổi).
- **Observability**: `sentry.client/server/edge.config.ts`, `instrumentation.ts`.
- **public/**: SVG minh họa bài học (algebra, geometry, equation, graph...), `vietnam-flag.svg`, favicon.

---

## 5. Mô hình dữ liệu & nghiệp vụ cốt lõi

Luồng học sinh tiêu biểu:

1. **Đăng ký & hồ sơ** → cá nhân hóa.
2. **Kiểm tra đầu vào** (`assessment`) → AI sinh đề, auto-classification, anomaly detector chống gian lận.
3. **Giáo trình cá nhân hóa** (`curriculum`) → AI dựng lộ trình.
4. **Học bài + luyện tập** (`lesson`, `progress`, `content-library`) → lý thuyết + bài tập + quiz.
5. **Gợi ý bài học hôm nay** (`recommendation.service`).
6. **AI Solver** (`solver`) → giải từng bước; có `solver-abuse-detector` chống lạm dụng + entitlement gate.
7. **AI Tutor Chat** (`chat`, `ai-tutor`).
8. **Gamification**: điểm (`point-ledger`), badge, streak, leaderboard.
9. **Theo dõi**: dashboard học sinh, monitoring phụ huynh, gradebook & analytics giáo viên/admin.
10. **Billing**: plan → subscription → invoice → payment (VNPAY/MoMo/SePay) → entitlement.

Lớp **AI Governance** xuyên suốt: mọi gọi AI được log (`ai-log`), redact dữ liệu nhạy cảm, qua safety guard và transparency metadata; có audit-log + approval workflow.

---

## 6. Biến môi trường (env)

Sao chép từ [.env.example](.env.example). Các nhóm chính:

- **Core backend**: `NODE_ENV`, `BACKEND_PORT` (3001), `BACKEND_URL`, `CORS_ORIGIN`, `APP_BASE_URL`.
- **MongoDB**: `MONGODB_URI`, `DB_NAME`.
- **JWT**: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN` (7d).
- **Email** (reset mật khẩu): `EMAIL_PROVIDER` (console|http), `EMAIL_API_URL/KEY`, `EMAIL_FROM/REPLY_TO`.
- **Demo gates**: `NEXT_PUBLIC_ENABLE_DEMO_LOGIN`, `ENABLE_DEMO_AUTH_TOKENS` (giữ false ở production).
- **AI**: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` (gpt-4o-mini).
- **Frontend**: `NEXT_PUBLIC_API_URL` (phải public, non-localhost ở production), `BACKEND_API_URL` (rewrite dev).
- **Object Storage** (OCR/upload): `STORAGE_PROVIDER` (local|s3), cấu hình S3, `STORAGE_OCR_RETENTION_DAYS`, `OCR_DAILY_QUOTA_PER_STUDENT`.
- **Scheduler**: `SCHEDULER_TIMEZONE`, `ATTENDANCE_*_GRACE_MINUTES`.
- **SMS/Push** (Phase 2): `SMS_PROVIDER` (console|twilio|esms), `PUSH_PROVIDER` (console|fcm|web-push), VAPID/FCM keys.
- **Payment** (Phase 3): `PAYMENT_VNPAY_*`, `PAYMENT_MOMO_*`, `PAYMENT_INTENT_TTL_SECONDS`.
- **Observability**: `SENTRY_DSN`, `METRICS_TOKEN`, `LOG_LEVEL`.
- **Feature flags**: `FEATURE_SCHEDULER_ENABLED`, `FEATURE_ATTENDANCE_AUTO_FINALIZE`, `FEATURE_RISK_DAILY_BATCH`, `FEATURE_BILLING_ENFORCEMENT`, `FREE_DAILY_QUOTA`, `FEATURE_SCOPED_AUTHORIZATION_ENFORCEMENT`, `FEATURE_AUDIT_LOGGING`, `FEATURE_AI_SAFETY_GUARD`, `FEATURE_ANTI_FRAUD_SIGNAL_GENERATION`, `FEATURE_GRADEBOOK_SUMMARIES`, `FEATURE_DEPLOYMENT_CHECKPOINTS`.

---

## 7. Cài đặt & chạy

```bash
# 1. Cài dependencies (root workspaces)
npm install

# 2. Cấu hình env
cp .env.example .env
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env

# 3. Seed dữ liệu demo (dev/staging)
npm run seed --workspace=packages/backend

# 4. Chạy dev (kill port 3444/3001 trước, rồi chạy cả 2)
npm run dev
# Hoặc riêng:
npm run dev:backend     # Express @ 3001 (tsx watch)
npm run dev:frontend    # Next.js @ 3444
npm run dev:worker --workspace=packages/backend   # scheduler
```

Yêu cầu: Node ≥ 18, npm ≥ 9, MongoDB (local/Atlas), Bun ≥ 1.3 (một số test frontend).

### Tài khoản demo (dev/staging, mật khẩu `MathAI@Demo123`)

| Vai trò | Email |
| --- | --- |
| Admin | `admin@mathai.vn` |
| Giáo viên | `teacher@mathai.vn` |
| Học sinh | `student@mathai.vn` |
| Phụ huynh | `parent@mathai.vn` |

---

## 8. Build, Test & Verify

```bash
npm run build              # build backend (tsc) + frontend (next build)
npm run test:backend       # node --test qua tsx
npm run test:frontend      # bun/node test
npm run verify:backend     # test + tsc build backend
npm run verify:frontend    # lint:reward-points + test + next build
npm run verify             # toàn bộ monorepo
```

Lưu ý:
- Backend **không có** lint tool — `verify:backend` chỉ chạy test + `tsc`.
- Frontend dùng `lint:reward-points` (scoped) làm gate thay vì `eslint .` đầy đủ (baseline lint cũ còn nhiều cảnh báo).
- Script vận hành khác: `npm run audit:business`, `audit:teacher-staff-ui`, `backup:plan`, `deploy:verify`, `build:deploy`.

CI: [.github/workflows/verify.yml](.github/workflows/verify.yml).

---

## 9. Bảo mật & Vận hành

- **Auth**: JWT (access + refresh), bcrypt hash, brute-force rate limit ở login.
- **RBAC + scoped authorization**: phân quyền theo vai trò và theo phạm vi dữ liệu (lớp/học sinh/con) — bật bằng `FEATURE_SCOPED_AUTHORIZATION_ENFORCEMENT`.
- **Audit log** mọi hành động nhạy cảm; **approval workflow** cho thay đổi quan trọng.
- **AI safety**: governance, safety guard, redact dữ liệu nhạy cảm khi log AI, transparency metadata.
- **Anti-fraud**: fraud-signal generation, solver abuse detector, assessment anomaly detector.
- **Webhook**: HMAC verify trên raw body (mount trước `express.json()`).
- **Headers**: Helmet (HSTS, CSP, frameguard) bật ở production.
- **Observability**: Sentry, Prometheus `/metrics` (Bearer token), `/health` + `/health/ready`.
- **Runbooks** (`docs/operations/`, `docs/runbooks/`): disaster recovery, high availability, secret rotation, alerting rules, mongo backup/restore, deployment verification & recovery drills.

---

## 10. Deploy

- **Vercel**: `vercel.json` ở gốc + trong từng package; `.vercelignore`. Backend có adapter serverless [api/index.ts](packages/backend/api/index.ts).
- Thư mục [deploy/](deploy/) chứa biến mẫu, `server.js`/`start-frontend.js` và schema cho môi trường deploy độc lập.
- Production: secrets lưu ở secret manager nền tảng; `NEXT_PUBLIC_API_URL` trỏ tới backend public; không bật demo flags.

---

## 11. Bản đồ nhanh (Quick Map)

| Cần tìm | Vị trí |
| --- | --- |
| Khởi tạo app & middleware | [packages/backend/src/app.ts](packages/backend/src/app.ts) |
| Validate cấu hình env | [packages/backend/src/config/index.ts](packages/backend/src/config/index.ts) |
| Đăng ký route | [packages/backend/src/routes/index.ts](packages/backend/src/routes/index.ts) |
| Cron/scheduler | [packages/backend/src/worker.ts](packages/backend/src/worker.ts) + `src/jobs/` |
| Logic AI | [packages/backend/src/services/ai.service.ts](packages/backend/src/services/ai.service.ts) |
| Thanh toán | [packages/backend/src/services/payment/](packages/backend/src/services/payment/) |
| Client API frontend | [packages/frontend/src/lib/api.ts](packages/frontend/src/lib/api.ts) |
| Render Toán (LaTeX) | [packages/frontend/src/components/MathMarkdown.tsx](packages/frontend/src/components/MathMarkdown.tsx) |
| Trang theo vai trò | `packages/frontend/src/app/(admin|teacher|parent|dashboard)/` |
| Hướng dẫn repo | [AGENTS.md](AGENTS.md) |
```
