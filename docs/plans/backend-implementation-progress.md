# MathAI Backend - Tiến Trình Triển Khai

> Cập nhật lần cuối: 2026-04-11

## Tổng quan
Xây dựng logic backend cho toàn bộ dự án MathAI - nền tảng EdTech dạy toán bằng AI.
Stack: Express + Knex (MySQL) + TypeScript + OpenAI SDK

## Các Phase Triển Khai

### ✅ Phase A: Foundation Layer
**Trạng thái:** Hoàn thành
**Commit:** `2a8f35c` - `feat: Phase A - Foundation layer (types, models, base repository, AI service, error handling)`

**Nội dung đã triển khai:**
- Cập nhật TypeScript interfaces cho 22 bảng database (`packages/backend/src/types/index.ts`)
- DTOs, API response types, enum types
- BaseRepository với CRUD, pagination, transaction (`packages/backend/src/models/base.model.ts`)
- 11 domain repositories: user, student, ai-tutor, assessment, curriculum, lesson, progress, solver, chat, ai-log, notification
- AIService wrapper cho OpenAI SDK (`packages/backend/src/services/ai.service.ts`)
- AppError classes: NotFoundError, ValidationError, UnauthorizedError, ForbiddenError, ConflictError (`packages/backend/src/utils/errors.ts`)
- Chuẩn hóa response format (`packages/backend/src/utils/response.ts`)
- Cập nhật error handler middleware

### ✅ Phase B: Auth + Student Profile
**Trạng thái:** Hoàn thành
**Commit:** `2e7779b` - `feat: Phase B - Auth & Student Profile (services, controllers, validators, routes)`

**Nội dung đã triển khai:**
- Zod validators cho register, login, refresh, update profile, update theme
- AuthService: hash password, JWT access/refresh tokens, register, login, refresh, getMe
- StudentService: get/update profile, get/update theme, list tutors, select tutor
- AuthController & StudentController
- Express.Request type augmentation cho user property
- Routes: POST /auth/register, POST /auth/login, POST /auth/refresh, GET /auth/me
- Routes: GET/PUT /students/profile, GET/PUT /students/theme, GET /students/tutors, PUT /students/select-tutor

**API Endpoints:**
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | ❌ | Đăng ký tài khoản + tạo hồ sơ học sinh |
| POST | /api/auth/login | ❌ | Đăng nhập |
| POST | /api/auth/refresh | ❌ | Refresh token |
| GET | /api/auth/me | ✅ | Lấy thông tin user hiện tại |
| GET | /api/students/profile | ✅ | Lấy hồ sơ học sinh |
| PUT | /api/students/profile | ✅ | Cập nhật hồ sơ |
| GET | /api/students/theme | ✅ | Lấy theme preferences |
| PUT | /api/students/theme | ✅ | Cập nhật theme |
| GET | /api/students/tutors | ✅ | Danh sách AI tutors |
| PUT | /api/students/select-tutor | ✅ | Chọn AI tutor |

### ✅ Phase C: Assessment (Diagnostic Test)
**Trạng thái:** Hoàn thành
**Commit:** `70fe1cd` - `feat: Phase C - Assessment diagnostic flow (generate, start, answer, submit, grade)`

**Nội dung đã triển khai:**
- Zod validators cho generate, start attempt, save answer, submit attempt
- AssessmentService: generate diagnostic bằng AI, start attempt, save answers, submit/grade, get results
- AI tự động sinh đề kiểm tra đầu vào (8 câu: trắc nghiệm + tự luận)
- Tự động chấm điểm trắc nghiệm, AI chấm tự luận
- AI phân tích strengths/weaknesses
- Cập nhật topic_mastery sau khi submit
- Helper getStudentProfileId/getStudentProfile (`packages/backend/src/utils/helpers.ts`)

**API Endpoints:**
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/assessments/generate | ✅ | AI sinh đề kiểm tra đầu vào |
| GET | /api/assessments/latest-result | ✅ | Lấy kết quả diagnostic mới nhất |
| GET | /api/assessments/:id | ✅ | Xem chi tiết đề |
| POST | /api/assessments/:id/start | ✅ | Bắt đầu làm bài |
| POST | /api/assessments/:id/attempts/:attemptId/answers | ✅ | Lưu câu trả lời |
| POST | /api/assessments/:id/attempts/:attemptId/submit | ✅ | Nộp bài + chấm điểm |
| GET | /api/assessments/:id/result | ✅ | Xem kết quả |

### ✅ Phase D: Curriculum Generation & Management
**Trạng thái:** Hoàn thành
**Commit:** `116c63c` - `feat: Phase D - Curriculum generation & management (generate, list, detail, modules)`

**Nội dung đã triển khai:**
- Zod validators cho generate curriculum, curriculum id, module id
- CurriculumService: generate giáo trình cá nhân hóa bằng AI (curriculum → modules → lessons → exercises)
- Dựa trên kết quả diagnostic (strengths/weaknesses) để sinh giáo trình phù hợp
- Transaction persist toàn bộ cây giáo trình
- Tự động archive curriculum cũ khi tạo mới
- List curricula, get active, get detail, get module detail với ownership check

**API Endpoints:**
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/curricula/generate | ✅ | AI sinh giáo trình cá nhân hóa |
| GET | /api/curricula | ✅ | Danh sách giáo trình |
| GET | /api/curricula/active | ✅ | Giáo trình đang active |
| GET | /api/curricula/:id | ✅ | Chi tiết giáo trình + modules |
| GET | /api/curricula/:id/modules/:moduleId | ✅ | Chi tiết module + lessons |

### 🔄 Phase E: Lesson + Exercise + Quiz (Đang chờ triển khai)
**Trạng thái:** Chưa bắt đầu

**Dự kiến triển khai:**
- Lesson detail với exercises
- Start lesson, mark complete
- Submit exercise answers
- Quiz cuối buổi (generate/start/submit/result)
- Cập nhật progress sau mỗi bài

**API Endpoints dự kiến:**
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/lessons | ✅ | Danh sách bài học |
| GET | /api/lessons/today-recommendation | ✅ | Bài học gợi ý hôm nay |
| GET | /api/lessons/:id | ✅ | Chi tiết bài học |
| POST | /api/lessons/:id/start | ✅ | Bắt đầu học |
| POST | /api/lessons/:id/complete | ✅ | Hoàn thành bài |
| GET | /api/lessons/:id/exercises | ✅ | Danh sách bài tập |
| POST | /api/lessons/:id/exercises/:exerciseId/submit | ✅ | Nộp bài tập |
| POST | /api/lessons/:id/quiz/start | ✅ | Bắt đầu quiz |
| POST | /api/lessons/:id/quiz/submit | ✅ | Nộp quiz |
| GET | /api/lessons/:id/quiz/result | ✅ | Kết quả quiz |

### ⏳ Phase F: Dashboard + Progress
**Trạng thái:** Chưa bắt đầu

**Dự kiến:**
- Dashboard overview (tổng bài đã học, điểm TB, streak)
- Stats chi tiết
- Topic mastery breakdown
- Lesson recommendations

### ⏳ Phase G: Solver
**Trạng thái:** Chưa bắt đầu

**Dự kiến:**
- AI giải bài toán step-by-step
- Lịch sử giải bài
- Chi tiết lời giải

### ⏳ Phase H: AI Tutor Chat
**Trạng thái:** Chưa bắt đầu

**Dự kiến:**
- Tạo/list conversations
- Gửi tin nhắn + AI reply
- Chat context theo bài học

## Cấu trúc Backend hiện tại

```text
packages/backend/src/
├── config/           # Database, OpenAI, app config
├── controllers/      # Auth, Student, Assessment, Curriculum
├── middleware/       # Auth JWT, CORS, Error handler, Zod validate
├── models/           # BaseRepository + 11 domain repositories
├── routes/           # 8 route files (auth, student, assessment, curriculum, lesson, solver, chat, dashboard)
├── services/         # AI, Auth, Student, Assessment, Curriculum
├── types/            # 22 interfaces, DTOs, Express augmentation
├── utils/            # Errors, Response helpers, Student helpers
├── validators/       # Auth, Student, Assessment, Curriculum (Zod schemas)
└── index.ts          # Express app entry point
```

## Git Commit History
| Commit | Message |
|--------|---------|
| `2a8f35c` | feat: Phase A - Foundation layer |
| `2e7779b` | feat: Phase B - Auth & Student Profile |
| `70fe1cd` | feat: Phase C - Assessment diagnostic flow |
| `116c63c` | feat: Phase D - Curriculum generation & management |
