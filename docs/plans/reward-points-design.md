# Thiết kế hệ thống điểm thưởng và điểm năng lực

## Mục tiêu

- Mỗi bài đánh giá/bài tập có tổng điểm tối đa rõ ràng.
- Mỗi câu hỏi có điểm tối đa riêng, tổng điểm câu hỏi phải bằng điểm tối đa của bài khi có assignment max.
- Mỗi học viên kiếm điểm theo cùng một công thức để đảm bảo công bằng.
- Điểm thưởng dùng cho động lực học tập; điểm năng lực dùng để đánh giá học thuật.

## Khái niệm điểm

| Trường                | Ý nghĩa                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `earned_points`       | Điểm học viên đạt được từ câu trả lời.                               |
| `max_points`          | Điểm tối đa có thể đạt từ nguồn điểm đó.                             |
| `reward_points`       | Điểm thưởng hiển thị trong UI, có thể nhân theo độ khó nhưng bị cap. |
| `competency_score`    | Điểm năng lực 0-100, hiện tính bằng phần trăm học thuật.             |
| `academic_percentage` | Tổng `earned_points / max_points * 100`.                             |

## Công thức vertical slice hiện tại

- `question.score` trong assessment là điểm tối đa câu hỏi.
- `answer.score` là điểm kiếm được sau khi chấm.
- `max_points = sum(question.score)` và tất cả điểm câu hỏi phải dương.
- `earned_points` phải nằm trong khoảng `0..max_points`.
- `academic_percentage = round(earned_points / max_points * 100, 2)`.
- `reward_points = min(earned_points * difficulty_multiplier, max_points)`.
- Difficulty multiplier hiện hỗ trợ:
  - easy/basic: `1`
  - medium/normal: `1.15`
  - hard/advanced: `1.3`
  - challenge: `1.5`
  - unknown/null: `1`

## Ledger

Backend ghi một bản ghi ledger cho mỗi nguồn điểm attempt-based bằng atomic upsert theo unique key `(student_id, source_type, source_id, attempt_id)` để tránh race condition và không cộng điểm lặp khi retry cùng attempt trong cùng source. Áp dụng cho `assessment`, `lesson`, và `teacher_assignment`. `source_id`, `attempt_id`, và `created_by` được normalize/lưu dạng string ổn định; `student_id` vẫn là ObjectId.

Assessment và lesson dùng `$setOnInsert` để retry cùng attempt không thay đổi điểm đã ghi. Teacher assignment regrade dùng policy explicit **latest grade wins**: cùng `(student_id, source_type='teacher_assignment', source_id=assignment_id, attempt_id=submission_id)` được update atomically bằng `$set` cho `earned_points`, `max_points`, `reward_points`, `competency_score`, `reason`, `metadata`, `created_by`; không append duplicate row nên không double-award.

Manual adjustment là audit event riêng: mỗi request append một ledger row `source_type = manual_adjustment`, không dùng `attempt_id`, cho phép `reward_points` dương hoặc âm, bắt buộc `reason` và `created_by`.

Source type:

- `assessment`
- `lesson`
- `teacher_assignment`
- `bonus`
- `penalty`
- `manual_adjustment`

## Phạm vi đã triển khai

- Reusable scoring utility: `packages/backend/src/utils/scoring.ts`.
- Point ledger model/repository: `packages/backend/src/models/point-ledger.model.ts`.
- Point service ghi assessment/lesson/teacher_assignment result idempotent và aggregate summary/history: `packages/backend/src/services/point.service.ts`.
- Assessment submission ghi ledger sau khi chấm thành công.
- Lesson result API `POST /api/lessons/:id/quiz-results` tạo `LessonQuizResult` và ghi ledger idempotent; hỗ trợ `idempotency_key`/`attempt_id` client, validate `duration_seconds`, và tự tính `passed` theo threshold 70%.
- Teacher grading ghi ledger `teacher_assignment` sau khi chấm; regrade policy là latest-grade-wins update trên cùng ledger row.
- Admin manual adjustment API endpoints `/api/admin/students/:studentId/points` append ledger audit rows.
- Student points page route `/dashboard/points` shows summary, source/topic/difficulty breakdowns, and ledger history.
- Admin manual adjustment frontend route `/admin/students/:id/points` (file route `[id]`) supports summary/history and positive/negative manual adjustments.
- Index migration script for ledger unique key cũ `(student_id, source_type, attempt_id)` sang key mới `(student_id, source_type, source_id, attempt_id)`: `npm run migrate:point-ledger-indexes --workspace=packages/backend`.
- Backfill script assessment attempts `graded`/`completed` cũ: `npm run backfill:assessment-points --workspace=packages/backend`.
- Backend reward point tests run through `npm run test --workspace=packages/backend`, `npm run test:ci --workspace=packages/backend`, or root `npm run test:backend`.
- Dashboard API trả điểm thưởng và compact summary.
- Frontend dashboard header hiển thị `reward_points` từ API thay vì hardcode.

## Phạm vi chưa triển khai

- Teacher-scoped manual adjustment endpoint với ownership/class scope chặt chẽ.
- Leaderboard, streak reward, achievement reward.
