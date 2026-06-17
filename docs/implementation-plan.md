# Kế hoạch triển khai và mở rộng dự án MathAI

## Reward Points / Competency Scoring Update

Vertical slice điểm thưởng và điểm năng lực đã được ghi riêng trong `/docs/plans` theo yêu cầu:

- [Thiết kế hệ thống điểm thưởng và điểm năng lực](./plans/reward-points-design.md)
- [Reward Points API](./plans/reward-points-api.md)
- [Reward Points Implementation Progress](./plans/reward-points-implementation-progress.md)

Phạm vi hiện tại: assessment, lesson quiz result, và teacher assignment grading ghi point ledger bằng atomic idempotent upsert theo `(student_id, source_type, source_id, attempt_id)`. Assessment/lesson giữ `$setOnInsert`; teacher assignment regrade cập nhật cùng ledger row để summary khớp điểm mới và không double-award. Dashboard API trả summary/history, dashboard header hiển thị `reward_points`, student UI có route `/dashboard/points`, và admin manual adjustment UI có route `/admin/students/:id/points` kèm link từ bảng học sinh trong chi tiết lớp. Admin API có endpoint manual adjustment audit tại `/api/admin/students/:studentId/points`; backfill assessment attempts `graded`/`completed` cũ có script `npm run backfill:assessment-points --workspace=packages/backend`. Teacher-scoped manual adjustment vẫn deferred vì cần thiết kế ownership/class scope chặt chẽ trước khi mở endpoint/UI.

## 1. Lựa chọn Tech Stack

### 1.1. Định hướng lựa chọn

MathAI là nền tảng EdTech có đặc thù:

- luồng nghiệp vụ rõ ràng nhưng nhiều domain con: hồ sơ học sinh, đánh giá đầu vào, giáo trình, lesson, quiz, dashboard, AI tutor, solver
- cần phát triển MVP nhanh nhưng vẫn giữ khả năng mở rộng về sản phẩm, dữ liệu và AI workflow
- có nhiều dữ liệu quan hệ, cần truy vấn thống kê và theo dõi tiến độ học tập
- tích hợp AI sinh nội dung và hội thoại, cần kiểm soát chi phí, version prompt và fallback

Với bối cảnh hiện tại, stack phù hợp nhất là kiến trúc TypeScript full-stack theo hướng modular monorepo.

### 1.2. Tech stack đề xuất

| Layer            | Công nghệ đề xuất                                                                                          | Lý do                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Frontend Web     | Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zod, React Hook Form            | SSR và App Router phù hợp SEO, hiệu năng tốt, DX mạnh, TypeScript đồng bộ với backend                  |
| Backend API      | NestJS, TypeScript, REST API, OpenAPI Swagger, Zod hoặc class-validator, BullMQ                            | Cấu trúc module rõ ràng, phù hợp hệ thống nhiều nghiệp vụ, hỗ trợ DI, queue, scheduling, test dễ       |
| Database         | MySQL 8.0+                                                                                                 | Mạnh về dữ liệu quan hệ, JSON, index, transaction, phù hợp MVP và dễ mở rộng cho analytics, reporting  |
| ORM và Migration | Prisma ORM + Prisma Migrate + mysql2                                                                       | Type-safe, productivity cao, schema rõ ràng, dễ onboarding; kết nối MySQL phù hợp với stack TypeScript |
| Cache            | Redis                                                                                                      | Cache session, recommendation, leaderboard tương lai, rate limit và background job state               |
| Queue            | BullMQ trên Redis                                                                                          | Xử lý AI generation, scoring, recommendation, snapshot dashboard theo nền                              |
| AI Integration   | OpenAI API qua backend AI orchestration layer                                                              | Tập trung bảo mật API key, logging, retry, prompt versioning                                           |
| Auth             | JWT access token + refresh token, có thể thêm session device tracking                                      | Phù hợp web app hiện đại, dễ tích hợp RBAC                                                             |
| File storage     | S3-compatible object storage như Cloudflare R2 hoặc AWS S3                                                 | Lưu ảnh OCR, avatar, file đính kèm, log artifacts                                                      |
| Observability    | OpenTelemetry, Prometheus, Grafana, Loki hoặc Datadog, Sentry                                              | Theo dõi API, queue, AI latency, lỗi frontend và backend                                               |
| CI/CD            | GitHub Actions                                                                                             | Phù hợp repo hiện tại trên GitHub, triển khai pipeline đơn giản và hiệu quả                            |
| Deployment       | Docker, Kubernetes hoặc ECS/Fargate ở giai đoạn scale; ban đầu có thể dùng Render hoặc Railway cho staging | Đi từ đơn giản tới production-grade mà không phải thay đổi kiến trúc lớn                               |
| Testing          | Vitest, Jest, Supertest, Playwright, Prisma test DB MySQL                                                  | Bao phủ unit, integration, API contract và end-to-end                                                  |

### 1.3. Vì sao không chọn microservices ngay từ đầu

Không nên tách microservices ngay ở giai đoạn đầu vì:

- codebase hiện chưa có backend và frontend
- nghiệp vụ tuy nhiều nhưng liên kết chặt, domain boundaries vẫn đang hình thành
- chi phí vận hành, observability, CI/CD và debugging sẽ tăng mạnh nếu tách sớm

Đề xuất: bắt đầu bằng modular monolith với ranh giới module rõ ràng. Khi tải tăng hoặc team mở rộng, có thể tách dần các phần sau thành service độc lập:

- AI orchestration service
- analytics service
- realtime tutor service
- notification service

---

## 2. Kiến trúc hệ thống chi tiết

### 2.1. Kiến trúc tổng thể

```text
+-----------------------+
|  Student / Parent UI  |
|  Next.js Web App      |
+-----------+-----------+
            |
            | HTTPS REST
            v
+-----------+-----------+
| API Layer / BFF       |
| NestJS Controllers    |
| Auth, Validation      |
+-----------+-----------+
            |
            v
+-------------------------------+
| Backend Domain Modules        |
| - Auth & Users                |
| - Student Profile             |
| - Assessment                  |
| - Curriculum & Lesson         |
| - Exercise & Quiz             |
| - Progress & Dashboard        |
| - Recommendation              |
| - Solver                      |
| - AI Tutor                    |
| - Admin & Content Ops         |
+--------+-----------+----------+
         |           |
         |           +-------------------------------+
         |                                           |
         v                                           v
+--------+----------+                     +----------+---------+
| MySQL              |                     | Redis               |
| relational data    |                     | cache + queue       |
+--------+----------+                     +----------+---------+
         |                                           |
         |                                           v
         |                                 +---------+----------+
         |                                 | BullMQ Workers      |
         |                                 | AI jobs, snapshots  |
         |                                 | recommendations     |
         |                                 +---------+----------+
         |                                           |
         v                                           v
+--------+-------------------------------------------+---------+
| AI Orchestration Layer                                       |
| prompt templates, safety filters, retries, response parsing  |
+-------------------------+------------------------------------+
                          |
                          v
                 +--------+---------+
                 | OpenAI API        |
                 +-------------------+
```

### 2.2. Mô tả từng layer

#### Frontend

Chịu trách nhiệm:

- đăng ký, đăng nhập, onboarding học sinh
- hiển thị diagnostic test, curriculum, lesson, quiz, solver, chat tutor, dashboard
- quản lý UI state, gọi API, optimistic update có chọn lọc
- lazy load các trang nặng như dashboard, chat, solver history

#### API Layer hoặc BFF

Chịu trách nhiệm:

- xác thực và phân quyền
- validate request và chuẩn hóa response
- tổng hợp dữ liệu từ nhiều module cho frontend
- rate limit theo user và IP
- expose OpenAPI cho frontend và QA

#### Backend Services

Thiết kế theo module domain:

- `AuthModule`: đăng ký, đăng nhập, refresh token, RBAC
- `StudentsModule`: hồ sơ học sinh, theme, sở thích
- `AssessmentsModule`: tạo đề, publish, làm bài, chấm điểm
- `CurriculaModule`: giáo trình, module, lesson, recommendation
- `ExercisesModule`: làm bài tập trong lesson, lưu kết quả
- `QuizzesModule`: quiz cuối buổi và feedback
- `ProgressModule`: snapshot dashboard, mastery, metrics
- `SolverModule`: gửi bài toán, nhận lời giải, lưu lịch sử
- `TutorModule`: hội thoại AI tutor, context memory ngắn hạn
- `AdminModule`: quản trị tutor persona, prompt version, config

#### Database

MySQL là nguồn dữ liệu chuẩn cho:

- user, hồ sơ, theme
- assessment, answer, result, progress
- curriculum, lesson, exercise
- ai tutor conversation và solver history
- audit events quan trọng

#### Cache

Redis dùng cho:

- cache hồ sơ dashboard tổng hợp
- cache recommendation ngắn hạn
- lưu rate-limit counters
- lưu temporary AI job state
- lưu conversation summary ngắn hạn để giảm token cost

#### Queue và Worker

BullMQ worker dùng cho tác vụ bất đồng bộ:

- sinh đề AI
- sinh giáo trình AI
- chấm điểm tự luận có AI assist
- cập nhật topic mastery
- tạo progress snapshots định kỳ
- sinh lesson recommendation sau mỗi buổi học

#### AI Orchestration Layer

Đây là lớp rất quan trọng, không gọi OpenAI trực tiếp từ controller. Lớp này quản lý:

- prompt templates theo use case và version
- guardrails cho nội dung
- retry và timeout
- parse JSON có schema validation
- log token usage và cost metadata
- fallback model hoặc fallback rule-based

### 2.3. Communication patterns

| Pattern                     | Áp dụng                                                                      | Mục tiêu                                    |
| --------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| Synchronous REST            | Auth, profile, lesson, exercise submit, dashboard read                       | Trải nghiệm phản hồi ngay                   |
| Async queue                 | Generate assessment, generate curriculum, recompute progress, recommendation | Tránh block request lâu                     |
| Polling hoặc webhook nội bộ | Kiểm tra trạng thái AI generation                                            | Phù hợp giai đoạn đầu trước khi có realtime |
| Scheduled jobs              | Daily snapshot, stale curriculum check, recommendation refresh               | Dữ liệu dashboard ổn định                   |
| Event-driven nội bộ         | Sau khi quiz hoàn tất, phát sự kiện cập nhật mastery và recommendation       | Giảm coupling giữa module                   |

### 2.4. Nguyên tắc kiến trúc

- API stateless
- domain-first module boundaries
- AI là dependency ngoài, không để business logic cốt lõi phụ thuộc hoàn toàn vào AI
- mọi nội dung AI sinh ra đều có trạng thái và version để audit
- tách read model cho dashboard khi dữ liệu tăng

---

## 3. Cấu trúc thư mục dự án

### 3.1. Định hướng repo

Đề xuất chuyển repo hiện tại sang monorepo:

- đồng bộ TypeScript types
- tái sử dụng validation schema
- quản lý version và CI/CD đơn giản hơn

### 3.2. Cấu trúc thư mục đề xuất

```text
mathai/
├─ apps/
│  ├─ web/
│  │  ├─ src/
│  │  │  ├─ app/
│  │  │  │  ├─ auth/
│  │  │  │  ├─ onboarding/
│  │  │  │  ├─ dashboard/
│  │  │  │  ├─ assessments/
│  │  │  │  ├─ curricula/
│  │  │  │  ├─ lessons/
│  │  │  │  ├─ solver/
│  │  │  │  ├─ tutor/
│  │  │  │  └─ settings/
│  │  │  ├─ components/
│  │  │  ├─ features/
│  │  │  ├─ hooks/
│  │  │  ├─ lib/
│  │  │  ├─ services/
│  │  │  ├─ store/
│  │  │  ├─ styles/
│  │  │  └─ types/
│  │  ├─ public/
│  │  └─ tests/
│  └─ api/
│     ├─ src/
│     │  ├─ main.ts
│     │  ├─ app.module.ts
│     │  ├─ common/
│     │  ├─ config/
│     │  ├─ database/
│     │  ├─ modules/
│     │  │  ├─ auth/
│     │  │  ├─ users/
│     │  │  ├─ students/
│     │  │  ├─ tutors/
│     │  │  ├─ assessments/
│     │  │  ├─ curricula/
│     │  │  ├─ lessons/
│     │  │  ├─ quizzes/
│     │  │  ├─ progress/
│     │  │  ├─ recommendations/
│     │  │  ├─ solver/
│     │  │  ├─ ai/
│     │  │  ├─ uploads/
│     │  │  └─ admin/
│     │  ├─ jobs/
│     │  └─ instrumentation/
│     └─ tests/
├─ packages/
│  ├─ shared-types/
│  ├─ validation/
│  ├─ prompt-templates/
│  ├─ eslint-config/
│  └─ tsconfig/
├─ database/
│  ├─ schema.sql
│  ├─ prisma/
│  │  ├─ schema.prisma
│  │  └─ migrations/
│  ├─ seeds/
│  └─ docs/
├─ docs/
│  ├─ bao_cao_chi_tiết_dự_an_math_ai.md
│  └─ implementation-plan.md
├─ infra/
│  ├─ docker/
│  ├─ k8s/
│  ├─ terraform/
│  └─ monitoring/
├─ scripts/
├─ .github/
│  └─ workflows/
└─ package.json
```

### 3.3. Nguyên tắc tổ chức mã nguồn

- tách `apps/web` và `apps/api` rõ ràng
- mọi domain có DTO hoặc schema, service, controller, repository riêng
- prompt AI không hard-code trong service nghiệp vụ, đặt trong `packages/prompt-templates`
- rule validation tái sử dụng giữa frontend và backend nếu cần
- test đặt cạnh module hoặc gom theo cấp độ trong `tests/`

---

## 4. Kế hoạch bổ sung CSDL

### 4.1. Mục tiêu dữ liệu

Cần mở rộng từ schema prototype hiện tại sang schema đủ dùng cho MVP và giai đoạn scale gần:

- tách định nghĩa assessment khỏi attempt thực tế
- theo dõi kết quả học tập chi tiết theo câu, theo bài, theo chủ đề
- hỗ trợ dashboard và recommendation bằng dữ liệu chuẩn hóa
- hỗ trợ hội thoại AI tutor và solver có audit

### 4.2. Bảng mới cần tạo

#### 4.2.1. `assessment_attempts`

Tách bài đánh giá khỏi lần làm bài cụ thể.

| Field            | Type                  | Constraint                                  | Ghi chú                                   |
| ---------------- | --------------------- | ------------------------------------------- | ----------------------------------------- |
| id               | BIGINT AUTO_INCREMENT | PK                                          |                                           |
| assessment_id    | BIGINT                | FK -> assessments.id ON DELETE CASCADE      |                                           |
| student_id       | BIGINT                | FK -> student_profiles.id ON DELETE CASCADE | denormalize để query nhanh                |
| started_at       | TIMESTAMP             | NOT NULL                                    |                                           |
| submitted_at     | TIMESTAMP             | NULL                                        |                                           |
| score_obtained   | DECIMAL(5,2)          | NULL                                        |                                           |
| max_score        | DECIMAL(5,2)          | NOT NULL DEFAULT 0                          |                                           |
| percentage       | DECIMAL(5,2)          | NULL                                        |                                           |
| proficiency_band | VARCHAR(20)           | NULL                                        | basic, average, good, excellent           |
| status           | VARCHAR(20)           | NOT NULL                                    | in_progress, submitted, graded, abandoned |
| ai_feedback      | TEXT                  | NULL                                        | tổng kết AI                               |
| grading_source   | VARCHAR(20)           | NOT NULL DEFAULT 'auto'                     | auto, manual, hybrid                      |
| duration_seconds | INT                   | NULL                                        |                                           |
| metadata         | JSON                  | NULL                                        | browser, device, timing info              |
| created_at       | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP          |                                           |
| updated_at       | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP          |                                           |

#### 4.2.2. `assessment_answers`

Lưu câu trả lời chi tiết cho từng câu trong mỗi attempt.

| Field                  | Type                  | Constraint                                      | Ghi chú            |
| ---------------------- | --------------------- | ----------------------------------------------- | ------------------ |
| id                     | BIGINT AUTO_INCREMENT | PK                                              |                    |
| assessment_attempt_id  | BIGINT                | FK -> assessment_attempts.id ON DELETE CASCADE  |                    |
| assessment_question_id | BIGINT                | FK -> assessment_questions.id ON DELETE CASCADE |                    |
| answer_text            | TEXT                  | NULL                                            |                    |
| selected_choice        | TEXT                  | NULL                                            | cho trắc nghiệm    |
| answer_payload         | JSON                  | NULL                                            | cấu trúc linh hoạt |
| is_correct             | BOOLEAN               | NULL                                            |                    |
| score_awarded          | DECIMAL(5,2)          | NULL                                            |                    |
| ai_feedback            | TEXT                  | NULL                                            | feedback theo câu  |
| evaluated_at           | TIMESTAMP             | NULL                                            |                    |
| created_at             | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP              |                    |
| updated_at             | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP              |                    |

Unique đề xuất: `(assessment_attempt_id, assessment_question_id)`.

#### 4.2.3. `lesson_exercise_answers`

Lưu kết quả làm bài tập trong lesson.

| Field              | Type                  | Constraint                                  | Ghi chú        |
| ------------------ | --------------------- | ------------------------------------------- | -------------- |
| id                 | BIGINT AUTO_INCREMENT | PK                                          |                |
| lesson_exercise_id | BIGINT                | FK -> lesson_exercises.id ON DELETE CASCADE |                |
| lesson_id          | BIGINT                | FK -> lessons.id ON DELETE CASCADE          | denormalize    |
| student_id         | BIGINT                | FK -> student_profiles.id ON DELETE CASCADE |                |
| attempt_no         | INT                   | NOT NULL DEFAULT 1                          | hỗ trợ làm lại |
| answer_text        | TEXT                  | NULL                                        |                |
| answer_payload     | JSON                  | NULL                                        |                |
| is_correct         | BOOLEAN               | NULL                                        |                |
| score_awarded      | DECIMAL(5,2)          | NULL                                        |                |
| ai_feedback        | TEXT                  | NULL                                        |                |
| submitted_at       | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP          |                |
| created_at         | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP          |                |

Unique đề xuất: `(lesson_exercise_id, student_id, attempt_no)`.

#### 4.2.4. `lesson_quiz_results`

Lưu kết quả quiz cuối buổi như docs đã yêu cầu.

| Field                 | Type                  | Constraint                                      | Ghi chú                                  |
| --------------------- | --------------------- | ----------------------------------------------- | ---------------------------------------- |
| id                    | BIGINT AUTO_INCREMENT | PK                                              |                                          |
| lesson_id             | BIGINT                | FK -> lessons.id ON DELETE CASCADE              |                                          |
| student_id            | BIGINT                | FK -> student_profiles.id ON DELETE CASCADE     |                                          |
| assessment_id         | BIGINT                | FK -> assessments.id ON DELETE SET NULL         | nếu quiz được mô hình hóa như assessment |
| assessment_attempt_id | BIGINT                | FK -> assessment_attempts.id ON DELETE SET NULL |                                          |
| score_obtained        | DECIMAL(5,2)          | NOT NULL DEFAULT 0                              |                                          |
| max_score             | DECIMAL(5,2)          | NOT NULL DEFAULT 0                              |                                          |
| percentage            | DECIMAL(5,2)          | NULL                                            |                                          |
| passed                | BOOLEAN               | NULL                                            |                                          |
| ai_feedback           | TEXT                  | NULL                                            |                                          |
| strengths             | JSON                  | NULL                                            |                                          |
| weaknesses            | JSON                  | NULL                                            |                                          |
| recommended_action    | VARCHAR(30)           | NULL                                            | continue, review, remedial               |
| completed_at          | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP              |                                          |
| created_at            | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP              |                                          |

Unique đề xuất cho MVP: `(lesson_id, student_id)` nếu mỗi lesson chỉ có một quiz chính thức.

#### 4.2.5. `student_progress`

Read model tổng hợp tiến độ hiện tại.

| Field                    | Type                  | Constraint                                  | Ghi chú |
| ------------------------ | --------------------- | ------------------------------------------- | ------- |
| id                       | BIGINT AUTO_INCREMENT | PK                                          |         |
| student_id               | BIGINT                | FK -> student_profiles.id ON DELETE CASCADE | UNIQUE  |
| active_curriculum_id     | BIGINT                | FK -> curricula.id ON DELETE SET NULL       |         |
| lessons_completed        | INT                   | NOT NULL DEFAULT 0                          |         |
| lessons_total            | INT                   | NOT NULL DEFAULT 0                          |         |
| completion_percentage    | DECIMAL(5,2)          | NOT NULL DEFAULT 0                          |         |
| exercises_completed      | INT                   | NOT NULL DEFAULT 0                          |         |
| exercises_total          | INT                   | NOT NULL DEFAULT 0                          |         |
| average_quiz_score       | DECIMAL(5,2)          | NULL                                        |         |
| average_assessment_score | DECIMAL(5,2)          | NULL                                        |         |
| current_streak_days      | INT                   | NOT NULL DEFAULT 0                          |         |
| strongest_topics         | JSON                  | NULL                                        |         |
| weakest_topics           | JSON                  | NULL                                        |         |
| predicted_readiness      | VARCHAR(30)           | NULL                                        |         |
| last_activity_at         | TIMESTAMP             | NULL                                        |         |
| updated_at               | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP          |         |

#### 4.2.6. `progress_snapshots`

Lưu lịch sử để vẽ dashboard theo thời gian.

| Field                    | Type                  | Constraint                                  | Ghi chú |
| ------------------------ | --------------------- | ------------------------------------------- | ------- |
| id                       | BIGINT AUTO_INCREMENT | PK                                          |         |
| student_id               | BIGINT                | FK -> student_profiles.id ON DELETE CASCADE |         |
| snapshot_date            | DATE                  | NOT NULL                                    |         |
| curriculum_id            | BIGINT                | FK -> curricula.id ON DELETE SET NULL       |         |
| lessons_completed        | INT                   | NOT NULL DEFAULT 0                          |         |
| completion_percentage    | DECIMAL(5,2)          | NOT NULL DEFAULT 0                          |         |
| average_quiz_score       | DECIMAL(5,2)          | NULL                                        |         |
| average_assessment_score | DECIMAL(5,2)          | NULL                                        |         |
| streak_days              | INT                   | NOT NULL DEFAULT 0                          |         |
| mastery_summary          | JSON                  | NULL                                        |         |
| recommendation_summary   | JSON                  | NULL                                        |         |
| created_at               | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP          |         |

Unique đề xuất: `(student_id, snapshot_date)`.

#### 4.2.7. `topic_mastery`

Theo dõi mức độ mạnh yếu theo từng chủ đề.

| Field             | Type                  | Constraint                                  | Ghi chú                             |
| ----------------- | --------------------- | ------------------------------------------- | ----------------------------------- |
| id                | BIGINT AUTO_INCREMENT | PK                                          |                                     |
| student_id        | BIGINT                | FK -> student_profiles.id ON DELETE CASCADE |                                     |
| topic_code        | VARCHAR(100)          | NOT NULL                                    | ví dụ grade5_fractions              |
| topic_name        | VARCHAR(255)          | NOT NULL                                    |                                     |
| grade_level       | SMALLINT              | NOT NULL                                    |                                     |
| mastery_score     | DECIMAL(5,2)          | NOT NULL DEFAULT 0                          | 0-100                               |
| confidence_score  | DECIMAL(5,2)          | NULL                                        |                                     |
| strength_level    | VARCHAR(20)           | NOT NULL DEFAULT 'unknown'                  | weak, improving, proficient, strong |
| evidence_count    | INT                   | NOT NULL DEFAULT 0                          | số lần đánh giá                     |
| last_evaluated_at | TIMESTAMP             | NULL                                        |                                     |
| source            | VARCHAR(30)           | NOT NULL DEFAULT 'hybrid'                   | diagnostic, exercise, quiz, hybrid  |
| created_at        | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP          |                                     |
| updated_at        | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP          |                                     |

Unique đề xuất: `(student_id, topic_code)`.

#### 4.2.8. `lesson_recommendations`

Lưu gợi ý bài học hôm nay và lý do.

| Field                 | Type                  | Constraint                                  | Ghi chú             |
| --------------------- | --------------------- | ------------------------------------------- | ------------------- |
| id                    | BIGINT AUTO_INCREMENT | PK                                          |                     |
| student_id            | BIGINT                | FK -> student_profiles.id ON DELETE CASCADE |                     |
| recommended_lesson_id | BIGINT                | FK -> lessons.id ON DELETE SET NULL         |                     |
| source_type           | VARCHAR(20)           | NOT NULL                                    | rule, ai, hybrid    |
| reason_summary        | TEXT                  | NOT NULL                                    |                     |
| reason_payload        | JSON                  | NULL                                        |                     |
| action_type           | VARCHAR(20)           | NOT NULL                                    | next, review, retry |
| priority_score        | DECIMAL(5,2)          | NOT NULL DEFAULT 0                          |                     |
| valid_for_date        | DATE                  | NOT NULL                                    |                     |
| is_dismissed          | BOOLEAN               | NOT NULL DEFAULT FALSE                      |                     |
| consumed_at           | TIMESTAMP             | NULL                                        |                     |
| created_at            | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP          |                     |

Index đề xuất cho `(student_id, valid_for_date DESC)`.

#### 4.2.9. `ai_tutor_conversations`

Lưu phiên chat với tutor.

| Field           | Type                  | Constraint                                  | Ghi chú                         |
| --------------- | --------------------- | ------------------------------------------- | ------------------------------- |
| id              | BIGINT AUTO_INCREMENT | PK                                          |                                 |
| student_id      | BIGINT                | FK -> student_profiles.id ON DELETE CASCADE |                                 |
| ai_tutor_id     | BIGINT                | FK -> ai_tutors.id ON DELETE SET NULL       |                                 |
| lesson_id       | BIGINT                | FK -> lessons.id ON DELETE SET NULL         | context theo lesson nếu có      |
| title           | VARCHAR(255)          | NULL                                        |                                 |
| status          | VARCHAR(20)           | NOT NULL DEFAULT 'active'                   | active, archived, closed        |
| summary_context | TEXT                  | NULL                                        | tóm tắt hội thoại để giảm token |
| last_message_at | TIMESTAMP             | NULL                                        |                                 |
| created_at      | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP          |                                 |
| updated_at      | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP          |                                 |

#### 4.2.10. `ai_tutor_messages`

Lưu từng tin nhắn trong conversation.

| Field              | Type                  | Constraint                                        | Ghi chú                    |
| ------------------ | --------------------- | ------------------------------------------------- | -------------------------- |
| id                 | BIGINT AUTO_INCREMENT | PK                                                |                            |
| conversation_id    | BIGINT                | FK -> ai_tutor_conversations.id ON DELETE CASCADE |                            |
| sender_type        | VARCHAR(20)           | NOT NULL                                          | student, ai, system        |
| content            | TEXT                  | NOT NULL                                          |                            |
| content_type       | VARCHAR(20)           | NOT NULL DEFAULT 'text'                           | text, image, structured    |
| token_usage_input  | INT                   | NULL                                              |                            |
| token_usage_output | INT                   | NULL                                              |                            |
| model_name         | VARCHAR(100)          | NULL                                              |                            |
| prompt_version     | VARCHAR(50)           | NULL                                              |                            |
| moderation_status  | VARCHAR(20)           | NOT NULL DEFAULT 'approved'                       | approved, flagged, blocked |
| metadata           | JSON                  | NULL                                              |                            |
| created_at         | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP                |                            |

#### 4.2.11. `audit_logs`

Cần cho production và dữ liệu giáo dục.

| Field         | Type                  | Constraint                         | Ghi chú                      |
| ------------- | --------------------- | ---------------------------------- | ---------------------------- |
| id            | BIGINT AUTO_INCREMENT | PK                                 |                              |
| actor_user_id | BIGINT                | FK -> users.id ON DELETE SET NULL  |                              |
| actor_type    | VARCHAR(20)           | NOT NULL                           | user, system, admin          |
| action        | VARCHAR(100)          | NOT NULL                           |                              |
| entity_type   | VARCHAR(100)          | NOT NULL                           |                              |
| entity_id     | VARCHAR(100)          | NOT NULL                           |                              |
| before_data   | JSON                  | NULL                               |                              |
| after_data    | JSON                  | NULL                               |                              |
| ip_address    | VARCHAR(45)           | NULL                               | hỗ trợ IPv4/IPv6 trong MySQL |
| user_agent    | TEXT                  | NULL                               |                              |
| created_at    | TIMESTAMP             | NOT NULL DEFAULT CURRENT_TIMESTAMP |                              |

### 4.3. Thay đổi cần áp dụng cho bảng hiện có

#### Bảng `users`

- thêm CHECK constraint cho `role` với danh sách ban đầu: `student`, `parent`, `admin`
- cân nhắc thêm `last_login_at`
- cân nhắc thêm `deleted_at` cho soft delete nếu cần compliance

#### Bảng `student_profiles`

- loại bỏ hoặc ngừng sử dụng `favorite_color` để tránh trùng nghĩa với `student_theme_preferences`
- thêm `parent_name` và `parent_phone` ở phase sau nếu muốn phụ huynh tham gia sâu
- chuẩn hóa `academic_self_rating` bằng CHECK hoặc enum logic

#### Bảng `student_theme_preferences`

- giữ `favorite_color` như nguồn duy nhất cho giao diện
- `widget_preferences` nên dùng kiểu `JSON` trong MySQL và có JSON schema ở tầng ứng dụng

#### Bảng `assessments`

- không nên dùng `status='completed'` để đại diện cho từng học sinh đã làm xong; trạng thái completion nên nằm ở `assessment_attempts`
- thêm `generation_prompt_version`
- thêm `published_at`

#### Bảng `assessment_questions`

- thêm unique composite `(assessment_id, order_index)`
- thêm CHECK cho `score >= 0`
- cân nhắc thêm `topic_code`

#### Bảng `curriculum_modules`

- thêm unique composite `(curriculum_id, order_index)`

#### Bảng `lessons`

- thêm unique composite `(curriculum_id, order_index)`
- cân nhắc thêm `unlock_rule` kiểu `JSON`
- cân nhắc thêm `quiz_assessment_id` nếu một lesson luôn gắn một quiz riêng

#### Bảng `lesson_exercises`

- thêm unique composite `(lesson_id, order_index)`
- thêm `max_score DECIMAL(5,2) DEFAULT 1`

#### Bảng `solver_requests`

- thêm `common_mistakes JSON` hoặc `TEXT`
- thêm `model_name`, `prompt_version`, `token_usage_input`, `token_usage_output`
- thêm `status` để phân biệt `completed`, `failed`, `filtered`

#### Bảng `ai_tutors`

- thêm `grade_range JSON` hoặc metadata để map tutor persona theo đối tượng
- thêm `is_default`

### 4.4. Index strategy

#### Bắt buộc cho truy vấn nóng

- `users(email)` unique đã có
- `student_profiles(user_id)` unique đã có
- `assessments(student_id, type, created_at DESC)`
- `assessment_questions(assessment_id, order_index)` unique index
- `assessment_attempts(student_id, assessment_id, created_at DESC)`
- `assessment_answers(assessment_attempt_id)`
- `lessons(student_id, status, order_index)`
- `lesson_exercises(lesson_id, order_index)` unique index
- `lesson_exercise_answers(student_id, lesson_id, submitted_at DESC)`
- `lesson_quiz_results(student_id, completed_at DESC)`
- `student_progress(student_id)` unique index
- `progress_snapshots(student_id, snapshot_date DESC)`
- `topic_mastery(student_id, mastery_score DESC)`
- `lesson_recommendations(student_id, valid_for_date DESC, priority_score DESC)`
- `ai_tutor_conversations(student_id, last_message_at DESC)`
- `ai_tutor_messages(conversation_id, created_at ASC)`
- `solver_requests(student_id, created_at DESC)`

#### JSON index có chọn lọc

Với MySQL, ưu tiên generated columns hoặc functional index khi thực sự có use case search trên dữ liệu JSON:

- `student_theme_preferences.widget_preferences`
- `lesson_recommendations.reason_payload`
- `progress_snapshots.mastery_summary`
- `solver_requests.common_mistakes`

### 4.5. Migration plan cho MySQL

Lưu ý triển khai với Prisma/MySQL:

- cấu hình Prisma datasource với `provider = "mysql"`
- sử dụng connection string MySQL trong biến môi trường `DATABASE_URL` và driver `mysql2` ở tầng kết nối Node.js
- các cột dữ liệu bán cấu trúc chuyển từ `JSONB` sang `JSON`
- các giá trị kiểu `INET` nên lưu bằng `VARCHAR(45)` để tương thích IPv4/IPv6 trong MySQL

#### Giai đoạn migration 1: hardening schema hiện tại

- thêm CHECK cho `users.role`
- thêm unique composite cho `assessment_questions`, `curriculum_modules`, `lessons`, `lesson_exercises`
- thêm cột mở rộng cho `solver_requests`
- đánh dấu deprecate `student_profiles.favorite_color`

#### Giai đoạn migration 2: đánh giá và bài làm

- tạo `assessment_attempts`
- tạo `assessment_answers`
- backfill logic assessment cũ nếu có dữ liệu mẫu

#### Giai đoạn migration 3: học tập và dashboard

- tạo `lesson_exercise_answers`
- tạo `lesson_quiz_results`
- tạo `student_progress`
- tạo `progress_snapshots`
- tạo `topic_mastery`
- tạo `lesson_recommendations`

#### Giai đoạn migration 4: AI hội thoại và audit

- tạo `ai_tutor_conversations`
- tạo `ai_tutor_messages`
- tạo `audit_logs`

#### Giai đoạn migration 5: seed và backfill

- seed tutor mặc định
- tạo job backfill progress cho user đã có activity
- validate dữ liệu sau migrate bằng smoke tests

---

## 5. Thiết kế API endpoints

### 5.1. Nguyên tắc API

- prefix `/api/v1`
- response nhất quán: `data`, `meta`, `error`
- mọi endpoint ghi dữ liệu cần validation nghiêm ngặt
- pagination theo cursor hoặc page tùy module
- các endpoint AI nặng nên hỗ trợ pattern `request -> job_id -> poll status`

### 5.2. Auth và User

| Method | Path                    | Mô tả                      | Request tóm tắt                       | Response tóm tắt      |
| ------ | ----------------------- | -------------------------- | ------------------------------------- | --------------------- |
| POST   | `/api/v1/auth/register` | Đăng ký tài khoản học sinh | email, phone, password, profile draft | user, tokens          |
| POST   | `/api/v1/auth/login`    | Đăng nhập                  | email hoặc phone, password            | user, tokens          |
| POST   | `/api/v1/auth/refresh`  | Làm mới access token       | refresh_token                         | access_token mới      |
| POST   | `/api/v1/auth/logout`   | Đăng xuất                  | refresh_token hoặc device id          | success               |
| GET    | `/api/v1/me`            | Lấy hồ sơ hiện tại         | header auth                           | user profile tổng hợp |
| PATCH  | `/api/v1/me`            | Cập nhật thông tin cá nhân | profile fields                        | updated profile       |

### 5.3. Student Profile và Theme

| Method | Path                       | Mô tả                 | Request tóm tắt                                                      | Response tóm tắt |
| ------ | -------------------------- | --------------------- | -------------------------------------------------------------------- | ---------------- |
| POST   | `/api/v1/students/profile` | Tạo hồ sơ học sinh    | full_name, dob, address, school_name, grade, math_avg_score, hobbies | profile          |
| GET    | `/api/v1/students/profile` | Lấy hồ sơ học sinh    | auth                                                                 | profile          |
| PATCH  | `/api/v1/students/profile` | Cập nhật hồ sơ        | partial profile fields                                               | profile          |
| GET    | `/api/v1/students/theme`   | Lấy theme cá nhân hóa | auth                                                                 | theme prefs      |
| PUT    | `/api/v1/students/theme`   | Cập nhật theme        | favorite_color, ui_theme_name, widget_preferences                    | theme prefs      |

### 5.4. AI Tutor Catalog

| Method | Path                            | Mô tả                    | Request tóm tắt  | Response tóm tắt |
| ------ | ------------------------------- | ------------------------ | ---------------- | ---------------- |
| GET    | `/api/v1/tutors`                | Danh sách tutor khả dụng | optional filters | tutors           |
| GET    | `/api/v1/tutors/:id`            | Chi tiết tutor           | id               | tutor detail     |
| POST   | `/api/v1/students/select-tutor` | Chọn tutor mặc định      | tutor_id         | selection result |

### 5.5. Assessments

| Method | Path                                              | Mô tả                    | Request tóm tắt                             | Response tóm tắt       |
| ------ | ------------------------------------------------- | ------------------------ | ------------------------------------------- | ---------------------- |
| POST   | `/api/v1/assessments/diagnostic/generate`         | Tạo đề đầu vào bằng AI   | grade_level, academic_level, math_avg_score | assessment hoặc job id |
| GET    | `/api/v1/assessments`                             | Danh sách assessments    | type, status, page                          | list                   |
| GET    | `/api/v1/assessments/:id`                         | Lấy đề và câu hỏi        | id                                          | assessment detail      |
| POST   | `/api/v1/assessments/:id/start`                   | Bắt đầu làm bài          | assessment id                               | attempt                |
| POST   | `/api/v1/assessments/attempts/:attemptId/answers` | Lưu câu trả lời từng câu | question_id, answer                         | saved answer           |
| POST   | `/api/v1/assessments/attempts/:attemptId/submit`  | Nộp bài                  | attempt_id                                  | score summary          |
| GET    | `/api/v1/assessments/attempts/:attemptId/result`  | Xem kết quả              | attempt_id                                  | result detail          |
| GET    | `/api/v1/assessments/results/latest`              | Kết quả gần nhất         | type optional                               | latest result          |

### 5.6. Curriculum và Lessons

| Method | Path                           | Mô tả                       | Request tóm tắt                                         | Response tóm tắt              |
| ------ | ------------------------------ | --------------------------- | ------------------------------------------------------- | ----------------------------- |
| POST   | `/api/v1/curricula/generate`   | Sinh giáo trình cá nhân hóa | student_id hoặc dùng auth context, diagnostic_result_id | curriculum hoặc job id        |
| GET    | `/api/v1/curricula/active`     | Lấy giáo trình đang học     | auth                                                    | curriculum summary            |
| GET    | `/api/v1/curricula/:id`        | Chi tiết giáo trình         | id                                                      | modules và lessons            |
| GET    | `/api/v1/modules/:id`          | Chi tiết module             | id                                                      | module lessons                |
| GET    | `/api/v1/lessons/today`        | Gợi ý bài học hôm nay       | auth                                                    | lesson recommendation         |
| GET    | `/api/v1/lessons/:id`          | Chi tiết lesson             | id                                                      | theory, exercises, tutor info |
| POST   | `/api/v1/lessons/:id/start`    | Bắt đầu lesson              | id                                                      | lesson session info           |
| POST   | `/api/v1/lessons/:id/complete` | Hoàn thành lesson           | summary payload                                         | completion result             |

### 5.7. Lesson Exercises và Quiz

| Method | Path                                               | Mô tả              | Request tóm tắt                 | Response tóm tắt                 |
| ------ | -------------------------------------------------- | ------------------ | ------------------------------- | -------------------------------- |
| GET    | `/api/v1/lessons/:id/exercises`                    | Danh sách bài tập  | lesson id                       | exercises                        |
| POST   | `/api/v1/lessons/:id/exercises/:exerciseId/submit` | Nộp bài tập        | answer_text hoặc answer_payload | evaluation                       |
| GET    | `/api/v1/lessons/:id/exercises/history`            | Lịch sử luyện tập  | lesson id                       | attempts                         |
| GET    | `/api/v1/lessons/:id/quiz`                         | Lấy quiz cuối buổi | lesson id                       | quiz assessment                  |
| POST   | `/api/v1/lessons/:id/quiz/start`                   | Bắt đầu quiz       | lesson id                       | attempt                          |
| POST   | `/api/v1/lessons/:id/quiz/submit`                  | Nộp quiz           | answers                         | quiz result                      |
| GET    | `/api/v1/lessons/:id/quiz/result`                  | Xem kết quả quiz   | lesson id                       | result, feedback, recommendation |

### 5.8. Dashboard và Progress

| Method | Path                                | Mô tả                | Request tóm tắt | Response tóm tắt                         |
| ------ | ----------------------------------- | -------------------- | --------------- | ---------------------------------------- |
| GET    | `/api/v1/dashboard/overview`        | Dashboard tổng quan  | auth            | progress, streak, scores, recommendation |
| GET    | `/api/v1/dashboard/progress`        | Timeline tiến độ     | range params    | snapshot series                          |
| GET    | `/api/v1/dashboard/mastery`         | Mạnh yếu theo chủ đề | filters         | topic mastery list                       |
| GET    | `/api/v1/dashboard/recommendations` | Gợi ý học hôm nay    | auth            | recommendation cards                     |

### 5.9. Solver

| Method | Path                     | Mô tả                 | Request tóm tắt                   | Response tóm tắt                    |
| ------ | ------------------------ | --------------------- | --------------------------------- | ----------------------------------- |
| POST   | `/api/v1/solver/solve`   | Gửi bài toán cần giải | input_type, input_text hoặc image | solver result hoặc job id           |
| GET    | `/api/v1/solver/history` | Lịch sử solver        | page params                       | list                                |
| GET    | `/api/v1/solver/:id`     | Chi tiết một lần giải | id                                | steps, explanation, common mistakes |

### 5.10. AI Tutor Chat

| Method | Path                                       | Mô tả                | Request tóm tắt              | Response tóm tắt          |
| ------ | ------------------------------------------ | -------------------- | ---------------------------- | ------------------------- |
| GET    | `/api/v1/tutor/conversations`              | Danh sách hội thoại  | auth                         | conversations             |
| POST   | `/api/v1/tutor/conversations`              | Tạo conversation mới | tutor_id, lesson_id optional | conversation              |
| GET    | `/api/v1/tutor/conversations/:id/messages` | Lấy tin nhắn         | conversation id              | messages                  |
| POST   | `/api/v1/tutor/conversations/:id/messages` | Gửi tin nhắn         | content                      | ai reply hoặc pending job |
| POST   | `/api/v1/tutor/conversations/:id/archive`  | Lưu trữ hội thoại    | id                           | success                   |

### 5.11. Admin và Config

| Method | Path                       | Mô tả                    | Request tóm tắt             | Response tóm tắt      |
| ------ | -------------------------- | ------------------------ | --------------------------- | --------------------- |
| GET    | `/api/v1/admin/prompts`    | Danh sách prompt version | filters                     | prompts               |
| POST   | `/api/v1/admin/prompts`    | Tạo prompt version mới   | use_case, version, template | created               |
| GET    | `/api/v1/admin/ai-usage`   | Xem usage AI             | date range                  | token and cost report |
| GET    | `/api/v1/admin/audit-logs` | Xem audit log            | filters                     | logs                  |

---

## 6. Kế hoạch tích hợp AI OpenAI

### 6.1. Use case cần gọi AI

| Use case                      | Mục tiêu                                      | Đồng bộ hay bất đồng bộ                 |
| ----------------------------- | --------------------------------------------- | --------------------------------------- |
| Tạo đề diagnostic             | Sinh 8 câu phù hợp grade và năng lực          | bất đồng bộ ưu tiên                     |
| Phân tích kết quả diagnostic  | Xác định điểm mạnh yếu                        | bất đồng bộ hoặc đồng bộ tùy khối lượng |
| Sinh giáo trình cá nhân hóa   | Tạo modules, lessons, exercises, quiz outline | bất đồng bộ                             |
| Feedback cho quiz và exercise | Nhận xét dễ hiểu, đúng ngữ cảnh               | đồng bộ nếu ngắn                        |
| Solver từng bước              | Giải bài, giải thích, lỗi sai thường gặp      | đồng bộ hoặc job nếu có OCR             |
| AI tutor chat                 | Trả lời hội thoại cá nhân hóa                 | đồng bộ hoặc streaming sau này          |
| Recommendation summary        | Diễn giải lý do gợi ý bài học                 | bất đồng bộ                             |

### 6.2. Prompt template strategy

- mỗi use case có prompt riêng, version hóa rõ ràng
- chia prompt thành 3 phần:
  1. system instruction cố định
  2. domain policy và output contract
  3. runtime context từ student, lesson, mastery, history
- yêu cầu output JSON có schema ổn định với validator ở backend
- thêm guardrails cho nội dung giáo dục:
  - không đưa đáp án quá ngắn khi user cần học cách làm
  - ngôn ngữ phù hợp độ tuổi học sinh
  - không dùng lời lẽ gây áp lực hoặc so sánh tiêu cực

#### Template khuyến nghị

1. `diagnostic_generation_v1`

- input: grade, math_avg_score, self_rating
- output: danh sách câu hỏi, topic, difficulty, correct_answer, explanation, score

2. `diagnostic_analysis_v1`

- input: question set, answers, score details
- output: strengths, weaknesses, proficiency_band, recommended focus topics

3. `curriculum_generation_v1`

- input: student profile, diagnostic analysis, target goal
- output: curriculum, modules, lessons, exercises, quiz suggestions

4. `solver_step_by_step_v1`

- input: problem text, grade, optional lesson context
- output: steps, final_answer, explanation, common_mistakes

5. `tutor_chat_v1`

- input: tutor persona, conversation summary, latest messages, student grade
- output: response_text, hints, follow_up_question

### 6.3. Rate limiting và cost optimization

- rate limit theo user, IP và endpoint nhóm AI
- cache response cho request solver trùng lặp có normalize input
- summary conversation theo block thay vì gửi toàn bộ lịch sử chat mỗi lần
- dùng model phân tầng:
  - model mạnh hơn cho curriculum generation và diagnostic analysis
  - model nhẹ hơn cho feedback ngắn và recommendation summary
- token budget theo feature:
  - diagnostic generation có giới hạn câu và độ dài explanation
  - solver giới hạn số bước nếu bài quá dài
  - tutor chat giới hạn context window và message retention
- lưu token usage cho từng request để theo dõi cost per student và per feature
- thêm batch hoặc queue cho các tác vụ không cần realtime

### 6.4. Error handling và fallback

#### Lỗi từ OpenAI

- timeout
- rate limit
- malformed JSON
- nội dung không đạt schema
- moderation block

#### Chiến lược fallback

1. Retry với exponential backoff cho lỗi transient
2. Nếu parse lỗi JSON, gọi hàm repair hoặc yêu cầu model xuất lại format ngắn hơn
3. Nếu AI fail ở diagnostic generation:
   - dùng question template rule-based theo grade làm fallback MVP
4. Nếu AI fail ở curriculum generation:
   - sinh curriculum skeleton rule-based dựa trên topic yếu
5. Nếu AI fail ở solver:
   - trả thông báo nhẹ nhàng và mời thử lại, kèm gợi ý nhập đề rõ hơn
6. Nếu tutor chat fail:
   - trả canned response an toàn và tạo retry background

### 6.5. AI governance

- lưu prompt version, model name, token usage, latency
- moderation input và output
- cấm gửi dữ liệu nhạy cảm không cần thiết vào prompt
- tách personally identifiable information khỏi prompt nếu không cần dùng
- log sampling để QA chất lượng câu trả lời

---

## 7. Roadmap triển khai theo Phase

### 7.1. Phase 1 - MVP

#### Mục tiêu

Có sản phẩm chạy được end-to-end cho luồng học sinh cơ bản.

#### Phạm vi tính năng

- đăng ký và đăng nhập
- tạo hồ sơ học sinh
- chọn tutor mặc định
- diagnostic test cơ bản
- lưu kết quả assessment attempts và answers
- sinh giáo trình cá nhân hóa phiên bản đầu
- xem curriculum, module, lesson
- làm bài tập lesson cơ bản
- quiz cuối buổi
- dashboard tổng quan tối thiểu
- solver nhập text

#### Hạ tầng và kỹ thuật

- monorepo
- web app Next.js
- API NestJS
- MySQL
- Prisma Migrate
- Redis cho queue tối thiểu
- OpenAI integration bản đầu
- CI cơ bản: lint, test, build

#### Dependency chính

- schema mới cho assessment, lesson answers, quiz results
- auth foundation
- AI orchestration layer bản đầu

#### Definition of done cấp phase

- học sinh đi từ đăng ký tới hoàn thành 1 lesson và xem dashboard được
- có seed data và môi trường staging

### 7.2. Phase 2 - Core Features

#### Mục tiêu

Hoàn thiện trải nghiệm học tập cá nhân hóa và khả năng theo dõi tiến độ.

#### Phạm vi tính năng

- topic mastery
- lesson recommendation hôm nay
- progress snapshots theo ngày
- feedback AI tốt hơn cho exercise và quiz
- solver history
- tutor conversations lưu DB
- parent-ready dashboard summary cơ bản
- upload ảnh chuẩn bị cho OCR tương lai nhưng chưa cần xử lý OCR đầy đủ

#### Hạ tầng và kỹ thuật

- background jobs đầy đủ hơn
- observability cơ bản: Sentry, logs tập trung
- OpenAPI docs hoàn chỉnh
- RBAC rõ hơn cho admin

#### Dependency chính

- dữ liệu activity đủ ổn định từ Phase 1
- queue workers cho snapshot và recommendation

### 7.3. Phase 3 - Advanced

#### Mục tiêu

Tăng chiều sâu sản phẩm và tối ưu hóa cá nhân hóa.

#### Phạm vi tính năng

- AI tutor chat nâng cao có context lesson
- recommendation hybrid rule + AI
- adaptive curriculum updates sau từng chu kỳ học
- analytics sâu theo topic và cohort
- admin prompt management
- audit logging đầy đủ
- A/B testing prompt hoặc feedback styles

#### Hạ tầng và kỹ thuật

- event-driven nội bộ nhiều hơn
- read models cho dashboard nặng
- tối ưu caching và partitioning nếu cần

#### Dependency chính

- chuẩn hóa tracking event
- governance cho AI prompts và content quality

### 7.4. Phase 4 - Production

#### Mục tiêu

Sẵn sàng scale, vận hành ổn định, an toàn và có khả năng thương mại hóa.

#### Phạm vi tính năng

- HA deployment
- autoscaling cho API và workers
- monitoring, alerting, tracing đầy đủ
- backup và restore quy trình hóa
- security hardening
- cost dashboard cho AI usage
- data retention policy và compliance
- canary hoặc blue-green deploy

#### Hạ tầng và kỹ thuật

- containerization hoàn chỉnh
- infra as code
- secret manager
- WAF và rate limiting production-grade

#### Dependency chính

- lưu lượng người dùng thực tế
- quy trình vận hành, incident response, SLA nội bộ

### 7.5. Thứ tự ưu tiên triển khai chức năng

1. Auth và hồ sơ học sinh
2. Diagnostic test
3. Curriculum generation
4. Lessons và exercises
5. Quiz results
6. Dashboard minimal
7. Solver
8. Recommendation
9. AI tutor chat
10. Admin, analytics và production hardening

---

## 8. Kế hoạch mở rộng tương lai

### 8.1. Chat realtime với AI tutor

- dùng WebSocket hoặc Server-Sent Events cho streaming response
- tách `Tutor Realtime Gateway`
- conversation context được rút gọn bằng summarizer job
- hỗ trợ typing indicator, interruption handling, resume session

### 8.2. OCR ảnh bài toán

- pipeline: upload image -> OCR extraction -> text cleanup -> solver -> result
- cân nhắc Google Vision hoặc Azure OCR nếu chất lượng OCR toán là ưu tiên
- cần bước human-friendly correction khi OCR không chắc chắn

### 8.3. Gamification

- badge, streak, XP, weekly challenge
- bảng xếp hạng nên giới hạn theo cohort hoặc lớp để tránh áp lực không cần thiết
- dữ liệu gamification nên tách module riêng để không trộn với learning outcomes cốt lõi

### 8.4. Mobile app

- ưu tiên React Native hoặc Expo để tái sử dụng TypeScript
- API giữ nguyên, bổ sung mobile auth flows và notification token registry
- offline mode cho lesson content tĩnh là hướng mở rộng có giá trị cao

### 8.5. Thanh toán subscription

- thêm billing domain: plans, subscriptions, invoices, payment transactions
- dùng Stripe hoặc cổng thanh toán nội địa tùy thị trường
- cần entitlement layer để kiểm soát tính năng theo gói

### 8.6. Phân tích dữ liệu nâng cao

- data warehouse hoặc analytics store riêng khi quy mô tăng
- tracking cohort retention, lesson completion funnel, AI feature adoption
- xây dashboard cho product, ops, pedagogy

---

## 9. Non-functional Requirements

### 9.1. Security

- xác thực bằng JWT ngắn hạn và refresh token xoay vòng
- RBAC ít nhất cho `student`, `parent`, `admin`
- password hash bằng Argon2 hoặc bcrypt với cost phù hợp
- mã hóa dữ liệu nhạy cảm khi cần
- secrets lưu ở secret manager, không để trong repo
- validate input nghiêm ngặt, chống injection, XSS, CSRF nếu dùng cookie-based flows
- rate limit cho login, solver, tutor chat, AI generation
- audit log cho hành động quản trị và thay đổi dữ liệu quan trọng
- nguyên tắc tối thiểu dữ liệu khi gửi sang OpenAI

### 9.2. Performance

- cache dashboard summary và lesson recommendation
- pagination cho history, conversations, solver logs
- lazy loading cho trang dashboard và chat
- prefetch lesson tiếp theo ở frontend
- background generation cho nghiệp vụ AI nặng
- dùng composite indexes đúng theo truy vấn thực tế
- CDN cho assets tĩnh

### 9.3. Scalability

- bắt đầu modular monolith nhưng thiết kế boundary rõ
- workers scale độc lập với API
- tách read workload nếu dashboard tăng mạnh
- sẵn sàng partition hoặc archiving cho `ai_tutor_messages`, `solver_requests`, `audit_logs`
- thêm queue priority cho tác vụ realtime và batch

### 9.4. Monitoring và Logging

- metrics: request latency, error rate, queue depth, AI latency, token usage, cost per feature
- logs có correlation id xuyên suốt request và AI jobs
- alert khi AI fail rate tăng, queue backlog cao, DB CPU tăng, login failure bất thường
- Sentry cho frontend và backend
- dashboard monitoring riêng cho business metrics: DAU học, completion, quiz average, recommendation accept rate

### 9.5. Testing strategy

#### Unit test

- service logic cho scoring, recommendation rules, mastery calculation, auth

#### Integration test

- API với database thật hoặc test container
- validate Prisma migrations
- test AI orchestration parser với mock responses

#### Contract test

- đảm bảo frontend và backend không lệch schema
- kiểm tra response shape cho các endpoint chính

#### End-to-end test

- luồng đăng ký -> diagnostic -> curriculum -> lesson -> quiz -> dashboard
- luồng solver nhập text
- luồng chat tutor cơ bản

#### Data test

- migration smoke test
- seed data validity
- snapshot logic correctness

### 9.6. Reliability và vận hành

- backup MySQL định kỳ
- disaster recovery runbook
- health check cho API, DB, Redis, worker
- timeout chuẩn cho external API
- retry có giới hạn, idempotency cho các endpoint generate hoặc submit quan trọng

---

## 10. Kiến nghị triển khai thực tế

### 10.1. Ưu tiên phát triển ngay sau tài liệu này

1. Chuẩn hóa schema dữ liệu và migration framework
2. Dựng khung monorepo với `apps/web` và `apps/api`
3. Xây auth và onboarding học sinh
4. Hoàn thiện flow diagnostic và curriculum generation
5. Bổ sung lesson exercise answers, quiz results, progress dashboard tối thiểu

### 10.2. Các quyết định cần khóa sớm

- chuẩn enum cho role, difficulty, status
- mapping topic taxonomy theo lớp 1-12
- format output chuẩn cho prompt AI
- chiến lược quiz: dùng chung `assessments` hay tách entity riêng; đề xuất vẫn dùng chung assessment definition và thêm `lesson_quiz_results`
- quyền truy cập của phụ huynh ở MVP có vào ngay hay để Phase 2

### 10.3. Rủi ro lớn nhất cần kiểm soát

- phụ thuộc quá mạnh vào AI ở các bước cốt lõi
- schema dữ liệu chưa đủ cho dashboard và recommendation nếu không bổ sung sớm
- prompt output không ổn định gây lỗi parse
- chi phí AI tăng nhanh nếu không có token budget và cache
- mở rộng tính năng quá nhanh trước khi xác nhận MVP học tập end-to-end

## 11. Kết luận

MathAI nên được triển khai theo hướng modular monolith TypeScript full-stack, lấy MySQL làm nguồn dữ liệu chuẩn, Redis và BullMQ cho bất đồng bộ, và tích hợp OpenAI thông qua một lớp orchestration riêng. Cách tiếp cận này phù hợp với dự án EdTech quy mô vừa, giúp ra MVP nhanh, giảm rủi ro vận hành, đồng thời vẫn đủ nền tảng để mở rộng sang realtime tutor, OCR, mobile app, subscription và analytics nâng cao trong các giai đoạn tiếp theo.
