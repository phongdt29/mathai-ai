# Hướng dẫn Sử dụng — MathAI

Hướng dẫn dành cho **người dùng cuối** của nền tảng học Toán MathAI, theo 4 vai trò: Học sinh, Phụ huynh, Giáo viên, Quản trị viên (Admin/Staff).

> Tài liệu kỹ thuật liên quan: [Tổng quan dự án](../TONG-QUAN-DU-AN.md) · [Hướng dẫn viết test](HUONG-DAN-VIET-TEST.md).

---

## 1. Truy cập & Đăng nhập

### Địa chỉ

| Môi trường | Frontend | API |
| --- | --- | --- |
| Local (dev) | http://localhost:3444 | http://localhost:3001/api |

### Đăng nhập

1. Mở trang chủ → bấm **Đăng nhập** (`/login`).
2. Nhập email + mật khẩu → hệ thống tự chuyển đến khu vực tương ứng với vai trò.

### Tài khoản demo (chỉ dev/staging — mật khẩu `MathAI@Demo123`)

| Vai trò | Email | Khu vực sau đăng nhập |
| --- | --- | --- |
| Học sinh | `student@mathai.vn` | `/dashboard` |
| Phụ huynh | `parent@mathai.vn` | `/parent` |
| Giáo viên | `teacher@mathai.vn` | `/teacher` |
| Quản trị | `admin@mathai.vn` | `/admin` |
| Nhân viên | `staff@mathai.vn` | `/admin` (quyền giới hạn) |

> Ở môi trường dev, nút **Demo login** hiện sẵn để đăng nhập nhanh theo vai trò.

### Đăng ký & quên mật khẩu

- **Đăng ký** (`/register`): tạo tài khoản mới (mặc định vai trò học sinh).
- **Quên mật khẩu** (`/forgot-password`): nhập email để nhận link đặt lại. Ở dev, email được in ra console của backend (không gửi thật); ở production gửi qua email provider thật.

---

## 2. Hướng dẫn cho Học sinh (`/dashboard`)

Khu vực học tập chính. Menu gồm các mục:

| Mục | Đường dẫn | Dùng để |
| --- | --- | --- |
| **Tổng quan** | `/dashboard` | Xem nhanh tiến độ, gợi ý hôm nay, điểm thưởng |
| **Kiểm tra đầu vào** | `/dashboard/assessment` | Làm bài đánh giá năng lực do AI tạo |
| **Giáo trình** | `/dashboard/curriculum` | Xem lộ trình học cá nhân hóa |
| **Bài học** | `/dashboard/lessons` | Danh sách bài học; vào học lý thuyết + bài tập + quiz |
| **Bài tập được giao** | `/dashboard/assignments` | Làm và nộp bài tập giáo viên giao (đính kèm ảnh nếu cần) |
| **Giải toán (AI Solver)** | `/dashboard/solver` | Nhập/chụp đề → AI giải từng bước kèm giải thích |
| **Trò chuyện (AI Tutor)** | `/dashboard/chat` | Hỏi đáp với gia sư AI 24/7 |
| **Tiến độ** | `/dashboard/progress` | Theo dõi quá trình học theo thời gian |
| **Điểm thưởng** | `/dashboard/points` | Lịch sử điểm, huy hiệu, streak (chuỗi ngày học) |
| **Thanh toán** | `/dashboard/billing` | Xem gói, nâng cấp, hóa đơn |
| **Cài đặt** | `/dashboard/settings` | Hồ sơ cá nhân, theme giao diện |

### Luồng học tiêu biểu

1. Làm **Kiểm tra đầu vào** → AI đánh giá năng lực.
2. Hệ thống tạo **Giáo trình** cá nhân hóa.
3. Vào **Bài học** học lý thuyết → luyện bài tập → làm **quiz cuối buổi**.
4. Xem **Gợi ý hôm nay** ở trang Tổng quan để biết nên học gì tiếp.
5. Dùng **AI Solver** khi gặp bài khó, **AI Tutor** khi cần hỏi thêm.
6. Theo dõi **Tiến độ** và tích lũy **Điểm thưởng / huy hiệu**.

> Tính năng AI (Solver, Tutor, sinh đề/giáo trình) cần cấu hình `OPENAI_API_KEY` ở backend. Nếu chưa có key, các chức năng này trả nội dung dự phòng (fallback).

---

## 3. Hướng dẫn cho Phụ huynh (`/parent`)

Theo dõi việc học của con.

| Mục | Đường dẫn | Dùng để |
| --- | --- | --- |
| **Tổng quan** | `/parent` | Tóm tắt hoạt động học của (các) con |
| **Con của tôi** | `/parent/children` | Danh sách con; bấm vào từng con để xem chi tiết tiến độ |
| **Báo cáo** | `/parent/reports` | Báo cáo học tập theo tuần (chọn khoảng 7/14/30 ngày) |
| **Thông báo** | `/parent/notifications` | Nhận cảnh báo, nhắc nhở về việc học của con |
| **Cài đặt** | `/parent/settings` | Tùy chọn nhận thông báo (email/SMS/push) |

> Liên kết phụ huynh–học sinh được thiết lập sẵn khi seed (demo) hoặc do admin/giáo viên cấu hình. Báo cáo tuần cũng được gửi tự động qua job định kỳ.

---

## 4. Hướng dẫn cho Giáo viên (`/teacher`)

Quản lý lớp, nội dung và chấm điểm.

| Mục | Đường dẫn | Dùng để |
| --- | --- | --- |
| **Tổng quan** | `/teacher` | Bảng điều khiển lớp học |
| **Lớp học** | `/teacher/classes` | Danh sách lớp; bấm vào lớp để xem học sinh |
| **Học sinh** | `/teacher/students` | Danh sách học sinh phụ trách |
| **Sổ điểm** | `/teacher/gradebook` | Xem/chấm điểm theo học sinh (kèm rubric) |
| **Bài tập** | `/teacher/assignments` | Tạo và quản lý bài tập giao cho học sinh |
| **Thư viện nội dung** | `/teacher/content-library` | Quản lý giáo trình / bài học / bài tập mẫu của mình |
| **Phân tích** | `/teacher/analytics` | Thống kê tương tác, kết quả của lớp |
| **Đề xuất** | `/teacher/proposals` | Gửi đề xuất nội dung chờ duyệt |
| **Cài đặt** | `/teacher/settings` | Hồ sơ giáo viên |

### Tạo & giao bài tập

1. Vào **Thư viện nội dung** → tạo *Lesson template* / *Assignment* (hoặc dùng mẫu có sẵn).
2. Vào **Bài tập** → giao cho lớp/học sinh, đặt hạn nộp.
3. Học sinh nộp bài (có thể đính kèm ảnh) → vào **Sổ điểm** chấm theo rubric.
4. Theo dõi kết quả ở **Phân tích**.

> Nội dung mới có thể cần **duyệt** (approval) trước khi xuất bản, tùy quy trình. Bài học đã *published* không chỉnh sửa trực tiếp được — phải tạo bản cập nhật.

---

## 5. Hướng dẫn cho Quản trị viên (`/admin`)

Quản trị toàn hệ thống. Các nhóm chức năng chính:

### Người dùng & tổ chức
| Mục | Đường dẫn |
| --- | --- |
| Người dùng | `/admin/users` |
| Giáo viên | `/admin/teachers` |
| Học sinh | `/admin/students` |
| Lớp học | `/admin/classes` |
| Gia sư AI | `/admin/tutors` |

### Nội dung
| Mục | Đường dẫn |
| --- | --- |
| Nội dung | `/admin/content` |
| Thư viện nội dung | `/admin/content-library` |
| Bài tập | `/admin/assignments` |
| Đề xuất chờ duyệt | `/admin/proposals` |

### AI & Kiểm soát
| Mục | Đường dẫn | Dùng để |
| --- | --- | --- |
| AI Governance | `/admin/ai-governance` | Chính sách & minh bạch AI |
| AI Logs | `/admin/ai-logs` | Nhật ký các lần gọi AI |
| AI Providers | `/admin/ai-providers` | Cấu hình nhà cung cấp AI & fallback |
| Soát rủi ro | `/admin/risk-review` | Duyệt tín hiệu gian lận/bất thường |
| Nhật ký kiểm toán | `/admin/audit` | Audit log mọi hành động nhạy cảm |
| Hoạt động | `/admin/activity` | Theo dõi hoạt động hệ thống |

### Vận hành & Kinh doanh
| Mục | Đường dẫn | Dùng để |
| --- | --- | --- |
| Phân tích | `/admin/analytics` | DAU, doanh thu, cohort retention, engagement |
| Thanh toán | `/admin/billing` | Gói, hóa đơn, giao dịch |
| Thông báo | `/admin/notifications/templates` · `/deliveries` | Mẫu thông báo & nhật ký gửi |
| Lịch/Cron | `/admin/scheduler` | Theo dõi các job định kỳ |
| Báo cáo | `/admin/reports` | Xuất báo cáo |
| Cài đặt | `/admin/settings` | Cấu hình hệ thống |

> **Nhân viên (Staff)** dùng chung khu vực `/admin` nhưng quyền bị giới hạn theo phân quyền phạm vi (scoped authorization).

---

## 6. Tính năng AI — lưu ý sử dụng

| Tính năng | Yêu cầu | Khi chưa cấu hình AI |
| --- | --- | --- |
| AI Solver, AI Tutor, sinh đề, sinh giáo trình | `OPENAI_API_KEY` ở backend | Trả nội dung dự phòng (fallback), không lỗi |

Mọi lần gọi AI đều được ghi log (xem `/admin/ai-logs`), che dữ liệu nhạy cảm, và đi qua lớp kiểm soát an toàn (safety guard) + chống gian lận.

---

## 7. Thanh toán & Gói dịch vụ

- Học sinh xem/nâng cấp gói tại `/dashboard/billing`; thanh toán qua **VNPAY / MoMo / SePay** (chuyển khoản QR).
- Sau khi thanh toán, hệ thống cấp quyền (entitlement) tương ứng với gói.
- Admin quản lý gói, hóa đơn, giao dịch tại `/admin/billing`.

> Ở môi trường dev, cổng thanh toán dùng sandbox và để trống khi chưa cấu hình credentials — chức năng billing có thể bị giới hạn.

---

## 8. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| Đăng nhập/đăng ký báo lỗi gọi API | Backend chưa chạy hoặc `NEXT_PUBLIC_API_URL` sai. Kiểm tra backend tại http://localhost:3001/health |
| Không thấy nút Demo login | Chỉ hiện ở dev hoặc khi bật `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true` |
| AI Solver/Tutor trả nội dung chung chung | Chưa cấu hình `OPENAI_API_KEY` → đang dùng fallback |
| Email đặt lại mật khẩu không tới | Ở dev `EMAIL_PROVIDER=console` → xem nội dung in trong terminal backend |
| Thanh toán không hoàn tất | Cổng thanh toán chưa cấu hình credentials sandbox/production |
| Trang báo "không tải được dữ liệu" | Mất kết nối API hoặc chưa đăng nhập đúng vai trò; thử đăng nhập lại |

---

## 9. Bảo mật cho người dùng

- Không chia sẻ tài khoản; mật khẩu demo chỉ dùng cho môi trường thử nghiệm.
- Phiên đăng nhập dùng JWT có thời hạn; đăng xuất khi dùng máy chung.
- Dữ liệu nhạy cảm được che khi ghi log; mọi hành động quản trị đều được ghi audit.
