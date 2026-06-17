# Hướng dẫn Build & Deploy Production — MathAI

Cách build và đưa code lên production. Dự án hỗ trợ **2 con đường**:

- **A. Vercel** (serverless) — frontend Next.js + backend Express-as-function, mỗi cái 1 project.
- **B. Self-host** (VPS/server riêng) — dựng *deploy artifact* rồi chạy bằng Node.

> Liên quan: [Tổng quan dự án](../TONG-QUAN-DU-AN.md). Runtime là **MongoDB/Mongoose**; thư mục `database/*.sql` chỉ là tài liệu tham chiếu.

---

## 0. Nguyên tắc build production (đọc trước)

Backend và frontend có **guard chặn cấu hình sai** khi `NODE_ENV=production`. Build/khởi động sẽ **fail** nếu vi phạm:

| Biến | Yêu cầu ở production |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Bắt buộc, URL `http(s)` tuyệt đối, **không localhost**. Cần **ngay lúc build frontend** |
| `BACKEND_API_URL` | Production thường **để trống** (rewrite bị tắt). Nếu set, phải non-localhost — đây là lỗi hay gặp khi build nhầm với `.env` dev |
| `MONGODB_URI` | Chuỗi kết nối hợp lệ, **không localhost** |
| `CORS_ORIGIN`, `APP_BASE_URL` | URL hợp lệ, **không localhost** |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | ≥ 32 ký tự, ngẫu nhiên, **khác nhau**, không chứa text placeholder |
| `EMAIL_PROVIDER` | Phải `http` (không dùng `console`) + có `EMAIL_API_URL` (HTTPS) và `EMAIL_API_KEY` |
| `ENABLE_DEMO_AUTH_TOKENS`, `NEXT_PUBLIC_ENABLE_DEMO_LOGIN` | Phải `false` |

> ⚠️ **Lỗi build hay gặp:** chạy `npm run build` với file `.env` dev (có `localhost`) → frontend báo `NEXT_PUBLIC_API_URL/BACKEND_API_URL must not point to localhost in production`. Đảm bảo môi trường build dùng giá trị production, hoặc **không nạp** `.env` dev khi build.

Sinh JWT secret an toàn:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 1. Lệnh build (chung)

```bash
# Build cả backend (tsc → dist/) và frontend (next build → .next/)
NEXT_PUBLIC_API_URL=https://api.your-domain.example/api npm run build

# Build riêng
npm run build:backend     # tsc → packages/backend/dist
NEXT_PUBLIC_API_URL=https://api.your-domain.example/api npm run build:frontend
```

- Backend: `tsc` → chạy bằng `node packages/backend/dist/index.js`.
- Frontend: `next build` với `output: "standalone"` → sinh `packages/frontend/.next/standalone`.

**Verify trước khi build production:**
```bash
npm run verify   # backend test+build + frontend lint+test+build
```

---

## 2. Cách A — Deploy lên Vercel

Cấu hình Vercel đã có sẵn trong repo (3 file `vercel.json`). Tạo **2 project Vercel** từ cùng repo:

### A.1. Project Frontend
Dùng `vercel.json` ở **gốc repo**:
- Framework: `nextjs`
- Install: `npm install`
- Build: `npm run build --workspace=packages/frontend`
- Output: `packages/frontend/.next`

**Env cần đặt trong Vercel dashboard (Project Settings → Environment Variables):**
```
NEXT_PUBLIC_API_URL = https://<backend-domain>/api
NEXT_PUBLIC_ENABLE_DEMO_LOGIN = false
# (tùy chọn) NEXT_PUBLIC_SENTRY_DSN, SENTRY_AUTH_TOKEN
```
> Không đặt `BACKEND_API_URL` (production rewrite tắt). Frontend gọi thẳng `NEXT_PUBLIC_API_URL`.

### A.2. Project Backend
Đặt **Root Directory = `packages/backend`** trong Vercel; nó dùng [packages/backend/vercel.json](../packages/backend/vercel.json):
- Mọi request rewrite về function `api/index.ts` (maxDuration 60s).
- Install: `cd ../.. && npm install`.

**Env cần đặt:** toàn bộ biến backend production (`MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`, `APP_BASE_URL`, `EMAIL_*`, `OPENAI_API_KEY` nếu bật AI, các `FEATURE_*`...). Xem mẫu redacted ở §4.

### A.3. Lưu ý Vercel
- `CORS_ORIGIN` (backend) = domain frontend; `NEXT_PUBLIC_API_URL` (frontend) = domain backend + `/api`.
- **Cron/scheduler không chạy trong serverless** — dùng Vercel Cron Jobs hoặc một worker self-host riêng (xem §3.3).
- Storage: production nên dùng `STORAGE_PROVIDER=s3` (S3/R2/MinIO), không dùng `local`.

---

## 3. Cách B — Self-host (build artifact)

### 3.1. Dựng artifact
```bash
# Build + đóng gói toàn bộ vào thư mục deploy/
npm run build:deploy
```
Lệnh [scripts/build-deploy.js](../scripts/build-deploy.js) sẽ:
1. `npm run build` (backend + frontend).
2. Tạo `deploy/` gồm:
   - `deploy/backend/dist` + `package.json`
   - `deploy/frontend/` (Next.js standalone) + `start-frontend.js`
   - `deploy/package.json` với script `start:backend`, `start:frontend`
   - `.env.example` mẫu (gốc + backend + frontend) làm checklist secret
   - `deploy/database/` (tham chiếu)

### 3.2. Chạy trên server
```bash
# Trên server, trong thư mục deploy/
#  - cấu hình biến môi trường production (xem deploy/.env.example)
#  - cài dependencies production của backend nếu cần (cd backend && npm install --omit=dev)

npm run start:backend     # node backend/dist/index.js   → cổng 3001
npm run start:frontend    # node frontend/start-frontend.js → cổng 3444
```
> Đặt sau reverse proxy (nginx) và bật `TRUST_PROXY=1` để rate-limit theo IP thật. Dùng process manager (pm2/systemd) để tự khởi động lại.

### 3.3. Worker / Cron (định kỳ)
Scheduler chạy ở **process riêng**, không nằm trong API server:
```bash
# từ packages/backend sau khi build
npm run start:worker      # node dist/worker.js
```
Bật bằng `FEATURE_SCHEDULER_ENABLED=true`. Job gồm: điểm danh, tính rủi ro, báo cáo phụ huynh tuần, retry thông báo, dọn OCR, hết hạn thanh toán, gia hạn subscription, refresh analytics/leaderboard...

---

## 4. Biến môi trường production (mẫu redacted)

Sinh tự động vào `deploy/.env.example` khi chạy `build:deploy`. Tóm tắt:

```dotenv
NODE_ENV=production

# Backend
BACKEND_PORT=3001
CORS_ORIGIN=https://app.your-domain.example
APP_BASE_URL=https://app.your-domain.example
MONGODB_URI=mongodb+srv://<user>:<pwd>@<cluster>/<db>?retryWrites=true&w=majority
DB_NAME=mathai
JWT_SECRET=<secret-manager>
JWT_REFRESH_SECRET=<secret-manager-khac>
JWT_EXPIRES_IN=7d

# Email (bắt buộc http ở production)
EMAIL_PROVIDER=http
EMAIL_FROM="MathAI <no-reply@your-domain.example>"
EMAIL_API_URL=https://email-provider.your-domain.example/send
EMAIL_API_KEY=<secret-manager>

# Demo gates — phải false
ENABLE_DEMO_AUTH_TOKENS=false
NEXT_PUBLIC_ENABLE_DEMO_LOGIN=false

# AI (nếu bật)
OPENAI_API_KEY=<secret-manager>
OPENAI_MODEL=gpt-4o-mini

# Frontend
NEXT_PUBLIC_API_URL=https://api.your-domain.example/api
# BACKEND_API_URL — để trống ở production

# Storage / Payment / Observability (S3, VNPAY/MoMo/SePay, Sentry, METRICS_TOKEN)...
# Feature flags Phase 6
FEATURE_SCOPED_AUTHORIZATION_ENFORCEMENT=true
FEATURE_AUDIT_LOGGING=true
FEATURE_AI_SAFETY_GUARD=true
FEATURE_ANTI_FRAUD_SIGNAL_GENERATION=true
FEATURE_GRADEBOOK_SUMMARIES=true
```

> Lưu secret trong secret/config manager của nền tảng, **không commit** giá trị thật.

---

## 5. Kiểm tra trước khi go-live

```bash
npm run deploy:verify     # kiểm tra checklist env/feature-flag/secret-leak
npm run backup:plan       # in kế hoạch backup/restore MongoDB
```
`deploy:verify` ([scripts/deploy-verification-checklist.js](../scripts/deploy-verification-checklist.js)) xác minh các biến bắt buộc đã có, feature flag hợp lệ, và evidence không lộ secret.

**Sau khi deploy, smoke test:**
```bash
curl https://api.your-domain.example/health         # liveness + version
curl https://api.your-domain.example/health/ready   # readiness: ping Mongo + email config
```
Cả hai trả `status: ok` là backend sẵn sàng.

---

## 6. Checklist tóm tắt

1. ☐ `npm run verify` xanh (test + build).
2. ☐ Chuẩn bị biến production (non-localhost, JWT ≥32 ký tự, EMAIL_PROVIDER=http, demo flags=false).
3. ☐ Build với `NEXT_PUBLIC_API_URL` production (không dùng `.env` dev).
4. ☐ MongoDB production (Atlas/managed), `STORAGE_PROVIDER=s3` nếu dùng OCR/upload.
5. ☐ Deploy: Vercel (2 project) **hoặc** `npm run build:deploy` → chạy `start:backend`/`start:frontend`.
6. ☐ Worker scheduler chạy riêng (nếu cần cron).
7. ☐ `npm run deploy:verify` + smoke test `/health` & `/health/ready`.
8. ☐ Reverse proxy + HTTPS + `TRUST_PROXY=1` (self-host).
