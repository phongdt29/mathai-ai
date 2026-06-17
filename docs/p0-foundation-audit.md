# P0 Foundation Audit - Database runtime và frontend integration

Ngày ghi nhận: 2026-05-06

## 1. Kết luận database runtime hiện tại

Backend runtime hiện tại dùng MongoDB thông qua Mongoose.

Bằng chứng chính:

- `packages/backend/src/config/database.ts` import `mongoose`, gọi `mongoose.connect(config.db.uri, { dbName: config.db.database })`, và log trạng thái `MongoDB connected successfully`.
- `packages/backend/src/config/index.ts` đọc `MONGODB_URI` và `DB_NAME` trong `config.db`.
- `packages/backend/src/index.ts` gọi `connectDatabase()` trước khi `app.listen()`.
- `packages/backend/package.json` khai báo dependency runtime `mongoose` và không khai báo MySQL/PostgreSQL driver.
- `packages/backend/src/models` chứa nhiều schema/model Mongoose dùng `Schema`, `Document`, `mongoose.Types.ObjectId`, `mongoose.model(...)`.

## 2. Vai trò của `database/schema.sql`

`database/schema.sql` hiện là tài liệu/blueprint SQL lịch sử hoặc tham chiếu nghiệp vụ, không phải nguồn migration runtime của backend hiện tại.

Trong phạm vi khảo sát P0 này chưa thấy backend import, chạy hoặc phụ thuộc trực tiếp vào `database/schema.sql`. Vì vậy, cho tới khi có quyết định kiến trúc khác, nguồn sự thật runtime cần ưu tiên là:

1. Mongoose models trong `packages/backend/src/models`.
2. Services/controllers/routes đang dùng các repository/model đó.
3. Dữ liệu MongoDB được cấu hình bằng `MONGODB_URI` và `DB_NAME`.

Khuyến nghị P0: không thêm logic runtime MySQL/SQL khi chưa có quyết định migration chính thức. Nếu muốn dùng SQL schema trong tương lai, cần một quyết định kiến trúc riêng kèm kế hoạch migration dữ liệu và cập nhật toàn bộ data access layer.

## 3. Mapping entity cấp cao SQL schema ↔ Mongoose models

| Nhóm nghiệp vụ | SQL schema tham chiếu | Mongoose models/runtime hiện tại | Ghi chú |
| --- | --- | --- | --- |
| Người dùng và hồ sơ học sinh | `users`, `student_profiles`, `student_theme_preferences` | `User`, `StudentProfile`, `StudentThemePreference` | Runtime dùng MongoDB ObjectId thay vì BIGINT. |
| AI tutor | `ai_tutors` | `AITutor` | Có seed SQL mẫu, nhưng runtime hiện tại cần seed Mongo nếu muốn dữ liệu tương ứng. |
| Đánh giá | `assessments`, `assessment_questions`, `assessment_attempts`, `assessment_answers` | `Assessment`, `AssessmentQuestion`, `AssessmentAttempt`, `AssessmentAnswer` | Đã có model và repository Mongoose. |
| Giáo trình/bài học | `curricula`, `curriculum_modules`, `lessons`, `lesson_exercises`, `lesson_exercise_answers`, `lesson_quiz_results`, `lesson_recommendations` | `Curriculum`, `CurriculumModule`, `Lesson`, `LessonExercise`, `LessonExerciseAnswer`, `LessonQuizResult`, `LessonRecommendation` | Các fallback frontend lessons chỉ là demo khi API rỗng/lỗi. |
| Solver AI | `solver_requests` | `SolverRequest` | SQL có cột bổ sung `common_mistakes`, `ai_model`, `tokens_used`; cần đối chiếu model trước khi cam kết schema runtime. |
| Theo dõi tiến độ | `topic_mastery`, `student_progress` | `TopicMastery`, `StudentProgress` | Dashboard student dùng các model này qua route `/api/dashboard`. |
| Chat AI | `ai_tutor_conversations`, `ai_tutor_messages` | `AITutorConversation`, `AITutorMessage` | Runtime chat dùng MongoDB. |
| AI logs | `ai_generation_logs` | `AIGenerationLog` | Dùng cho metadata sinh nội dung AI. |
| Thông báo | `notifications` | `Notification`, `ParentNotification`, `ParentNotificationPreference` | Có phân tách thêm cho luồng phụ huynh trong Mongoose. |
| Phụ huynh - học sinh | Không thấy bảng riêng trong phần SQL hiện tại | `ParentChild` | Runtime có model quan hệ phụ huynh/con riêng. |
| Giáo viên/lớp/bài giao | Không thấy đầy đủ trong SQL hiện tại | `TeacherClass`, `TeacherAssignment`, `StudentSubmission` | Runtime có nhóm model giáo viên riêng. |
| Content library/templates | Không thấy đầy đủ trong SQL hiện tại | `CurriculumTemplate`, `CurriculumModuleTemplate`, `LessonTemplate`, `ExerciseTemplate`, `ContentAssignment`, `StudentAssignedContent`, `ApprovalRequest` | Runtime đã mở rộng so với SQL blueprint. |
| Điểm thưởng | Không thấy bảng tương ứng trong phần SQL hiện tại | `PointLedger` | Runtime có point ledger phục vụ reward points. |
| Cài đặt hệ thống | Không thấy bảng tương ứng trong phần SQL hiện tại | `SystemSetting` | Runtime lưu setting bằng MongoDB. |

## 4. Cấu hình môi trường đã làm rõ

`packages/backend/.env.example` đã được cập nhật để ưu tiên MongoDB runtime:

- Thêm `MONGODB_URI=mongodb://localhost:27017`.
- Giữ `DB_NAME=mathai` theo config hiện tại.
- Loại bỏ nhóm biến mẫu MySQL cũ (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`) khỏi file backend env example để tránh hiểu nhầm backend đang dùng MySQL.

Không thay đổi logic runtime trong code.

## 5. Frontend pages còn mock/static hoặc cần nối API thật

Ưu tiên dashboard/auth/parent theo yêu cầu P0.

### Auth

| Route/page | Trạng thái | API backend liên quan | Việc cần làm tiếp |
| --- | --- | --- | --- |
| `packages/frontend/src/app/(auth)/login/page.tsx` | Đã gọi `/auth/login`, nhưng còn nút tài khoản demo hard-coded. | `POST /api/auth/login` | Quyết định demo accounts là dữ liệu dev-only hay seed Mongo chính thức; tránh hiển thị ở production nếu không muốn. |
| `packages/frontend/src/app/(auth)/register/page.tsx` | Form có dữ liệu lựa chọn tĩnh; cần đối chiếu validate/API. | `POST /api/auth/register` | Kiểm thử end-to-end đăng ký với MongoDB runtime; chuẩn hóa payload với backend validator. |
| `packages/frontend/src/app/(auth)/forgot-password/page.tsx` | Có dấu hiệu UI/form tĩnh, chưa xác nhận API reset password runtime. | Chưa thấy route reset password trong `auth.routes.ts` | Cần thiết kế API hoặc đánh dấu chưa hỗ trợ. |

### Dashboard học sinh

| Route/page | Trạng thái | API backend liên quan | Việc cần làm tiếp |
| --- | --- | --- | --- |
| `packages/frontend/src/app/(dashboard)/dashboard/page.tsx` | Gọi `/dashboard/stats`, nhưng `recentLessons`, `achievements`, và nhãn change như `+3 tuần này` còn hard-coded. | `GET /api/dashboard/stats` | Nối recent lessons/achievements thật hoặc tách rõ demo placeholders. |
| `packages/frontend/src/app/(dashboard)/dashboard/lessons/page.tsx` | Có gọi `/lessons/`, nhưng fallback sang `fallbackLessonSummaries` demo khi API rỗng/lỗi. | `GET /api/lessons/` | Seed lesson Mongo hoặc hiển thị empty state thật thay vì demo khi production. |
| `packages/frontend/src/app/(dashboard)/dashboard/lessons/[id]/page.tsx` | Có fallback lesson detail demo và thông báo bài học demo. | Lesson detail/generation endpoints | Tiếp tục giữ demo an toàn, nhưng cần API thật cho lesson saved từ curriculum. |
| `packages/frontend/src/app/(dashboard)/dashboard/progress/page.tsx` | `weeklyData`, `skills`, `achievements`, motivational messages hard-coded. | `GET /api/dashboard/progress`, `GET /api/dashboard/mastery`, `GET /api/dashboard/stats` | Nối dữ liệu progress/mastery thật. |
| `packages/frontend/src/app/(dashboard)/dashboard/assessment/page.tsx` | Có fallback hardcoded questions khi API lỗi/rỗng. | Assessment routes | Cần luồng tạo/lấy assessment thật và empty/error state rõ. |

### Parent

| Route/page | Trạng thái | API backend liên quan | Việc cần làm tiếp |
| --- | --- | --- | --- |
| `packages/frontend/src/app/(parent)/parent/page.tsx` | Dữ liệu `children` hard-coded. | `GET /api/parent/children`, `GET /api/parent/children/:studentId/dashboard` | Nối danh sách con và dashboard thật. |
| `packages/frontend/src/app/(parent)/parent/children/page.tsx` | Dữ liệu `childrenData` hard-coded. | `GET /api/parent/children`, dashboard từng child | Nối API và trạng thái không có liên kết parent-child. |
| `packages/frontend/src/app/(parent)/parent/notifications/page.tsx` | Dữ liệu `notifications` hard-coded. | `GET /api/parent/notifications`, `POST /api/parent/notifications/:id/read`, `POST /api/parent/notifications/read-all` | Nối API notification thật. |
| `packages/frontend/src/app/(parent)/parent/reports/page.tsx` | `weeklyReports` hard-coded. | Chưa thấy route reports riêng; có dashboard child | Thiết kế API report hoặc render từ dashboard/progress hiện có. |
| `packages/frontend/src/app/(parent)/parent/settings/page.tsx` | Cần kiểm tra/nối preferences. | `GET /api/parent/preferences`, `PUT /api/parent/preferences` | Nối API preferences thật nếu chưa có. |

## 6. P1 onboarding/register

Ngày ghi nhận: 2026-05-06

Đã hoàn thiện bước đầu flow đăng ký học sinh lõi theo `docs/datta.txt` với phạm vi nhỏ, không đổi route public:

- Frontend register tại `packages/frontend/src/app/(auth)/register/page.tsx` đã thu các trường: họ tên, email, mật khẩu, ngày sinh, địa chỉ/nơi ở, số điện thoại, trường học, khối lớp 6-12, học lực tự đánh giá, điểm trung bình toán, lựa chọn thầy/cô AI, màu yêu thích, sở thích.
- Payload `POST /api/auth/register` hiện gửi các trường backend đang lưu được: `full_name`, `email`, `password`, `date_of_birth`, `address`, `phone`, `school_name`, `grade_level`, `self_assessed_level`, `math_average_score`, `preferred_teacher_gender`, `favorite_color`, `interests`.
- Backend validator/service/model/type đã bổ sung an toàn cho `address` trong validator đăng ký và `preferred_teacher_gender` trong hồ sơ học sinh. `selected_tutor_id` vẫn được backend hỗ trợ nếu có ObjectId tutor cụ thể, nhưng form P1 hiện chỉ chọn phong cách thầy/cô để tránh phụ thuộc seed Mongo AI tutors.
- Phần còn lại của P1 onboarding: nếu cần chọn tutor cụ thể thay vì chỉ thầy/cô, cần seed MongoDB AI tutors và/hoặc mở public endpoint an toàn trước đăng nhập để form register có thể lấy danh sách tutor thật.

## 7. P1 assessment đầu vào

Ngày ghi nhận: 2026-05-06

Đã nối luồng test đầu vào sau onboarding với API thật hiện có theo phạm vi nhỏ, không refactor lớn:

- Backend assessment runtime đã có đủ các endpoint chính dưới `GET/POST /api/assessments`: danh sách, tạo đề `POST /api/assessments/generate`, bắt đầu lượt làm `POST /api/assessments/:id/start`, lưu từng câu trả lời `POST /api/assessments/:id/attempts/:attemptId/answers`, nộp bài `POST /api/assessments/:id/attempts/:attemptId/submit`, lấy kết quả theo assessment và kết quả gần nhất.
- Frontend assessment tại `packages/frontend/src/app/(dashboard)/dashboard/assessment/page.tsx` đã bỏ bộ câu hỏi hard-coded làm nguồn chính; trang hiện gọi API thật để tạo đề diagnostic 8 câu, start attempt, render trắc nghiệm/tự luận, lưu câu trả lời, submit attempt và hiển thị điểm/phân tích nếu backend trả về.
- `packages/frontend/src/lib/api.ts` đã bổ sung client/types tối thiểu cho assessment flow: `generateAssessment`, `startAssessmentAttempt`, `saveAssessmentAnswer`, `submitAssessmentAttempt`, `getLatestAssessmentResult`.
- Sau đăng ký thành công, `packages/frontend/src/app/(auth)/register/page.tsx` điều hướng học sinh tới `packages/frontend/src/app/(dashboard)/dashboard/assessment/page.tsx` qua route `/dashboard/assessment`, phù hợp user flow trong `docs/datta.txt`: đăng ký → nhập thông tin cá nhân → test đầu vào → AI phân tích.
- Không thêm endpoint backend mới trong subtask này vì backend hiện đã hỗ trợ generate/start/save/submit/result. Lưu ý backend vẫn phụ thuộc AI provider cho tạo đề, chấm câu tự luận và phân tích; khi AI/API lỗi, frontend hiển thị trạng thái lỗi/empty và cho thử lại thay vì dùng dữ liệu giả.

Phần còn thiếu sau bước này:

- Chưa tự động gọi endpoint phân loại `/api/assessments/classify` sau submit; hiện submit đã lưu điểm, topic mastery và AI analysis từ assessment service.
- Cần kiểm thử end-to-end với MongoDB + AI provider thật để xác nhận chất lượng đề/chấm tự luận và dữ liệu point ledger/topic mastery.

## 8. P1 curriculum cá nhân hóa sau assessment

Ngày ghi nhận: 2026-05-06

Đã nối trang curriculum với API thật hiện có theo phạm vi an toàn, không thêm dữ liệu giả để đánh dấu hoàn tất:

- Backend curriculum runtime đã có đủ endpoint cốt lõi dưới `/api/curriculum`: tạo giáo trình `POST /api/curriculum/generate`, danh sách `GET /api/curriculum`, giáo trình active `GET /api/curriculum/active`, chi tiết giáo trình `GET /api/curriculum/:id`, chi tiết module `GET /api/curriculum/:id/modules/:moduleId`.
- Service `packages/backend/src/services/curriculum.service.ts` đã dùng kết quả diagnostic graded mới nhất từ assessment attempt để đưa vào prompt tạo giáo trình; khi tạo giáo trình mới, service archive curriculum active cũ và tạo curriculum/module/lesson/exercise trong MongoDB.
- Frontend API client `packages/frontend/src/lib/api.ts` đã bổ sung types/client tối thiểu cho curriculum: `listCurricula`, `getActiveCurriculum`, `getCurriculumDetail`, `generateCurriculum`.
- Trang `packages/frontend/src/app/(dashboard)/dashboard/curriculum/page.tsx` đã thay phần subject static bằng dữ liệu API thật: tải active curriculum, lấy detail để hiển thị module/bài học, hiển thị danh sách curriculum cũ nếu chưa có active, và có loading/error/empty state rõ ràng.
- Khi chưa có curriculum nhưng đã có assessment result gần nhất, trang curriculum cho phép bấm tạo giáo trình cá nhân hóa. Nếu chưa có assessment result, trang hướng người học về `/dashboard/assessment` thay vì dùng fallback giả.
- Trang `packages/frontend/src/app/(dashboard)/dashboard/assessment/page.tsx` đã thêm CTA an toàn sang `/dashboard/curriculum` sau khi có kết quả hoặc khi xem kết quả gần nhất; chưa tự động redirect để không phá flow xem kết quả hiện có.
- Không thêm endpoint backend mới trong subtask này vì backend hiện đã đủ endpoint nhỏ cần thiết cho list/active/detail/generate. Lưu ý backend vẫn phụ thuộc AI provider khi gọi generate curriculum; frontend giữ thông báo lỗi/empty state nếu AI/API lỗi.

Phần còn thiếu sau bước này:

- Chưa tự động tạo curriculum ngay trong submit assessment; hiện người học bấm CTA ở trang curriculum để tránh chặn luồng submit nếu AI curriculum lỗi/chậm.
- Chưa triển khai quiz cuối buổi, parent, OCR trong phạm vi P1 curriculum này.

## 9. P1 dashboard/progress/lessons nối dữ liệu thật

Ngày ghi nhận: 2026-05-06

Đã nối dashboard học sinh, trang tiến độ và danh sách bài học với API thật hiện có sau assessment/curriculum:

- Backend hiện có các endpoint đủ dùng cho phạm vi overview: `GET /api/dashboard/stats`, `GET /api/dashboard/progress`, `GET /api/dashboard/mastery`, `GET /api/dashboard/points`, `GET /api/lessons`, `GET /api/lessons/today-recommendation`, `GET /api/curriculum/active`, `GET /api/assessments/latest-result`.
- Không thêm endpoint backend mới trong subtask này vì các route/service/model hiện có đã cung cấp stats, progress, topic mastery, point summary, lesson list và recommendation. Tránh refactor lớn để không phá luồng register/assessment/curriculum đã hoàn tất.
- Frontend API client `packages/frontend/src/lib/api.ts` đã bổ sung types/client tối thiểu cho dashboard/progress/lesson overview: `getDashboardStats`, `getDashboardProgress`, `getTopicMastery`, `getTodayRecommendation`, `listLessons`, cùng type `DashboardStats`, `TopicMastery`, `AdaptiveRecommendation`.
- Trang `packages/frontend/src/app/(dashboard)/dashboard/page.tsx` hiện tải song song stats, mastery, recommendation và lesson list thật; recent lessons lấy từ `/api/lessons`, achievements tính từ point summary/mastery/streak/completion thật; có loading/error/empty state khi chưa có lesson/curriculum.
- Trang `packages/frontend/src/app/(dashboard)/dashboard/progress/page.tsx` đã bỏ `weeklyData`, `skills`, `achievements` hard-coded làm trạng thái hoàn tất. Trang dùng stats/progress thật, topic mastery thật, assessment latest-result thật và point summary thật; nếu chưa có mastery/assessment thì hiển thị empty state rõ thay vì dữ liệu giả.
- Trang `packages/frontend/src/app/(dashboard)/dashboard/lessons/page.tsx` đã bỏ fallback demo `fallbackLessonSummaries`; danh sách bài học lấy từ `/api/lessons` theo active curriculum nếu có, hiển thị recommendation hôm nay từ `/api/lessons/today-recommendation`, và empty state hướng người học làm assessment/tạo curriculum khi chưa có bài học.
- Tiến độ lesson trên overview hiện chỉ phản ánh trạng thái lesson API (`completed` = 100%, `in_progress` = 50%, còn lại = 0%) vì backend chưa có endpoint progress theo từng lesson ngoài status/quiz history. Không dùng dữ liệu giả để đánh dấu hoàn tất.

Phần còn thiếu sau bước này:

- Chưa triển khai quiz cuối buổi 15 phút hoặc cập nhật lesson status tự động sau khi đạt quiz/practical exercise; hiện vẫn dựa vào endpoint hoàn thành lesson và trạng thái lưu trong `Lesson.status`.
- Chưa có analytics thời gian học theo từng ngày thật; progress page chỉ phân bổ tổng `total_study_time_minutes` thành biểu đồ trực quan và ghi rõ khi chưa có thời gian học được ghi nhận.
- Chưa nối parent dashboard/children/notifications/preferences và chưa triển khai OCR.

## 10. P2 quiz/kiểm tra cuối buổi 15 phút

Ngày ghi nhận: 2026-05-06

Đã bắt đầu hoàn thiện flow kiểm tra cuối buổi theo `docs/datta.txt`, ưu tiên dùng API lesson/quiz thật hiện có và không triển khai parent/OCR:

- Backend hiện đã có đủ endpoint cốt lõi cho phạm vi quiz cuối buổi: `GET /api/lessons/:id` trả lesson kèm `exercises`, `POST /api/lessons/:id/exercise-attempts/submit` chấm/lưu từng câu trả lời và tạo `LessonQuizResult`, `GET /api/lessons/today-recommendation` trả gợi ý học tiếp dựa trên kết quả gần nhất.
- Không thêm hoặc refactor backend trong bước này vì route/service/model hiện tại đã hỗ trợ submit bài tập thực tế, lưu `LessonExerciseAnswer`, `LessonQuizResult`, point ledger idempotent, feedback cơ bản và lịch sử attempt.
- Frontend check page `packages/frontend/src/app/(dashboard)/dashboard/lessons/[id]/content/check/page.tsx` đã chuyển trọng tâm từ tự kiểm tra cục bộ sang bài kiểm tra cuối buổi 15 phút dùng dữ liệu `exercises` từ lesson detail API thật.
- Check page hiện có timer client-side 15 phút, nhập/chọn đáp án, tự nộp các câu đã làm khi hết giờ, nộp thủ công khi hoàn thành đủ câu, gọi `submitLessonExerciseAttempt`, hiển thị điểm tổng, đúng/sai từng câu, feedback từng câu nếu backend trả về, và tải `today-recommendation` sau submit để hiển thị CTA học tiếp.
- Empty state vẫn giữ rõ ràng khi lesson chưa có exercises; không dùng dữ liệu giả để đánh dấu hoàn tất nếu API lesson không có quiz/exercise.

Cập nhật đóng vòng sau gap report:

- Backend `packages/backend/src/services/lesson.service.ts` hiện tự chạy logic hoàn tất khi quiz/attempt đạt ngưỡng pass: mark `Lesson.status = completed`, upsert `StudentProgress`, cập nhật `TopicMastery` theo từng `LessonExercise.topic` và fallback an toàn về objective/title của lesson nếu thiếu topic.
- Cùng flow pass cũng mark các `LessonRecommendation` active liên quan tới lesson đó là completed để recommendation hôm nay không tiếp tục giữ bài đã học xong.
- Response submit quiz/exercise-attempt trả thêm các cờ `lesson_completed`, `progress_updated`, `mastery_updated`, `recommendation_completed` để frontend biết vòng progress/mastery/recommendation đã đóng.
- Check page `packages/frontend/src/app/(dashboard)/dashboard/lessons/[id]/content/check/page.tsx` hiển thị thông báo cập nhật lộ trình sau khi backend trả các cờ này và vẫn refresh recommendation sau submit.

Phần còn thiếu sau bước này:

- Chưa có cơ chế chống gian lận hoặc timer server-side; timer hiện chỉ chạy phía client như phạm vi subtask.
- Cần kiểm thử end-to-end với MongoDB + lesson exercises thật để xác nhận dữ liệu point ledger/progress/mastery/recommendation trong môi trường staging.

## 11. P2 parent dashboard/notifications

Ngày ghi nhận: 2026-05-06

Đã nối các trang phụ huynh chính với API thật hiện có, ưu tiên empty state an toàn và không triển khai notification job production:

- Backend hiện có route phụ huynh dưới `/api/parent`: `GET /api/parent/children`, `GET /api/parent/children/:studentId/dashboard`, `GET /api/parent/notifications`, `GET /api/parent/notifications/unread`, `POST /api/parent/notifications/:id/read`, `POST /api/parent/notifications/read-all`, `GET /api/parent/preferences`, `PUT /api/parent/preferences`.
- Backend engagement hiện trigger thông báo in-app cho phụ huynh khi học sinh bắt đầu/kết thúc session qua `parentMonitoringService`; chưa thêm scheduler, email, SMS hoặc push production job.
- Bổ sung nhỏ, an toàn ở model/service preferences để schema MongoDB hỗ trợ các key mà service/type đang dùng (`notify_session_start`, `notify_session_complete`, `notify_absent`, `notify_daily_summary`, `notify_quiz_result`) đồng thời giữ key legacy (`notify_absence`, `notify_quiz_failure`, ...) để không phá dữ liệu cũ.
- Frontend API client `packages/frontend/src/lib/api.ts` đã bổ sung types/client cho parent: children, child dashboard, notifications read/unread/read-all, preferences get/update.
- `packages/frontend/src/app/(parent)/parent/page.tsx` tải danh sách con và dashboard từng học sinh từ API thật, hiển thị tổng quan phiên học, focus, quiz, risk, lịch hôm nay và empty state khi chưa liên kết học sinh.
- `packages/frontend/src/app/(parent)/parent/children/page.tsx` hiển thị trạng thái học tập từng học sinh từ parent dashboard API: attendance, sessions, active minutes, focus, recent quiz và intervention suggestions; không dùng subject mock.
- `packages/frontend/src/app/(parent)/parent/reports/page.tsx` không còn weekly mock; báo cáo cơ bản được tổng hợp từ dashboard API từng học sinh vì chưa có endpoint report riêng.
- `packages/frontend/src/app/(parent)/parent/notifications/page.tsx` dùng notification API thật, hỗ trợ đánh dấu từng thông báo hoặc tất cả đã đọc nếu backend trả endpoint.
- `packages/frontend/src/app/(parent)/parent/settings/page.tsx` hiển thị thông tin tài khoản đang đăng nhập ở dạng read-only và nối preferences API thật; nếu backend chưa có preference thì hiển thị mặc định an toàn và cho lưu để tạo cấu hình.

Phần còn thiếu sau bước này:

- Chưa có API/report weekly history riêng; trang reports hiện chỉ là tổng hợp thời điểm hiện tại từ child dashboard.
- Chưa có flow UI/admin để tạo quan hệ parent-child; khi chưa có dữ liệu liên kết, frontend hiển thị empty state.
- Chưa triển khai production notification delivery qua email/SMS/push hoặc scheduler daily/weekly summary.
- Cần kiểm thử end-to-end với MongoDB staging có parent-child/session/quiz thật để xác nhận dữ liệu dashboard, risk và notification phát sinh đúng.

## 12. P4 solver image/OCR bước đầu

Ngày ghi nhận: 2026-05-06

Đã hoàn thiện bước đầu AI Solver hỗ trợ nhập đề bằng ảnh/OCR theo phạm vi an toàn trong `docs/datta.txt`, không phá luồng solver text hiện có:

- Backend solver đã có schema runtime cho image input trong `packages/backend/src/models/solver.model.ts`: `input_type`, `image_url`, `parsed_text`.
- Bổ sung endpoint authenticated `POST /api/solver/parse-image` trong `packages/backend/src/routes/solver.routes.ts`. Endpoint nhận multipart field `image`, lưu file bằng middleware upload hiện có đã mở rộng trong `packages/backend/src/middleware/upload.ts`, trả về `image_url`, `parsed_text`, `ocr_status` và message hướng dẫn xác nhận.
- `packages/backend/src/services/ai.service.ts` đã có hàm OCR bằng OpenAI-compatible multimodal chat completion: gửi ảnh dạng data URL và prompt chỉ OCR đề toán, không giải bài, không suy đoán dữ kiện mờ. Nếu thiếu `OPENAI_API_KEY`, provider/base URL/model không hỗ trợ vision, hoặc AI lỗi, service không giả lập OCR mà trả luồng `manual_required`.
- `packages/backend/src/services/solver.service.ts` lưu request ảnh vào `SolverRequest` với `input_type = image`; khi OCR thành công lưu `parsed_text`, khi không OCR được lưu ảnh và yêu cầu học sinh nhập/chỉnh text thủ công. Luồng `POST /api/solver/solve` vẫn nhận `problem_text` như cũ và dùng solver hint-first hiện có.
- Frontend API client `packages/frontend/src/lib/api.ts` bổ sung `uploadSolverImage` dùng `FormData` và token auth để gọi `POST /api/solver/parse-image` mà không đặt `Content-Type: application/json`.
- Trang solver `packages/frontend/src/app/(dashboard)/dashboard/solver/page.tsx` hỗ trợ chọn chế độ text hoặc image, upload/preview ảnh, hiển thị trạng thái OCR, đưa `parsed_text` vào textarea để học sinh xác nhận/chỉnh lại, sau đó gọi solver text bằng phần đề đã xác nhận và hiển thị progressive hint/solution như trước.

Cập nhật đóng gap solver bài tương tự/luyện thêm:

- Backend `packages/backend/src/services/solver.service.ts` đã bổ sung sinh `similar_problems` sau khi người học yêu cầu `full_solution`. Mỗi bài luyện thêm ưu tiên schema `problem`, `hint`, `difficulty`, `topic`, kèm `answer` hoặc `solution_outline` nếu AI trả về phù hợp.
- Backend vẫn giữ hint-first cho `hint` và `detailed_hint`; ở các stage này response trả `similar_problems: []` kèm message rằng bài luyện thêm chỉ xuất hiện sau lời giải đầy đủ.
- Nếu AI JSON lỗi/không khả dụng khi tạo bài tương tự, service trả empty array và message fallback an toàn, không hard-code bài mẫu giả.
- Runtime model `packages/backend/src/models/solver.model.ts` có thêm `similar_problems` và `similar_problems_message` để lưu metadata bài luyện thêm trong lịch sử solver.
- Frontend API helper `packages/frontend/src/lib/api.ts` có `solveProblem` và type `SolverSimilarProblem`/`SolverResponse` để dùng chung response schema mới.
- Trang solver `packages/frontend/src/app/(dashboard)/dashboard/solver/page.tsx` hiển thị khối “Bài tương tự / luyện thêm” sau full solution, cho copy đề hoặc đưa một bài luyện thêm vào textarea để tiếp tục giải bằng solver text. Luồng upload/preview/OCR/confirm parsed text vẫn giữ nguyên.
- Test nhẹ `packages/frontend/src/lib/api.test.ts` đã smoke validate helper `solveProblem` gọi `POST /api/solver/solve` và nhận `similar_problems`.

Giới hạn còn lại:

- OCR thật phụ thuộc cấu hình `OPENAI_API_KEY`, `OPENAI_BASE_URL` và model có hỗ trợ vision/multimodal. Khi provider không hỗ trợ, hệ thống chỉ hỗ trợ upload/preview/confirm-manual flow rõ ràng, không dùng dữ liệu giả.
- Ảnh hiện lưu local dưới `/uploads/solver`; cần quyết định storage bền vững nếu deploy serverless/production nhiều instance.
- Chất lượng bài tương tự/luyện thêm phụ thuộc AI text provider và chưa có phân tích topic/difficulty riêng từ hồ sơ học sinh; nếu AI không tạo được JSON hợp lệ, hệ thống hiển thị empty state thay vì sinh bài giả.
- Chưa triển khai anti-abuse/rate-limit riêng cho OCR/similar-problems hoặc phân tích OCR confidence.

## 13. P5 kiểm thử/smoke validation nhẹ

Ngày ghi nhận: 2026-05-06

Đã bổ sung kiểm thử nhẹ cho các flow chính vừa nối API thật, ưu tiên không cần MongoDB/OpenAI thật và không gọi network ngoài:

- Frontend thêm `packages/frontend/src/lib/api.test.ts` dùng `node:test` + mock `fetch` để smoke validate path/method/payload cho assessment (`/api/assessments/*`), curriculum/lesson (`/api/curriculum`, `/api/lessons/*`), parent (`/api/parent/*`) và solver image upload (`/api/solver/parse-image`). Test solver xác nhận helper dùng `FormData` và không tự set `Content-Type: application/json` cho multipart upload.
- Backend thêm `packages/backend/src/middleware/upload.test.ts` kiểm tra allow-list extension ảnh cho middleware upload solver/avatar là explicit, case-insensitive và từ chối file không phải ảnh/SVG.
- Backend `packages/backend/src/middleware/upload.ts` tách `ALLOWED_IMAGE_EXTENSIONS` và `isAllowedImageExtension()` để logic lọc file có thể kiểm thử độc lập, không cần khởi tạo Express route, MongoDB hoặc AI provider.

Giới hạn coverage còn thiếu:

- Chưa có e2e/staging test đăng ký → assessment → curriculum → lesson quiz → parent dashboard với MongoDB thật và dữ liệu seed ổn định.
- Chưa có integration test multipart thực tế qua Express cho `POST /api/solver/parse-image`; hiện mới smoke validate helper frontend và logic allow-list backend.
- Chưa kiểm thử OCR thật với provider/model vision; cần staging có cấu hình `OPENAI_API_KEY`/model vision nếu muốn xác nhận chất lượng OCR.
- Chưa kiểm thử production notification delivery/scheduler cho phụ huynh vì hiện subtask chỉ validate endpoint helper và flow in-app hiện có.

## 14. P0 production safety: demo auth và forgot password

Ngày ghi nhận: 2026-05-06

Đã xử lý nhóm rủi ro production safety P0 trong phạm vi demo auth/account và forgot-password:

- Frontend login tại `packages/frontend/src/app/(auth)/login/page.tsx` vẫn giữ khả năng điền nhanh tài khoản demo cho local/dev, nhưng phần UI demo accounts chỉ render khi `NODE_ENV=development` hoặc khi cấu hình công khai `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true`. Mặc định env example để `false`, tránh lộ demo accounts ở production ngoài ý muốn.
- Backend auth middleware tại `packages/backend/src/middleware/auth.ts` vẫn xác thực JWT thật như trước, nhưng các Bearer token demo (`demo-token-admin`, `demo-token-teacher`, `demo-token-student`, `demo-token-parent`) chỉ được chấp nhận khi `ENABLE_DEMO_AUTH_TOKENS=true` và `NODE_ENV` không phải `production`. Khi production, token demo luôn bị từ chối dù flag bị bật nhầm.
- Forgot-password tại `packages/frontend/src/app/(auth)/forgot-password/page.tsx` không còn giả lập đã gửi email. Vì backend hiện chưa có nền email/reset-token production trong `packages/backend/src/routes/auth.routes.ts`, trang hiển thị rõ chức năng chưa hỗ trợ trong bản hiện tại và hướng người dùng liên hệ quản trị viên.
- Env examples đã bổ sung/chú thích flag demo ở `packages/frontend/.env.example`, `packages/backend/.env.example` và `.env.example`.
- Bổ sung test nhẹ cho gate demo auth: `packages/frontend/src/lib/demo-auth.test.ts` kiểm tra điều kiện hiển thị demo login UI, `packages/backend/src/middleware/auth.test.ts` kiểm tra demo token bị chặn khi thiếu flag hoặc ở production.

Giới hạn còn lại:

- Chưa triển khai API reset password production vì cần thiết kế token lưu trữ, expiry, email provider, rate-limit/audit và template gửi mail thật.
- Nếu cần demo deployment public có demo login UI, phải bật rõ `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true`; nếu cần demo Bearer tokens cho API nội bộ/staging, phải bật rõ `ENABLE_DEMO_AUTH_TOKENS=true` trong môi trường không phải production.

## 15. Seed MongoDB dev/staging tối thiểu

Ngày ghi nhận: 2026-05-06

Đã chuẩn hóa seed MongoDB runtime cho dữ liệu nền demo/dev-staging trong `packages/backend/scripts/seed.ts`:

- Seed dùng Mongoose models/runtime hiện tại, không dùng SQL blueprint và không bật demo Bearer token bypass.
- Script chặn chạy khi `NODE_ENV=production` trừ khi có override chủ đích `SEED_ALLOW_PRODUCTION=true`; seed này chỉ dành local/dev/staging.
- Dữ liệu được tạo theo hướng upsert/skip an toàn theo key cố định, không `deleteMany`, không xóa dữ liệu người dùng thật.
- AI tutors mặc định gồm `thay_minh`, `co_lan`, `thay_duc`, `co_huong`, `thay_hung` để register/chat/cá nhân hóa có dữ liệu ổn định.
- Demo accounts thật trong MongoDB gồm `admin@mathai.vn`, `teacher@mathai.vn`, `student@mathai.vn`, `parent@mathai.vn`, dùng password hash bcrypt thật. Mật khẩu mặc định dev/staging là `MathAI@Demo123`, có thể override bằng `SEED_DEMO_PASSWORD`.
- Demo student `student@mathai.vn` có hồ sơ đầy đủ theo `docs/datta.txt`: ngày sinh, điện thoại, địa chỉ, trường học, khối lớp, học lực tự đánh giá, điểm toán trung bình, chọn cô/thầy, màu yêu thích, sở thích và phân loại ban đầu.
- Seed tạo `StudentThemePreference`, liên kết `ParentChild` giữa `parent@mathai.vn` và hồ sơ demo student.
- Seed tạo curriculum/module/lesson/exercises mẫu lớp 8 về phân thức đại số, kèm progress/mastery/recommendation nền để dashboard/lesson/quiz/parent flow có dữ liệu tối thiểu ngay cả khi chưa cấu hình AI provider.
- Lệnh chạy rõ ràng trong backend: `npm run seed`, `npm run seed:dev` hoặc `npm run seed:staging` từ `packages/backend`, hoặc qua workspace nếu chạy từ root: `npm run seed --workspace=packages/backend`, `npm run seed:dev --workspace=packages/backend`, `npm run seed:staging --workspace=packages/backend`.
- Trước khi chạy seed cần cấu hình `MONGODB_URI` và `DB_NAME` trong `packages/backend/.env` hoặc môi trường tương ứng. Staging có thể override password demo bằng `SEED_DEMO_PASSWORD`; nếu override, team phải cập nhật hướng dẫn nội bộ/UI demo tương ứng và không dùng secret production.
- Demo login UI ở `packages/frontend/src/app/(auth)/login/page.tsx` đã dùng cùng password mặc định `MathAI@Demo123` cho bốn tài khoản seed: `admin@mathai.vn`, `teacher@mathai.vn`, `student@mathai.vn`, `parent@mathai.vn`.
- Demo login chỉ dành local/dev/staging: frontend chỉ hiển thị tự động trong `NODE_ENV=development` hoặc khi bật công khai có chủ đích `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true`; không bật mặc định trong production.

Giới hạn còn lại:

- Chưa chạy seed thật trong audit này nếu môi trường không có MongoDB local/staging sẵn sàng; cần chạy smoke staging riêng để xác nhận end-to-end đăng nhập demo → lesson quiz → parent dashboard.
- Seed không thay thế migration/versioning dữ liệu production; nếu cần seed production có kiểm soát phải thiết kế migration/data backfill riêng.

## 16. Checklist triển khai tiếp

### P0 còn lại

- [ ] Quyết định và ghi vào README/architecture: MongoDB/Mongoose là nguồn sự thật runtime cho giai đoạn hiện tại.
- [ ] Rà soát `packages/backend/.env`, `.env.example` cấp root/deploy để loại bỏ hoặc chú thích các biến SQL cũ nếu gây hiểu nhầm.
- [x] Tạo seed MongoDB tối thiểu cho demo accounts nếu frontend vẫn cần đăng nhập nhanh bằng tài khoản thật trong local/dev.
- [ ] Kiểm thử login/register với MongoDB local hoặc môi trường staging.
- [x] Gate demo accounts frontend theo `NODE_ENV=development` hoặc `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true`, mặc định không hiển thị production.
- [x] Gate demo Bearer tokens backend theo `ENABLE_DEMO_AUTH_TOKENS=true` và luôn chặn khi `NODE_ENV=production`.

### P1 sau P0

- [x] Nối API thật cho assessment đầu vào cơ bản: generate/start/save answers/submit/latest result.
- [x] Nối API thật cho curriculum active/list/detail/generate và cho phép tạo giáo trình cá nhân hóa sau assessment result qua CTA an toàn.
- [x] Nối API thật cho dashboard recent lessons/achievements/progress/mastery/lessons overview với empty states rõ ràng.
- [ ] Quyết định có tự động tạo curriculum ngay sau submit assessment hay tiếp tục giữ CTA để tránh chặn flow khi AI curriculum lỗi/chậm.
- [ ] Quyết định có cần gọi `/api/assessments/classify` ngay sau submit assessment hay gom vào bước curriculum generation.
- [x] Nối API thật cho parent dashboard/children/notifications/preferences.
- [ ] Hoàn thiện forgot-password API production với reset token, expiry, email provider, rate-limit/audit.
- [ ] Đối chiếu chi tiết `database/schema.sql` với Mongoose models để cập nhật hoặc archive SQL blueprint.
- [x] Viết migration/seed MongoDB có kiểm soát cho AI tutors, lessons mẫu, parent-child nếu cần demo end-to-end.

### P2 sau P1

- [x] Nối quiz/kiểm tra cuối buổi 15 phút trên check page với lesson exercises và submit attempt API thật.
- [ ] Quyết định có tự động gọi `/api/lessons/:id/complete` khi quiz đạt ngưỡng hay giữ thao tác hoàn thành riêng.
- [ ] Cập nhật topic mastery/weakness chi tiết từ kết quả từng lesson exercise nếu cần recommendation chính xác hơn.
- [ ] Bổ sung timer server-side/chống gian lận nếu chuyển sang yêu cầu production exam.
- [x] Nối parent dashboard/children/reports/notifications/settings với API thật hiện có và empty states an toàn.
- [ ] Nối parent dashboard/notifications production job ở phase riêng, không thuộc subtask solver image/OCR này.

### P4 solver/chat AI

- [x] Bổ sung solver image upload/OCR bước đầu với fallback confirm-manual an toàn, không phá solver text.
- [ ] Kiểm thử OCR thật với provider/model vision trong staging và bổ sung cấu hình model vision nếu cần tách khỏi model text.
- [ ] Chuyển storage ảnh solver sang object storage bền vững nếu triển khai production/serverless.
- [ ] Bổ sung rate-limit/anti-abuse riêng cho OCR upload nếu mở production.
- [x] Bổ sung bài tương tự/luyện thêm sau solver full solution theo `docs/datta.txt`, dùng AI text provider và fallback empty state an toàn.

### P5 testing/smoke validation

- [x] Bổ sung smoke/unit tests nhẹ cho frontend API helpers assessment/curriculum/lesson quiz/parent/solver image, không gọi DB/AI thật.
- [x] Bổ sung unit test backend cho solver/avatar upload image allow-list, không cần Express server hoặc MongoDB.
- [ ] Bổ sung e2e/staging test với MongoDB seed cho flow register → assessment → curriculum → lesson quiz → parent dashboard.
- [ ] Bổ sung integration test multipart `POST /api/solver/parse-image` với stub service/OCR nếu refactor route cho phép dependency injection an toàn.
- [ ] Bổ sung backend unit test chuyên biệt cho normalize/fallback bài tương tự nếu refactor solver service cho phép dependency injection AI provider an toàn hơn.
