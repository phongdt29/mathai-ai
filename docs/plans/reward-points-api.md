# Reward Points API

## Authentication

Student dashboard endpoints dùng middleware hiện có:

- `authenticate`
- `requireRole('student')`
- `getStudentProfileId(req.user.id)`

Admin endpoints dùng admin auth style hiện có trong `admin.routes.ts`:

- `authenticate`
- `requireAdmin`

## GET `/api/dashboard/points`

Trả summary và lịch sử ledger của học viên hiện tại.

### Response

```json
{
  "success": true,
  "message": "Lấy điểm thưởng và năng lực thành công",
  "data": {
    "summary": {
      "total_earned_points": 8,
      "total_available_points": 10,
      "reward_points": 8,
      "academic_percentage": 80,
      "competency_score": 80,
      "by_source_type": {
        "assessment": {
          "earned_points": 8,
          "available_points": 10,
          "reward_points": 8,
          "competency_score": 80,
          "entries": 1
        }
      }
    },
    "history": [
      {
        "student_id": "...",
        "source_type": "assessment",
        "source_id": "...",
        "attempt_id": "...",
        "earned_points": 8,
        "max_points": 10,
        "reward_points": 8,
        "competency_score": 80,
        "reason": "Hoàn thành bài đánh giá: ...",
        "metadata": {
          "assessment_type": "diagnostic",
          "total_questions": 10
        },
        "created_by": null,
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  }
}
```

## GET `/api/dashboard/stats`

Response hiện có được giữ nguyên và bổ sung trường `points` compact:

```json
{
  "success": true,
  "message": "Lấy thống kê học tập thành công",
  "data": {
    "total_lessons": 0,
    "completed_lessons": 0,
    "completion_percentage": 0,
    "average_quiz_score": null,
    "total_study_time_minutes": 0,
    "current_streak_days": 0,
    "longest_streak_days": 0,
    "points": {
      "total_earned_points": 0,
      "total_available_points": 0,
      "reward_points": 0,
      "academic_percentage": 0,
      "competency_score": 0,
      "by_source_type": {}
    }
  }
}
```

## GET `/api/dashboard/points/summary`

Trả payload điểm compact cho dashboard/header khi không cần lịch sử ledger hoặc breakdown theo nguồn.

```json
{
  "success": true,
  "message": "Lấy tổng điểm thưởng thành công",
  "data": {
    "reward_points": 0,
    "academic_percentage": 0,
    "competency_score": 0
  }
}
```

## POST `/api/lessons/:id/quiz-results`

Ghi nhận kết quả quiz/exercise của lesson thuộc student hiện tại và tạo reward ledger `source_type: "lesson"`.

### Request

```json
{
  "score": 7.5,
  "max_score": 10,
  "total_questions": 10,
  "correct_answers": 8,
  "duration_seconds": 420,
  "ai_feedback": "Tiến bộ tốt",
  "started_at": "2026-05-01T01:00:00.000Z",
  "submitted_at": "2026-05-01T01:07:00.000Z",
  "idempotency_key": "client-attempt-123",
  "metadata": {
    "source": "lesson_quiz"
  }
}
```

### Validation

- `score` must be finite and `0..max_score` via scoring helpers.
- `max_score` must be zero or positive.
- `percentage` is server-calculated.
- `passed` is server-calculated from `percentage >= 70`; any client-provided `passed` value is ignored.
- `total_questions` defaults to `0` and must be a non-negative integer.
- `correct_answers` defaults to `0` and must be `0..total_questions`.
- `duration_seconds` is optional/null and must be a finite non-negative integer when present.
- `idempotency_key` optional, 1-128 chars, allowed chars: letters, numbers, `.`, `_`, `:`, `-`.
- `attempt_id` is accepted as an alias for `idempotency_key` for clients that already name retry keys as attempts.

### Response

```json
{
  "success": true,
  "message": "Ghi nhận kết quả bài học thành công",
  "data": {
    "result": {
      "_id": "...",
      "lesson_id": "...",
      "student_id": "...",
      "idempotency_key": "client-attempt-123",
      "score": 7.5,
      "max_score": 10,
      "percentage": 75,
      "passed": true
    },
    "ledger": {
      "source_type": "lesson",
      "source_id": "...",
      "attempt_id": "...",
      "reward_points": 7.5
    },
    "idempotent": false
  }
}
```

Retries with the same `idempotency_key`/`attempt_id` return the existing result and use ledger atomic upsert, so points are not awarded twice. If no key is supplied, the created result `_id` becomes the ledger attempt id; this prevents ledger duplicate rows for that result but cannot make a client retry idempotent before the result insert completes.

## Teacher assignment grading ledger

`PUT /api/teachers/submissions/:id/grade` keeps the existing route/response shape. After successful grading it records ledger:

- `source_type`: `teacher_assignment`
- `source_id`: assignment id
- `attempt_id`: submission id
- `earned_points`: `score`
- `max_points`: `assignment.total_points`
- `created_by`: teacher id

Score is validated as `0..assignment.total_points`.

Regrade policy: **latest grade wins**. Ledger uses atomic upsert by `(student_id, source_type='teacher_assignment', source_id=assignment_id, attempt_id=submission_id)`: insert if absent, otherwise `$set` the same row's `earned_points`, `max_points`, `reward_points`, `competency_score`, `reason`, `metadata`, and `created_by` to match the latest grade. Regrading the same submission does not create duplicate points and keeps summaries consistent with the current submission score.

## Admin manual adjustment endpoints

### GET `/api/admin/students/:studentId/points`

Returns the same `{ summary, history }` shape as student dashboard history for an admin-selected student.

`studentId` must be a valid Mongo ObjectId. The route first treats it as `StudentProfile._id`, then falls back to lookup by `StudentProfile.user_id` for compatibility with admin screens that use user ids.

### POST `/api/admin/students/:studentId/points`

Appends a manual adjustment ledger row.

```json
{
  "reward_points": -5,
  "reason": "Correct duplicate award",
  "metadata": {
    "note": "Audit note"
  }
}
```

Rules:

- `reward_points` required finite number, non-zero, may be negative.
- `reason` required non-empty string.
- `metadata` optional object.
- `note` optional shortcut; if `metadata` is omitted, route stores `{ "note": "..." }`.
- `created_by` comes from `req.user.id`.
- Manual adjustments do not use `attempt_id`; duplicate prevention is intentionally not applied because each adjustment is an audit event.

Teacher manual adjustment endpoints are deferred until class/student ownership can be enforced without broad changes.

Frontend admin UI is available at `/admin/students/:id/points` (file route `src/app/(admin)/admin/students/[id]/points/page.tsx`). It uses the admin API GET `/api/admin/students/:studentId/points` for summary/history and POST `/api/admin/students/:studentId/points` for manual adjustments. The admin class detail student table links to this route as `Điểm thưởng`.

## Ledger creation triggers

- `POST /api/assessments/:id/attempts/:attemptId/submit` keeps current response shape and calls `pointService.recordAssessmentResult(...)` after grading.
- `POST /api/lessons/:id/quiz-results` creates `LessonQuizResult` and calls `pointService.recordLessonResult(...)`.
- `PUT /api/teachers/submissions/:id/grade` calls `pointService.recordTeacherAssignmentResult(...)` after grading.

Ledger idempotency:

- Attempt-based assessment/lesson service methods use atomic upsert with `$setOnInsert` by `(student_id, source_type, source_id, attempt_id)`.
- Teacher assignment grading uses the same key but updates the existing row on regrade with `$set` instead of appending or double-awarding.
- Unique partial index exists for attempt sources: `assessment`, `lesson`, `teacher_assignment`.

## Index migration

Deployments that previously created the older point ledger unique key `(student_id, source_type, attempt_id)` must run the explicit index migration before relying on the new source-scoped idempotency key:

```bash
npm run migrate:point-ledger-indexes --workspace=packages/backend
```

The script connects with the same DB env pattern as other backend scripts (`MONGODB_URI`, `DB_NAME`) with Mongoose `autoIndex` disabled, verifies exact partial filter expressions for both legacy and target attempt-backed indexes, creates the new unique partial index on `{ student_id: 1, source_type: 1, source_id: 1, attempt_id: 1 }` before dropping the exact legacy index, refuses to drop same-key indexes with unexpected options, prints duplicate-cleanup guidance if target index creation fails, runs `PointLedgerModel.createIndexes()` without `syncIndexes()`, logs the final index set, and closes the MongoDB connection.

Rollout order:

1. Deploy backend code containing the `source_id`-scoped ledger key.
2. Run `npm run migrate:point-ledger-indexes --workspace=packages/backend` once per database.
3. Confirm logs show the new `student_id_1_source_type_1_source_id_1_attempt_id_1` unique index and no unexpected stale indexes.

## Backfill

Run existing graded assessment attempts into point ledger:

```bash
npm run backfill:assessment-points --workspace=packages/backend
```

The script uses the same DB env pattern as `scripts/seed.ts`:

- `MONGODB_URI` default `mongodb://localhost:27017`
- `DB_NAME` default `mathai`

It is idempotent because it calls `pointService.recordAssessmentResult(...)`.

## Tests

```bash
npm run test --workspace=packages/backend
npm run test:ci --workspace=packages/backend
npm run test:backend
```
