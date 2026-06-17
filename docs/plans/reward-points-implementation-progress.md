# Reward Points Implementation Progress

## Trạng thái

Phase 1 vertical slice đã có sẵn. Phase 2 full-stack reward-points work đã được triển khai trong working tree, chưa commit.

## Đã làm

### Backend scoring utilities

- `packages/backend/src/utils/scoring.ts` cung cấp:
  - `validateQuestionPoints`
  - `validateTotalMaxPoints`
  - `validateEarnedPoints`
  - `calculatePercentage`
  - `normalizeDifficultyMultiplier`
  - `calculateRewardPoints`
  - `roundPoints`
- Test bằng `node:test` tại `packages/backend/src/utils/scoring.test.ts`.

### Backend point ledger

- `packages/backend/src/models/point-ledger.model.ts` gồm các trường:
  - `student_id`
  - `source_type`
  - `source_id`
  - `attempt_id`
  - `earned_points`
  - `max_points`
  - `reward_points`
  - `competency_score`
  - `reason`
  - `metadata`
  - `created_by`
  - timestamps
- Indexes:
  - `{ student_id: 1, createdAt: -1 }`
  - `{ student_id: 1, source_type: 1 }`
  - `{ source_type: 1, source_id: 1 }`
  - partial unique `{ student_id, source_type, source_id, attempt_id }` cho `assessment`, `lesson`, `teacher_assignment` có attempt.
- Phase 2 mở rộng repository:
  - `upsertAttemptLedger(...)` dùng atomic `findOneAndUpdate(..., { $setOnInsert }, { upsert: true })` cho assessment/lesson theo key gồm `source_id`.
  - `updateTeacherAssignmentLedger(...)` dùng atomic upsert + `$set` để cập nhật ledger row hiện có khi teacher regrade.
  - `upsertAssessmentLedger(...)` giữ lại như wrapper tương thích ngược.

### Backend service/API

- `packages/backend/src/services/point.service.ts`:
  - `recordAssessmentResult` giữ idempotency bằng attempt upsert theo `(student_id, source_type, source_id, attempt_id)` và normalize `source_id`/`attempt_id`.
  - `recordLessonResult` ghi ledger `source_type: "lesson"` idempotent theo `(student_id, source_type, source_id, attempt_id)`.
  - `recordTeacherAssignmentResult` ghi/cập nhật ledger `source_type: "teacher_assignment"` theo assignment id + submission id.
  - `recordManualAdjustment` append ledger row `source_type: "manual_adjustment"`, cho phép điểm dương/âm, bắt buộc `reason` và `created_by`, không dùng attempt unique key.
  - Student dashboard summary/history shape được giữ nguyên.
- `packages/backend/src/routes/dashboard.routes.ts` từ Phase 1 vẫn cung cấp:
  - `GET /api/dashboard/points`
  - `GET /api/dashboard/points/summary`
  - `points` trong `GET /api/dashboard/stats`.

### Lesson result points

- Thêm `POST /api/lessons/:id/quiz-results` trong `packages/backend/src/routes/lesson.routes.ts`.
- Thêm `lessonService.createQuizResult(...)`:
  - Xác minh lesson thuộc student hiện tại.
  - Validate `score`/`max_score` bằng scoring helpers (`earned 0..max`, percentage tính từ helper).
  - Validate `duration_seconds` là số nguyên hữu hạn không âm nếu có.
  - Tự tính `passed` server-side theo `percentage >= 70`, không tin giá trị client gửi.
  - Tạo `LessonQuizResult` rồi dùng result `_id` làm ledger `attempt_id`.
  - Hỗ trợ `idempotency_key` client cung cấp, và `attempt_id` như alias; key được trim/validate và unique theo `(student_id, lesson_id, idempotency_key)`. Retry cùng key trả result cũ và gọi ledger attempt upsert nên không double-award.
  - Nếu client không gửi key, result `_id` được dùng làm ledger `attempt_id`; retry trước khi insert hoàn tất không thể idempotent hoàn toàn.
  - Không thay đổi completion flow; GET/generate endpoints không award points.
- `LessonQuizResult` thêm optional `idempotency_key` và unique partial index.

### Teacher assignment points

- `TeacherService.gradeSubmission(teacherId, submissionId, data)` validate `score` trong khoảng `0..assignment.total_points`.
- Sau khi grading thành công, service gọi `pointService.recordTeacherAssignmentResult(...)` với:
  - `source_type: "teacher_assignment"`
  - `source_id: assignment._id`
  - `attempt_id: submission._id`
  - `earned_points: score`
  - `max_points: assignment.total_points`
- Regrade semantics: **latest grade wins**. Ledger dùng atomic upsert theo `(student_id, source_type, source_id=assignment_id, attempt_id=submission_id)` và `$set` các trường điểm/reward/competency để khớp điểm chấm mới; không tạo thêm row hoặc double-award. Metadata ghi `regrade_policy: "update_latest_grade"`.
- Route/response shape hiện có được giữ nguyên.

### Admin manual adjustments

- Thêm admin API endpoints trong `packages/backend/src/routes/admin.routes.ts`:
  - `GET /api/admin/students/:studentId/points`
  - `POST /api/admin/students/:studentId/points`
- `studentId` phải là Mongo ObjectId hợp lệ; route ưu tiên `StudentProfile._id`, fallback `StudentProfile.user_id` để tương thích màn hình admin dùng user id.
- POST body:
  - `reward_points`: number hữu hạn, khác 0, có thể âm.
  - `reason`: string bắt buộc.
  - `metadata`: object tùy chọn.
  - `note`: optional shortcut, được chuyển thành `metadata.note` nếu không có `metadata`.
  - `created_by`: lấy từ `req.user.id`.
- Teacher manual adjustment endpoints **deferred**: chưa thêm vì cần đảm bảo teacher/student ownership đầy đủ theo class scope và tránh endpoint chỉnh điểm không an toàn.

### Frontend reward points UI

- Thêm frontend helpers trong `packages/frontend/src/lib/api.ts`:
  - Types `PointLedgerEntry`, `PointLedgerMetadata`, `StudentPointHistoryResult`, `AdminPointAdjustmentPayload`, `LessonQuizResultPayload`.
  - `getDashboardPoints()` / `getStudentPointDetails()` cho student detail page.
  - `adminGetStudentPoints(studentId)` và `adminAdjustStudentPoints(studentId, payload)` cho admin manual adjustment.
  - `submitLessonQuizResult(lessonId, payload)` cho endpoint lesson quiz result; chưa wire rộng vào lesson flow hiện có.
- Thêm student route `GET UI /dashboard/points` tại `packages/frontend/src/app/(dashboard)/dashboard/points/page.tsx`:
  - Fetch `/api/dashboard/points` client-side.
  - Hiển thị summary reward/earned/max/academic/competency, source breakdown từ summary, breakdown nguồn/chủ đề/độ khó derive từ history metadata, và lịch sử ledger.
  - Có loading/error/empty states.
- Thêm nav item dashboard `Điểm thưởng` trong `packages/frontend/src/app/(dashboard)/layout.tsx`; header point badge hiện có vẫn dùng `/dashboard/points/summary`.
- Thêm admin UI route `/admin/students/:id/points` tại file route `packages/frontend/src/app/(admin)/admin/students/[id]/points/page.tsx`:
  - Fetch admin student points, hiển thị summary/history.
  - Form điều chỉnh thủ công với `reward_points` dương/âm, `reason`, optional `note`; submit thành công sẽ refresh lịch sử.
  - Thêm link nhỏ `Điểm thưởng` ở student rows của `packages/frontend/src/app/(admin)/admin/classes/[id]/page.tsx`.
- Teacher manual adjustment UI vẫn **deferred** vì backend chưa có teacher-scoped endpoint/ownership scope.

### Backfill/test scripts

- `packages/backend/package.json`:
  - `test`: `node --import tsx --test "src/**/*.test.ts" "scripts/**/*.test.ts"`
  - `test:ci`: `node --import tsx --test --test-reporter=tap "src/**/*.test.ts" "scripts/**/*.test.ts"`
  - Backend chưa có lint dependency/script; backend `verify:backend` hiện là tests + TypeScript build, không giả định lint đã chạy.
- Root `package.json`:
  - `test:backend`: `npm run test --workspace=packages/backend`
- Thêm `packages/backend/scripts/backfill-assessment-attempt-points.ts`:
  - Kết nối DB theo pattern `scripts/seed.ts` (`MONGODB_URI`, `DB_NAME`).
  - Quét assessment attempts `graded`/`completed` có `total_score` và `max_score`.
  - Gọi `pointService.recordAssessmentResult(...)` nên idempotent.
  - Log `scanned`, `recorded_or_existing`, `skipped`, `failed`.
- Thêm `packages/backend/scripts/migrate-point-ledger-indexes.ts`:
  - Kết nối DB theo pattern `scripts/seed.ts` (`MONGODB_URI`, `DB_NAME`).
  - Only drops the exact legacy unique partial index for key `{ student_id: 1, source_type: 1, attempt_id: 1 }` when its partial filter matches attempt-backed rows (`assessment`, `lesson`, `teacher_assignment` with non-null `attempt_id`); same-key indexes with unexpected options abort for manual inspection.
  - Creates the new unique partial index `{ student_id: 1, source_type: 1, source_id: 1, attempt_id: 1 }` before dropping the legacy index; duplicate-key create failures keep the legacy index in place and print cleanup guidance. Uses `createIndexes()` only, not `syncIndexes()`, to avoid dropping unrelated indexes.
  - Log kết quả/final indexes và luôn đóng connection.

### Backend tests

- Mở rộng `packages/backend/src/services/point.service.test.ts` cho:
  - scripts test backend/root.
  - assessment attempt upsert path.
  - lesson ledger idempotency + validation.
  - teacher assignment latest-grade ledger update + validation.
  - manual adjustment append + validation.

## Verification cần chạy

```bash
npm run test --workspace=packages/frontend
npm run lint:reward-points --workspace=packages/frontend
npm run verify:frontend
npm run verify:backend
npm run verify
```

Verification notes:

- Frontend `test`/`test:ci` dùng `bun test` để Bun tự discover tests. Explicit glob args từng fail dưới Windows/npm với unmatched filters, trong khi `bun test` từ `packages/frontend` chạy được test suite.
- Full frontend lint (`npm run lint --workspace=packages/frontend`, tức `eslint .`) vẫn giữ nguyên và hiện có nhiều lỗi baseline ngoài phạm vi reward-points. Phase 2 canonical `verify:frontend` dùng scoped `lint:reward-points` cho các file reward-points đã chạm tới cho đến khi cleanup baseline lint toàn frontend; script này gọi `packages/frontend/test/lint-reward-points.mjs` để truyền literal file paths có dấu ngoặc `(...)`/`[...]` cho ESLint ổn định qua npm trên Windows.
- Backend không có lint dependency/script hiện hữu; `verify:backend` chỉ bao gồm backend tests và `tsc` build.

## Remaining work

- Teacher-scoped manual adjustment endpoint nếu có thiết kế ownership/class scope chặt chẽ.
- DB integration tests với Mongo test infrastructure ổn định.
