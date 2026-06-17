# MathAI - Nền tảng học Toán online sử dụng AI

MathAI là nền tảng học toán online ứng dụng trí tuệ nhân tạo (AI) nhằm cá nhân hóa trải nghiệm học tập, hỗ trợ giải bài nâng lực, xây dựng lộ trình học và đánh giá năng lực học sinh trong quá trình luyện tập.

## Tech Stack

- **Frontend**: Next.js 14+, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **Database**: MongoDB, Mongoose
- **AI**: OpenAI API
- **Auth**: JWT, bcryptjs
- **Validation**: Zod
- **Monorepo**: npm workspaces

> Backend runtime hiện dùng MongoDB/Mongoose. Thư mục [`database/`](database/) và các file SQL trong đó là tài liệu/blueprint legacy để tham chiếu nghiệp vụ, không phải schema hoặc migration runtime, trừ khi một task hoặc quyết định kiến trúc mới nhắm rõ vào SQL.

## Cấu trúc dự án

```text
mathai/
├── package.json              # Root monorepo config
├── .env.example              # Template biến môi trường
├── database/
│   └── schema.sql            # SQL legacy/reference blueprint, không phải runtime schema
├── docs/
│   ├── bao_cao_chi_tiết_dự_an_math_ai.md
│   └── implementation-plan.md
├── packages/
│   ├── backend/              # Express + TypeScript API
│   │   └── src/
│   │       ├── config/       # Database, OpenAI, app config
│   │       ├── middleware/    # Auth, validation, error handling
│   │       ├── routes/       # API route handlers
│   │       ├── controllers/  # Business logic controllers
│   │       ├── services/     # Service layer
│   │       ├── models/       # Database models
│   │       ├── validators/   # Zod schemas
│   │       ├── types/        # TypeScript types
│   │       └── utils/        # Utilities
│   └── frontend/             # Next.js 14 + Tailwind CSS
│       └── src/
│           ├── app/          # App Router pages
│           ├── components/   # React components
│           ├── lib/          # API client, utilities
│           ├── hooks/        # Custom React hooks
│           └── types/        # TypeScript types
```

## Cài đặt

### Yêu cầu hệ thống

- Node.js >= 18
- npm >= 9
- Bun >= 1.3 (frontend tests run with `bun test`)
- MongoDB local hoặc MongoDB Atlas/managed MongoDB

### Các bước cài đặt

1. **Clone repository**

```bash
git clone https://github.com/ktvdung/mathai.git
cd mathai
```

2. **Cài đặt dependencies**

```bash
npm install
```

3. **Cấu hình môi trường**

```bash
cp .env.example .env
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

Chỉnh sửa các file `.env` với thông tin MongoDB, JWT, URL frontend/backend, email provider và OpenAI API key nếu bật tính năng AI.

4. **Chuẩn bị MongoDB runtime**

```bash
# Local example
MONGODB_URI=mongodb://localhost:27017
DB_NAME=mathai
```

Không cần import [`database/schema.sql`](database/schema.sql) để chạy backend hiện tại. File SQL trong `database/` chỉ là legacy/reference blueprint trừ khi một task nhắm rõ vào SQL migration.

## Environment contract

Không commit secret thật hoặc giá trị production vào `.env.example`. Production/staging nên lưu giá trị thật trong secret/config manager của nền tảng deploy.

### Backend/deployment runtime

- **Required in production**: `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`, `APP_BASE_URL`.
  - `MONGODB_URI`, `CORS_ORIGIN`, và `APP_BASE_URL` phải là giá trị explicit, hợp lệ, non-localhost trong production.
  - `JWT_SECRET` và `JWT_REFRESH_SECRET` phải dài, random, khác nhau, và chỉ lưu trong secret manager.
- **Required when AI-backed features are enabled**: `OPENAI_API_KEY`.
- **Email/password reset**: `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_API_URL`, `EMAIL_API_KEY`.
  - Local/dev có thể dùng `EMAIL_PROVIDER=console`.
  - Staging/production nên dùng provider thật như `EMAIL_PROVIDER=http` cùng `EMAIL_API_URL` HTTPS và `EMAIL_API_KEY` trong secret manager.
- **Optional/operational**: `DB_NAME`, `JWT_EXPIRES_IN`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `BACKEND_PORT`, `BACKEND_URL`.
- **Demo flags**: `ENABLE_DEMO_AUTH_TOKENS` phải false/empty trong production; backend vẫn reject demo bearer tokens khi `NODE_ENV=production`.

### Frontend/deploy build

- **Required in production**: `NEXT_PUBLIC_API_URL`.
  - Phải là absolute `http(s)` URL public và non-localhost, ví dụ `https://api.your-domain.example/api`.
  - Không đặt production `NEXT_PUBLIC_API_URL` thành `http://localhost:3001/api`; browser trên Vercel/hosting không thể gọi localhost của developer machine.
- **Conditional/non-production rewrite target**: `BACKEND_API_URL`.
  - Dùng cho Next.js dev/staging server rewrites hoặc deploy có chủ đích riêng.
  - Nếu set trong production vì nền tảng deploy cần rewrite target, phải là absolute non-localhost URL; mặc định production không cần biến này khi frontend gọi trực tiếp `NEXT_PUBLIC_API_URL`.
- **Demo UI flag**: `NEXT_PUBLIC_ENABLE_DEMO_LOGIN` chỉ bật cho local/demo deployment được phê duyệt; giữ false/empty trong production.

Các biến SQL/MySQL cũ như `DB_HOST`, `DB_USER`, `DB_PASSWORD` không phải runtime contract của backend hiện tại.

## Seed MongoDB dev/staging và demo login

Backend runtime hiện dùng MongoDB/Mongoose. Để tạo dữ liệu demo tối thiểu cho local/dev/staging, cấu hình `MONGODB_URI` và `DB_NAME` trong [`packages/backend/.env`](packages/backend/.env), sau đó chạy một trong các lệnh:

```bash
# Từ thư mục root monorepo
npm run seed --workspace=packages/backend
npm run seed:dev --workspace=packages/backend
npm run seed:staging --workspace=packages/backend

# Hoặc từ packages/backend
npm run seed
```

Seed trong [`packages/backend/scripts/seed.ts`](packages/backend/scripts/seed.ts) bị chặn khi `NODE_ENV=production` trừ khi có override chủ đích `SEED_ALLOW_PRODUCTION=true`; không dùng seed demo như migration/seed production.

Demo users được seed cho dev/staging:

| Vai trò   | Email               | Password mặc định |
| --------- | ------------------- | ----------------- |
| Admin     | `admin@mathai.vn`   | `MathAI@Demo123`  |
| Giáo viên | `teacher@mathai.vn` | `MathAI@Demo123`  |
| Học sinh  | `student@mathai.vn` | `MathAI@Demo123`  |
| Phụ huynh | `parent@mathai.vn`  | `MathAI@Demo123`  |

Có thể override password seed bằng `SEED_DEMO_PASSWORD` trong môi trường dev/staging. Nếu override, cập nhật hướng dẫn nội bộ và demo UI tương ứng; không đưa secret production vào biến `NEXT_PUBLIC_*`.

Demo login UI ở frontend chỉ dành local/dev/staging: tự hiện trong `NODE_ENV=development` hoặc khi bật rõ `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true` cho demo deployment được phê duyệt. Không bật demo login mặc định trong production.

## Chạy dự án

### Development

```bash
# Chạy cả backend và frontend
npm run dev

# Chạy riêng backend (port 3001)
npm run dev:backend

# Chạy riêng frontend (port 3444)
npm run dev:frontend
```

### Production

```bash
npm run build
```

For production frontend deployments, `NEXT_PUBLIC_API_URL` must point to a publicly reachable backend API URL, for example `https://your-backend.example.com/api`. If no public backend is deployed yet, login and other API-backed features will fail until the backend is deployed and the production environment variable is updated.

### Final verification

Before handing off Phase 2 reward-points changes, run the canonical workspace verification commands:

```bash
# Frontend scoped reward-points lint, Bun-based tests, and Next.js production build
npm run verify:frontend

# Backend tests plus TypeScript build
npm run verify:backend

# Full monorepo verification
npm run verify
```

Notes:

- Frontend tests intentionally use the robust Bun-native `bun test` command instead of explicit glob filters; explicit glob args have failed under Windows/npm with unmatched-filter errors even though `bun test` from `packages/frontend` discovers and runs the test suite.
- `packages/frontend` still keeps the full baseline lint script as `npm run lint --workspace=packages/frontend` (`eslint .`). It currently reports broad pre-existing lint issues outside the reward-points touched files, so `verify:frontend` uses `lint:reward-points` as the scoped Phase 2 gate until the global frontend lint baseline is cleaned up. The scoped script delegates to `packages/frontend/test/lint-reward-points.mjs` to pass literal file paths with route-segment parentheses/brackets to ESLint reliably through npm on Windows.
- Backend has no lint dependency or lint script configured. `verify:backend` therefore covers backend tests and `tsc` build only; do not report backend lint as having run unless a backend lint tool is added in a separate dependency-approved change.
- Backend test scripts use quoted test globs: `"src/**/*.test.ts"` and `"scripts/**/*.test.ts"`.

## Package lock note

The repository currently contains both root and frontend lockfiles. Do not update `packages/frontend/package-lock.json` during frontend verification unless you intentionally run an install or `npm install --package-lock-only --workspace=packages/frontend` and verify the resulting lockfile diff does not add or change declared dependencies.

## API Endpoints

| Module     | Method | Endpoint                          | Mô tả                 |
| ---------- | ------ | --------------------------------- | --------------------- |
| Auth       | POST   | /api/auth/register                | Đăng ký tài khoản     |
| Auth       | POST   | /api/auth/login                   | Đăng nhập             |
| Student    | GET    | /api/students/profile             | Xem hồ sơ học sinh    |
| Assessment | POST   | /api/assessments/generate         | AI tạo đề kiểm tra    |
| Curriculum | POST   | /api/curricula/generate           | AI tạo giáo trình     |
| Lesson     | GET    | /api/lessons/today-recommendation | Gợi ý bài học hôm nay |
| Solver     | POST   | /api/solver/solve                 | AI giải bài toán      |
| Chat       | POST   | /api/chat/conversations           | Chat với AI tutor     |
| Dashboard  | GET    | /api/dashboard/progress           | Xem tiến độ học tập   |

## Tính năng chính

1. **Đăng ký và hồ sơ học sinh** - Cá nhân hóa trải nghiệm
2. **Kiểm tra đầu vào** - AI tự động tạo đề đánh giá năng lực
3. **Giáo trình cá nhân hóa** - AI xây dựng lộ trình học riêng
4. **Học bài và luyện tập** - Học lý thuyết + bài tập + quiz
5. **Quiz cuối buổi** - Kiểm tra 15 phút sau mỗi buổi học
6. **Dashboard tiến độ** - Theo dõi quá trình học tập
7. **Gợi ý bài học** - AI đề xuất bài học phù hợp mỗi ngày
8. **AI Solver** - Giải bài toán từng bước với giải thích
9. **Chat AI Tutor** - Trò chuyện với thầy/cô ảo 24/7
10. **Cá nhân hóa giao diện** - Theme theo sở thích học sinh

## License

Private - All rights reserved.
