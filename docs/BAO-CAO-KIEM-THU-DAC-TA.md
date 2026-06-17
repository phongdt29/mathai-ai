# Báo cáo Kiểm thử đối chiếu Đặc tả — MathAI

Đối chiếu **các rule nghiệp vụ xác định** trong `Đặc tả chức năng & Logic.xlsx` (3 sheet: Task, Các Module, Logic) với implementation thực tế trong `packages/backend/src`, kèm test case kiểm chứng.

- Ngày: 2026-06-11
- Toàn bộ backend: **676/676 pass** · frontend: **140/140 pass** · eslint 0 lỗi · backend+frontend build OK.

> Phương pháp: với rule là **hàm thuần** → viết unit test trực tiếp (đã thêm). Với rule nằm sau tầng DB (service dùng Mongoose, không DI) → đối chiếu bằng đọc code, ghi nhận khớp/lệch.

> **Cập nhật triển khai (đóng gap theo đặc tả 11 module):** xem mục §5 ở cuối.

---

## 1. Bảng đối chiếu tổng hợp

| # | Rule đặc tả | Vị trí code | Kết quả | Ghi chú |
| --- | --- | --- | --- | --- |
| 1 | **Phân loại học lực**: ≤5 TB, ≤8 khá, >8 giỏi | `classification.service.ts` `classifyByScore()` | ✅ Khớp (mở rộng) | Impl thêm bậc **"yeu" ≤3.5** — đúng khuyến nghị "không chỉ 3 nhãn" trong chính đặc tả |
| 2 | **Cấu trúc buổi học**: 20% ôn / 60% mới / 20% củng cố | `recommendation.service.ts` `DEFAULT_RATIOS` | ✅ Khớp tuyệt đối | 0.2 / 0.6 / 0.2 |
| 3 | **Gợi ý theo quiz**: ≥8 bài mới; 5–<8 +30% ôn; <5 ôn trước | `recommendation.service.ts` `computeAdaptiveSessionRatios()` | ✅ **Đã fix** | Ngưỡng đổi `<70%`→`<80%` khớp band đặc tả; bổ sung tín hiệu lỗi sai lặp lại. Tách hàm thuần + 13 test. Xem §2 |
| 4 | **Điểm danh 3 trạng thái** Present/Partial/Absent, ngưỡng active ≥70% + có quiz | `attendance.service.ts` `determineStatus()` | ✅ Khớp | `PRESENT_FOCUS_THRESHOLD=0.70`, cần `quizCompleted` cho Present; Absent khi active < 120s |
| 5 | **Thời gian học thật** = tổng thời gian tương tác hợp lệ (idle > ngưỡng bị loại) | `engagement.service.ts` `computeSessionMetrics()` | ⚠️ **Lệch đơn vị** | Logic đúng (loại gap > 120s) nhưng trả **giây**, đặc tả nói **phút** |
| 6 | **Learning Risk Score** = 0.30·vắng + 0.20·dở dang + 0.20·ít tương tác + 0.15·quiz giảm + 0.15·bỏ gợi ý; band 0–30/31–60/61–100 | `risk.service.ts` `computeRiskScore()` | ✅ Khớp tuyệt đối | Trọng số & band y hệt đặc tả |
| 7 | **Reward points / độ khó**: dễ→TB→khó | `utils/scoring.ts` | ✅ Khớp (đã có test) | easy=1, medium=1.15, hard=1.3 (+challenge=1.5) |
| 8 | **Đề kiểm tra đầu vào**: 5–10 câu | `assessment.service.ts` `generateDiagnostic()` | ✅ Khớp | `min(max(n,5),10)`, mặc định 8 |

**Tổng kết:** 6/8 rule khớp đặc tả (có rule còn mở rộng tốt hơn); 2 điểm lệch nhỏ (#3 ngưỡng, #5 đơn vị) — không phải lỗi crash, là khác biệt thiết kế cần biết.

---

## 2. Chi tiết 2 điểm lệch

### ✅ #3 — Ngưỡng gợi ý buổi học (ĐÃ FIX 70% → 80%)

- **Đặc tả (Logic §4):** quiz `5 ≤ điểm < 8` (tức 50%–<80%) → buổi sau "bài mới nhưng có **30% ôn lại**".
- **Trước fix:** chỉ tăng tỉ lệ ôn/củng cố khi `last_quiz_score < 70%`. Học sinh **70–80% (điểm 7–8)** không được điều chỉnh — bị xử như nhóm điểm cao.
- **Đã tối ưu** ([recommendation.service.ts](../packages/backend/src/services/recommendation.service.ts)):
  1. Tách logic tỉ lệ buổi học thành hàm thuần exported `computeAdaptiveSessionRatios()` (unit-test trực tiếp, không cần DB).
  2. Đổi breakpoint band giữa `< 70%` → `< 80%` cho khớp band 5–<8 của đặc tả.
  3. Bổ sung tín hiệu **`recurring_error_topics`** (lỗi sai lặp lại) làm tăng phần củng cố — đúng yêu cầu đặc tả "chấm theo nhiều tín hiệu / củng cố lỗi sai gần đây".
- **Kiểm chứng:** [recommendation-session-ratios.spec.test.ts](../packages/backend/src/services/recommendation-session-ratios.spec.test.ts) — 13 ca pass, gồm ca chứng minh quiz 75% nay nhận `reinforce_ratio = 0.3` (trước = 0.2).

### ⚠️ #5 — Đơn vị thời gian học (giây vs phút)

- **Đặc tả:** "effective study time = ... 31 **phút**".
- **Implementation:** `computeSessionMetrics()` trả `activeDuration` tính bằng **giây**.
- **Ảnh hưởng:** chỉ là quy ước đơn vị; cần thống nhất khi hiển thị UI / hợp đồng API để không hiểu nhầm (×60).

---

## 3. Test case đã thêm

[classification.service.spec.test.ts](../packages/backend/src/services/classification.service.spec.test.ts) — 9 ca, phủ:
- 3 bậc của đặc tả (≤5 / ≤8 / >8) cho điểm > 3.5
- Bậc mở rộng "yeu" (≤3.5)
- **Biên** (3.5, 5, 8 và ±0.01) — chống lỗi lệch 1 đơn vị
- Metadata trả về (`source`, echo điểm)
- Ca biên giá trị (0, 10)

Chạy lẻ:
```bash
cd packages/backend
node --import tsx --test src/services/classification.service.spec.test.ts
```

---

## 4. Vì sao chưa viết unit test cho #4, #5, #6

Các service `attendance` / `engagement` / `risk` khởi tạo repository Mongoose **trong constructor** (không dependency-injection) và logic nằm ở **method private**, nên không unit-test thuần được nếu không kết nối DB hoặc refactor. Đã đối chiếu khớp đặc tả bằng đọc code (xem bảng §1).

**Khuyến nghị để test được sâu hơn** (việc tương lai):
1. Tách `determineStatus` (attendance) và công thức risk-score thành **hàm thuần exported** → unit test trực tiếp theo đặc tả (giống `classifyByScore`).
2. Hoặc cho service nhận **dependency injection** (giống `gamification.service` / `point.service`) để inject mock repo.

Sau khi tách, có thể bổ sung test:
- Risk: kiểm chứng trọng số & band (vd input rates → score 0–30/31–60/61–100).
- Attendance: Present cần focus ≥0.7 **và** quiz xong; Partial khi 1 trong 2 thiếu; Absent khi active < 120s.
- Recommendation: cấu trúc 20/60/20 và dịch chuyển theo quiz.

---

## 5. Triển khai đóng gap theo đặc tả 11 module (P1–P3)

Đã code bổ sung để khớp đặc tả, mỗi mục kèm unit test (hàm thuần) — backend 676 pass.

### Phase 1 — Xương sống luồng học
- **M10**: `submitAttempt` tự tạo giáo trình sau phân loại (idempotent, fail-soft, cờ `curriculum_generated`); trang kết quả có nút "Xem giáo trình". → [assessment.service.ts](../packages/backend/src/services/assessment.service.ts)
- **M3**: `CurriculumModule.stage` + `mapModulesToStages()` (4 giai đoạn, module cuối luôn "luyện đề"); badge giai đoạn trên trang curriculum. → [curriculum-stages.ts](../packages/backend/src/utils/curriculum-stages.ts)
- **M5**: `decidePostQuizAction()` (≥70% học tiếp / <70% ôn lại) + `next_action` trong kết quả quiz + CTA. → [post-quiz-decision.ts](../packages/backend/src/utils/post-quiz-decision.ts)
- **M2**: `classifySpeed()` + `computeComprehensionLevel()` → field `speed`/`comprehension_level` + hiển thị. → [diagnostic-insights.ts](../packages/backend/src/utils/diagnostic-insights.ts)

### Phase 2 — Module 9 Thông báo
- Bộ rule cảnh báo thuần (no-show 15', login-no-study, sắp quên, vắng liên tiếp, quiz giảm). → [notification-rules.ts](../packages/backend/src/utils/notification-rules.ts)
- Job `student.forgetting_alert` (đăng ký worker, fail-soft) + 3 template seed mới (nhắc học/sắp quên/nhắc lịch phụ huynh). → [learning-reminder.jobs.ts](../packages/backend/src/jobs/learning-reminder.jobs.ts)
- Web-push provider thật (console|web-push qua env + VAPID) — đã có sẵn, bổ sung test.

### Phase 3 — Personalization / Solver / hoàn thiện
- **M8**: `rankLessonsByInterest()` + `topWeakTopics()` + card top-3 điểm yếu trên dashboard. → [personalization-ranking.ts](../packages/backend/src/utils/personalization-ranking.ts)
- **M7**: `chooseWeakPracticeTopic()` (bài tương tự theo điểm yếu); OCR cho sửa text thủ công (sẵn có).
- **M1**: `pickTutorByGender()` — auto-gán tutor theo giới tính khi đăng ký. → [tutor-matching.ts](../packages/backend/src/utils/tutor-matching.ts)
- **M2/M5**: `gradeEssayAnswer()` chấm tự luận AI + fallback "chờ chấm". → [essay-grading.ts](../packages/backend/src/utils/essay-grading.ts)

### Ghi chú phụ thuộc ngoài (chưa bật trong dev)
- Web-push production cần VAPID keys; FCM cần credentials; ở dev dùng console.
- Chấm tự luận AI và một số job thông báo cần `OPENAI_API_KEY` / dữ liệu lịch học thật để chạy đầy đủ — logic quyết định đã có test, phần tích hợp DB cần chạy e2e với dữ liệu seed để xác minh cuối.
