# BÁO CÁO CHI TIẾT DỰ ÁN WEB HỌC TOÁN ONLINE SỬ DỤNG A.I (MathAI)

---

# 1. TỔNG QUAN DỰ ÁN

## 1.1. Mục tiêu
Dự án MathAI là nền tảng học toán online sử dụng trí tuệ nhân tạo (A.I) nhằm:

- Cá nhân hóa lộ trình học cho từng học sinh
- Tự động tạo đề kiểm tra đầu vào
- Tự động xây dựng giáo trình phù hợp năng lực
- Hỗ trợ giải bài toán từng bước
- Theo dõi tiến độ học tập theo thời gian thực

## 1.2. Đối tượng người dùng
- Học sinh từ lớp 1 – lớp 12
- Phụ huynh theo dõi tiến độ học
- (mở rộng) giáo viên và admin

## 1.3. Giá trị cốt lõi
- Cá nhân hóa 100% bằng AI
- Tự động hóa giáo trình
- Học theo năng lực thực
- Phản hồi tức thì

---

# 2. KIẾN TRÚC HỆ THỐNG

## 2.1. Tổng thể
Hệ thống gồm 3 lớp chính:

1. Frontend (Web UI)
2. Backend (API server)
3. Database (PostgreSQL)
4. OpenAI API (AI Engine)

## 2.2. Flow tổng thể

1. User đăng ký → lưu DB
2. Backend gọi OpenAI phân tích hồ sơ
3. Sinh bài kiểm tra đầu vào
4. Sinh giáo trình cá nhân hóa
5. User học → làm bài → lưu kết quả
6. Dashboard cập nhật tiến độ

---

# 3. LOGIC NGHIỆP VỤ CHÍNH

## 3.1. Logic đăng ký học sinh

### Input bắt buộc:
- Họ và tên
- Địa chỉ
- Ngày sinh
- Email
- Số điện thoại
- Học lực
- Trường học
- Khối lớp
- Chọn học thầy/cô
- Màu sắc yêu thích
- Sở thích

### Xử lý:
- Lưu vào bảng users + student_profiles
- Tính học lực ban đầu theo rule:
  - <=5 → trung bình
  - <=8 → khá
  - >8 → giỏi

---

## 3.2. Logic kiểm tra đầu vào

### Input:
- Khối lớp
- Học lực
- Điểm trung bình toán

### Xử lý:
- Gọi OpenAI API
- Sinh đề gồm:
  - 8 câu
  - Trắc nghiệm + tự luận

### Output:
- Lưu vào bảng assessments
- Lưu câu hỏi vào assessment_questions

---

## 3.3. Logic phân tích năng lực

Sau khi học sinh làm bài:

- Tính điểm
- Phân loại lại học lực
- Xác định:
  - Chủ đề mạnh
  - Chủ đề yếu

---

## 3.4. Logic tạo giáo trình AI

### Input:
- Học lực sau đánh giá
- Điểm mạnh / yếu
- Khối lớp

### Xử lý:
- Gọi OpenAI API
- Sinh giáo trình gồm:
  - Modules
  - Lessons
  - Bài tập
  - Quiz cuối buổi

### Output:
- Lưu vào:
  - curricula
  - curriculum_modules
  - lessons
  - lesson_exercises

---

## 3.5. Logic học tập & tiến độ

### Mỗi buổi học:
- Học lý thuyết
- Làm bài tập
- Làm quiz 15 phút

### Sau buổi học:
- Chấm điểm
- Lưu lesson_quiz_results
- Cập nhật tiến độ

---

## 3.6. Logic gợi ý bài học hôm nay

Input:
- Bài học trước
- Điểm quiz
- Chủ đề yếu

Output:
- Lesson tiếp theo
- Có cần ôn lại hay không

---

## 3.7. Logic AI Solver

Input:
- Bài toán

Output:
- Các bước giải
- Đáp án
- Giải thích
- Lỗi sai thường gặp

---

# 4. THIẾT KẾ CƠ SỞ DỮ LIỆU

## 4.1. Bảng users

| Field | Type | Mô tả |
|------|------|------|
| id | BIGSERIAL | PK |
| email | VARCHAR | unique |
| phone | VARCHAR | |
| password_hash | TEXT | |
| role | VARCHAR | |

---

## 4.2. Bảng student_profiles

| Field | Type | Mô tả |
|------|------|------|
| id | BIGSERIAL | PK |
| user_id | FK | |
| full_name | VARCHAR | |
| date_of_birth | DATE | |
| address | TEXT | |
| grade_level | INT | |
| math_avg_score | NUMERIC | |
| preferred_teacher_gender | VARCHAR | |

---

## 4.3. Bảng assessments

| Field | Type | Mô tả |
|------|------|------|
| id | PK | |
| student_id | FK | |
| type | VARCHAR | diagnostic |
| total_questions | INT | |

---

## 4.4. Bảng assessment_questions

- Lưu nội dung câu hỏi
- JSON cho lời giải

---

## 4.5. Bảng curricula

| Field | Type |
|------|------|
| id | PK |
| student_id | FK |
| title | VARCHAR |
| ai_summary | TEXT |

---

## 4.6. Bảng lessons

- Lưu từng bài học
- Liên kết curriculum

---

## 4.7. Bảng lesson_exercises

- Bài tập trong lesson

---

## 4.8. Bảng solver_requests

- Lưu lịch sử giải bài

---

# 5. OPENAI PROMPT DESIGN

## 5.1. Prompt tạo đề kiểm tra

- Role: giáo viên toán
- Input: grade, level
- Output: JSON questions

## 5.2. Prompt tạo giáo trình

- Role: chuyên gia giáo dục
- Output:
  - modules
  - lessons
  - exercises

## 5.3. Prompt giải bài

- Role: tutor
- Output:
  - steps
  - explanation

---

# 6. LUỒNG NGƯỜI DÙNG (UX FLOW)

1. Đăng ký
2. Làm test đầu vào
3. Nhận giáo trình
4. Học từng ngày
5. Xem dashboard
6. Hỏi AI

---

# 7. MÔ TẢ CHI TIẾT CÁC TÍNH NĂNG HỆ THỐNG

## 7.1. Tính năng đăng ký & hồ sơ học sinh

### Mô tả:
Cho phép học sinh tạo tài khoản và cung cấp đầy đủ thông tin cá nhân để hệ thống cá nhân hóa trải nghiệm học.

### Input:
- Họ và tên
- Ngày sinh
- Địa chỉ
- Email
- Số điện thoại
- Trường học
- Khối lớp
- Học lực
- Điểm trung bình môn toán
- Chọn học với thầy/cô
- Màu sắc yêu thích
- Sở thích

### Output:
- Hồ sơ học sinh trong hệ thống
- Theme giao diện cá nhân hóa

### Giá trị:
- Là nền tảng để AI phân tích và cá nhân hóa toàn bộ hệ thống

---

## 7.2. Tính năng kiểm tra đầu vào (Diagnostic Test)

### Mô tả:
A.I tự động tạo bài kiểm tra phù hợp với trình độ học sinh.

### Đặc điểm:
- Tạo đề động (dynamic)
- Phù hợp khối lớp
- Phù hợp học lực

### Output:
- Điểm số
- Phân loại năng lực
- Phân tích điểm mạnh/yếu

### Giá trị:
- Xác định chính xác trình độ thực tế

---

## 7.3. Tính năng tạo giáo trình cá nhân hóa

### Mô tả:
A.I tạo lộ trình học riêng cho từng học sinh.

### Thành phần:
- Modules
- Lessons
- Bài tập thực hành
- Quiz cuối buổi

### Logic:
- Dựa vào học lực + điểm yếu
- Điều chỉnh độ khó theo tiến độ

### Giá trị:
- Học đúng trọng tâm
- Không học lan man

---

## 7.4. Tính năng học bài & luyện tập

### Mô tả:
Học sinh học theo từng lesson.

### Flow:
1. Học lý thuyết
2. Làm bài tập
3. Làm quiz cuối buổi

### Giá trị:
- Học theo cấu trúc chuẩn
- Có kiểm tra liên tục

---

## 7.5. Tính năng quiz cuối buổi (15 phút)

### Mô tả:
Kiểm tra nhanh sau mỗi buổi học.

### Output:
- Điểm số
- Feedback AI

### Giá trị:
- Đánh giá ngay hiệu quả học

---

## 7.6. Tính năng dashboard tiến độ

### Mô tả:
Hiển thị toàn bộ tiến trình học của học sinh.

### Thành phần:
- % hoàn thành
- Số bài đã học
- Điểm trung bình
- Dự đoán tiến bộ

### Giá trị:
- Tăng động lực học
- Giúp phụ huynh theo dõi

---

## 7.7. Tính năng gợi ý bài học hôm nay

### Mô tả:
A.I đề xuất bài học phù hợp nhất mỗi ngày.

### Input:
- Kết quả gần nhất
- Chủ đề yếu

### Output:
- Lesson nên học
- Có cần ôn lại không

### Giá trị:
- Không cần suy nghĩ học gì

---

## 7.8. Tính năng AI Solver (giải bài)

### Mô tả:
Cho phép học sinh nhập bài toán và nhận lời giải chi tiết.

### Output:
- Các bước giải
- Giải thích
- Đáp án
- Lỗi sai thường gặp

### Giá trị:
- Học cách tư duy
- Không chỉ biết đáp án

---

## 7.9. Tính năng chat với thầy/cô ảo

### Mô tả:
Chat realtime với AI tutor.

### Đặc điểm:
- Cá nhân hóa theo học lực
- Có thể hỏi bất kỳ câu hỏi

### Giá trị:
- Như có gia sư riêng 24/7

---

## 7.10. Tính năng cá nhân hóa giao diện

### Mô tả:
UI thay đổi theo sở thích học sinh.

### Input:
- Màu sắc yêu thích
- Sở thích

### Output:
- Theme riêng

### Giá trị:
- Tăng engagement

---

# 8. MỞ RỘNG TRONG TƯƠNG LAI

- Chat realtime với AI tutor
- OCR ảnh bài toán
- Gamification
- Mobile app
- Thanh toán subscription

---

# KẾT LUẬN

Dự án MathAI là hệ thống EdTech sử dụng AI để cá nhân hóa việc học toán. Hệ thống tập trung vào 3 yếu tố:

- Cá nhân hóa
- Tự động hóa
- Phân tích dữ liệu học tập

=> Có tiềm năng mở rộng lớn và thương mại hóa cao.

