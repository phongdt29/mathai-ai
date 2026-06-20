/**
 * Seed 30 nội dung học (LessonTemplate) môn Toán lớp 8 vào content library.
 *
 * Chạy:
 *   npm run seed:grade8 --workspace=packages/backend
 *
 * - Idempotent: upsert theo (lesson_title, created_by) nên chạy lại không nhân đôi.
 * - created_by lấy từ user teacher@mathai.vn (hoặc admin/teacher bất kỳ). Nếu chưa có
 *   user nào, hãy chạy `npm run seed` trước để tạo demo users.
 * - Tất cả ở trạng thái 'published' để hiện ngay trong thư viện nội dung.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import '../src/models/user.model';
import '../src/models/content-library.model';

import { LessonTemplateModel, ExerciseTemplateModel } from '../src/models/content-library.model';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'mathai';

type Difficulty = 'easy' | 'medium' | 'hard';

interface Grade8Lesson {
  title: string;
  topic: string;
  difficulty: Difficulty;
  minutes: number;
  objective: string;
  theory: string;
}

const GRADE = 8;
const AGE_GROUP = '13-14';

const LESSONS: Grade8Lesson[] = [
  // ===== ĐẠI SỐ — Nhân, chia đa thức =====
  {
    title: 'Nhân đơn thức với đa thức',
    topic: 'Nhân và chia đa thức',
    difficulty: 'easy',
    minutes: 30,
    objective: 'Nhân được đơn thức với đa thức bằng quy tắc phân phối.',
    theory:
      'Muốn nhân một đơn thức với một đa thức, ta nhân đơn thức đó với từng hạng tử của đa thức rồi cộng các tích lại: A·(B + C) = A·B + A·C. Ví dụ: 2x·(3x − 5) = 6x² − 10x.',
  },
  {
    title: 'Nhân đa thức với đa thức',
    topic: 'Nhân và chia đa thức',
    difficulty: 'easy',
    minutes: 35,
    objective: 'Nhân được hai đa thức và thu gọn kết quả.',
    theory:
      'Muốn nhân hai đa thức, ta nhân mỗi hạng tử của đa thức này với từng hạng tử của đa thức kia rồi cộng các tích lại và thu gọn. Ví dụ: (x + 2)(x − 3) = x² − 3x + 2x − 6 = x² − x − 6.',
  },
  {
    title: 'Hằng đẳng thức: Bình phương của một tổng, một hiệu',
    topic: 'Hằng đẳng thức đáng nhớ',
    difficulty: 'medium',
    minutes: 35,
    objective: 'Nhận dạng và áp dụng (a±b)² để khai triển và tính nhanh.',
    theory:
      '(a + b)² = a² + 2ab + b² và (a − b)² = a² − 2ab + b². Ví dụ: (x + 3)² = x² + 6x + 9; tính nhanh 51² = (50+1)² = 2500 + 100 + 1 = 2601.',
  },
  {
    title: 'Hằng đẳng thức: Hiệu hai bình phương',
    topic: 'Hằng đẳng thức đáng nhớ',
    difficulty: 'easy',
    minutes: 30,
    objective: 'Áp dụng a² − b² = (a − b)(a + b) để khai triển và tính nhanh.',
    theory:
      'a² − b² = (a − b)(a + b). Đây là công cụ tính nhanh và phân tích nhân tử rất hay dùng. Ví dụ: 49 − x² = (7 − x)(7 + x); 103·97 = (100+3)(100−3) = 10000 − 9 = 9991.',
  },
  {
    title: 'Hằng đẳng thức: Lập phương của một tổng, một hiệu',
    topic: 'Hằng đẳng thức đáng nhớ',
    difficulty: 'medium',
    minutes: 35,
    objective: 'Khai triển (a±b)³ thành thạo.',
    theory:
      '(a + b)³ = a³ + 3a²b + 3ab² + b³ và (a − b)³ = a³ − 3a²b + 3ab² − b³. Ví dụ: (x + 1)³ = x³ + 3x² + 3x + 1.',
  },
  {
    title: 'Hằng đẳng thức: Tổng và hiệu hai lập phương',
    topic: 'Hằng đẳng thức đáng nhớ',
    difficulty: 'medium',
    minutes: 35,
    objective: 'Áp dụng công thức tổng/hiệu hai lập phương.',
    theory:
      'a³ + b³ = (a + b)(a² − ab + b²) và a³ − b³ = (a − b)(a² + ab + b²). Ví dụ: x³ − 8 = (x − 2)(x² + 2x + 4).',
  },
  {
    title: 'Phân tích đa thức thành nhân tử: Đặt nhân tử chung',
    topic: 'Phân tích đa thức thành nhân tử',
    difficulty: 'easy',
    minutes: 30,
    objective: 'Tìm và đặt nhân tử chung ra ngoài dấu ngoặc.',
    theory:
      'Khi các hạng tử có chung một nhân tử, ta đặt nhân tử đó ra ngoài: AB + AC = A(B + C). Ví dụ: 6x² − 9x = 3x(2x − 3).',
  },
  {
    title: 'Phân tích đa thức thành nhân tử: Dùng hằng đẳng thức',
    topic: 'Phân tích đa thức thành nhân tử',
    difficulty: 'medium',
    minutes: 35,
    objective: 'Vận dụng hằng đẳng thức để phân tích nhân tử.',
    theory:
      'Nhận dạng các hằng đẳng thức để phân tích nhanh: a² ± 2ab + b² = (a ± b)²; a² − b² = (a−b)(a+b). Ví dụ: x² − 6x + 9 = (x − 3)²; 4x² − 25 = (2x − 5)(2x + 5).',
  },
  {
    title: 'Phân tích đa thức thành nhân tử: Nhóm hạng tử',
    topic: 'Phân tích đa thức thành nhân tử',
    difficulty: 'medium',
    minutes: 35,
    objective: 'Nhóm hợp lý các hạng tử để xuất hiện nhân tử chung.',
    theory:
      'Ta nhóm các hạng tử thích hợp để mỗi nhóm có nhân tử chung, rồi đặt nhân tử chung lần hai. Ví dụ: x² + xy + x + y = x(x + y) + (x + y) = (x + y)(x + 1).',
  },
  {
    title: 'Phân tích đa thức thành nhân tử: Phối hợp nhiều phương pháp',
    topic: 'Phân tích đa thức thành nhân tử',
    difficulty: 'hard',
    minutes: 40,
    objective: 'Kết hợp đặt nhân tử chung, hằng đẳng thức và nhóm hạng tử.',
    theory:
      'Thường ưu tiên đặt nhân tử chung trước, sau đó dùng hằng đẳng thức hoặc nhóm hạng tử. Ví dụ: 2x³ − 8x = 2x(x² − 4) = 2x(x − 2)(x + 2).',
  },
  {
    title: 'Chia đơn thức cho đơn thức',
    topic: 'Nhân và chia đa thức',
    difficulty: 'easy',
    minutes: 30,
    objective: 'Chia đơn thức cho đơn thức khi phép chia thực hiện được.',
    theory:
      'Chia hệ số cho hệ số, chia lũy thừa cùng biến bằng cách trừ số mũ: xᵐ : xⁿ = xᵐ⁻ⁿ (m ≥ n). Ví dụ: 15x⁴ : 3x² = 5x².',
  },
  {
    title: 'Chia đa thức một biến đã sắp xếp',
    topic: 'Nhân và chia đa thức',
    difficulty: 'hard',
    minutes: 40,
    objective: 'Thực hiện phép chia đa thức một biến đã sắp xếp.',
    theory:
      'Sắp xếp đa thức theo lũy thừa giảm dần rồi chia giống chia số: lấy hạng tử bậc cao nhất chia cho nhau, nhân ngược lại và trừ. Ví dụ: (x² − 5x + 6) : (x − 2) = x − 3.',
  },

  // ===== ĐẠI SỐ — Phân thức đại số =====
  {
    title: 'Phân thức đại số và điều kiện xác định',
    topic: 'Phân thức đại số',
    difficulty: 'easy',
    minutes: 30,
    objective: 'Hiểu khái niệm phân thức và tìm điều kiện mẫu khác 0.',
    theory:
      'Phân thức đại số có dạng A/B với A, B là đa thức và B ≠ 0. Điều kiện xác định là tìm giá trị của biến để mẫu khác 0. Ví dụ: phân thức 1/(x − 2) xác định khi x ≠ 2.',
  },
  {
    title: 'Tính chất cơ bản và rút gọn phân thức',
    topic: 'Phân thức đại số',
    difficulty: 'medium',
    minutes: 35,
    objective: 'Rút gọn phân thức bằng cách triệt tiêu nhân tử chung.',
    theory:
      'Tính chất: A/B = (A·M)/(B·M) và A/B = (A:N)/(B:N). Để rút gọn, phân tích tử và mẫu thành nhân tử rồi triệt tiêu nhân tử chung. Ví dụ: (x² − 4)/(x + 2) = (x−2)(x+2)/(x+2) = x − 2 (với x ≠ −2).',
  },
  {
    title: 'Quy đồng mẫu thức nhiều phân thức',
    topic: 'Phân thức đại số',
    difficulty: 'medium',
    minutes: 40,
    objective: 'Tìm mẫu thức chung và quy đồng nhiều phân thức.',
    theory:
      'Phân tích các mẫu thành nhân tử, lấy mẫu thức chung (MTC) gồm các nhân tử với số mũ lớn nhất, rồi nhân cả tử và mẫu mỗi phân thức với nhân tử phụ tương ứng. Ví dụ: MTC của 1/(x) và 1/(x+1) là x(x+1).',
  },
  {
    title: 'Cộng, trừ phân thức đại số',
    topic: 'Phân thức đại số',
    difficulty: 'medium',
    minutes: 40,
    objective: 'Cộng, trừ phân thức cùng mẫu và khác mẫu.',
    theory:
      'Cùng mẫu: cộng/trừ các tử và giữ nguyên mẫu. Khác mẫu: quy đồng rồi cộng/trừ. Ví dụ: 1/x + 1/(x+1) = (x+1 + x)/[x(x+1)] = (2x+1)/[x(x+1)].',
  },
  {
    title: 'Nhân, chia phân thức đại số',
    topic: 'Phân thức đại số',
    difficulty: 'medium',
    minutes: 35,
    objective: 'Thực hiện nhân, chia phân thức và rút gọn.',
    theory:
      'Nhân: (A/B)·(C/D) = (A·C)/(B·D). Chia: (A/B):(C/D) = (A/B)·(D/C) với C ≠ 0. Sau khi nhân nên rút gọn. Ví dụ: (x/2)·(4/x²) = 4x/(2x²) = 2/x.',
  },

  // ===== ĐẠI SỐ — Phương trình =====
  {
    title: 'Phương trình bậc nhất một ẩn',
    topic: 'Phương trình bậc nhất một ẩn',
    difficulty: 'easy',
    minutes: 30,
    objective: 'Giải phương trình dạng ax + b = 0 (a ≠ 0).',
    theory:
      'Phương trình bậc nhất một ẩn có dạng ax + b = 0 (a ≠ 0), nghiệm duy nhất x = −b/a. Dùng quy tắc chuyển vế và quy tắc nhân để giải. Ví dụ: 2x − 6 = 0 ⇒ x = 3.',
  },
  {
    title: 'Phương trình đưa được về dạng ax + b = 0',
    topic: 'Phương trình bậc nhất một ẩn',
    difficulty: 'medium',
    minutes: 35,
    objective: 'Biến đổi phương trình về dạng bậc nhất rồi giải.',
    theory:
      'Bỏ ngoặc, quy đồng khử mẫu, chuyển các hạng tử chứa ẩn về một vế, hằng số về vế kia rồi thu gọn. Ví dụ: 2(x − 1) = x + 3 ⇒ 2x − 2 = x + 3 ⇒ x = 5.',
  },
  {
    title: 'Phương trình tích',
    topic: 'Phương trình bậc nhất một ẩn',
    difficulty: 'medium',
    minutes: 35,
    objective: 'Giải phương trình tích A(x)·B(x) = 0.',
    theory:
      'A(x)·B(x) = 0 khi A(x) = 0 hoặc B(x) = 0. Đưa phương trình về dạng tích bằng phân tích nhân tử rồi giải từng nhân tử. Ví dụ: (x − 1)(x + 2) = 0 ⇒ x = 1 hoặc x = −2.',
  },
  {
    title: 'Phương trình chứa ẩn ở mẫu',
    topic: 'Phương trình bậc nhất một ẩn',
    difficulty: 'hard',
    minutes: 40,
    objective: 'Giải phương trình chứa ẩn ở mẫu, có đối chiếu điều kiện.',
    theory:
      'Bước 1: tìm điều kiện xác định (mẫu ≠ 0). Bước 2: quy đồng khử mẫu và giải. Bước 3: đối chiếu nghiệm với điều kiện, loại nghiệm không thỏa. Ví dụ: 1/(x−1) = 2 với x ≠ 1 ⇒ x = 3/2.',
  },
  {
    title: 'Giải bài toán bằng cách lập phương trình',
    topic: 'Phương trình bậc nhất một ẩn',
    difficulty: 'hard',
    minutes: 45,
    objective: 'Mô hình hóa bài toán thực tế thành phương trình và giải.',
    theory:
      'Bước 1: chọn ẩn và đặt điều kiện. Bước 2: biểu diễn các đại lượng theo ẩn và lập phương trình. Bước 3: giải và đối chiếu điều kiện, trả lời. Dạng thường gặp: chuyển động, năng suất, tỉ lệ phần trăm.',
  },

  // ===== ĐẠI SỐ — Bất phương trình =====
  {
    title: 'Liên hệ giữa thứ tự và phép cộng, phép nhân',
    topic: 'Bất phương trình bậc nhất một ẩn',
    difficulty: 'easy',
    minutes: 30,
    objective: 'Hiểu các tính chất của bất đẳng thức.',
    theory:
      'Cộng cùng một số vào hai vế giữ nguyên chiều. Nhân hai vế với số dương giữ nguyên chiều, với số âm thì đổi chiều bất đẳng thức. Đây là nền tảng để giải bất phương trình.',
  },
  {
    title: 'Bất phương trình bậc nhất một ẩn',
    topic: 'Bất phương trình bậc nhất một ẩn',
    difficulty: 'medium',
    minutes: 35,
    objective: 'Giải và biểu diễn nghiệm của bất phương trình bậc nhất.',
    theory:
      'Bất phương trình dạng ax + b > 0 (hoặc <, ≥, ≤). Dùng quy tắc chuyển vế và quy tắc nhân (chú ý đổi chiều khi nhân/chia số âm). Biểu diễn tập nghiệm trên trục số. Ví dụ: −2x + 4 > 0 ⇒ x < 2.',
  },
  {
    title: 'Phương trình chứa dấu giá trị tuyệt đối',
    topic: 'Phương trình bậc nhất một ẩn',
    difficulty: 'hard',
    minutes: 40,
    objective: 'Giải phương trình dạng |ax + b| = c.',
    theory:
      'Với |A| = c (c ≥ 0) ⇒ A = c hoặc A = −c. Cần xét điều kiện và chia trường hợp theo dấu của biểu thức trong dấu giá trị tuyệt đối. Ví dụ: |x − 3| = 5 ⇒ x = 8 hoặc x = −2.',
  },

  // ===== HÌNH HỌC =====
  {
    title: 'Tứ giác và tổng các góc trong tứ giác',
    topic: 'Tứ giác',
    difficulty: 'easy',
    minutes: 30,
    objective: 'Biết tổng bốn góc của tứ giác bằng 360°.',
    theory:
      'Tứ giác có bốn đỉnh, bốn cạnh; tổng số đo bốn góc trong một tứ giác lồi bằng 360°. Ví dụ: nếu ba góc là 80°, 90°, 100° thì góc còn lại là 360° − 270° = 90°.',
  },
  {
    title: 'Hình thang và hình thang cân',
    topic: 'Tứ giác',
    difficulty: 'medium',
    minutes: 35,
    objective: 'Nhận biết tính chất hình thang, hình thang cân và dấu hiệu nhận biết.',
    theory:
      'Hình thang là tứ giác có hai cạnh đối song song. Hình thang cân có hai góc kề một đáy bằng nhau; hai cạnh bên bằng nhau và hai đường chéo bằng nhau. Đường trung bình của hình thang bằng nửa tổng hai đáy.',
  },
  {
    title: 'Hình bình hành',
    topic: 'Tứ giác',
    difficulty: 'medium',
    minutes: 35,
    objective: 'Nắm tính chất và dấu hiệu nhận biết hình bình hành.',
    theory:
      'Hình bình hành có các cạnh đối song song và bằng nhau, các góc đối bằng nhau, hai đường chéo cắt nhau tại trung điểm mỗi đường. Dấu hiệu: tứ giác có các cạnh đối song song, hoặc hai cạnh đối vừa song song vừa bằng nhau.',
  },
  {
    title: 'Hình chữ nhật, hình thoi và hình vuông',
    topic: 'Tứ giác',
    difficulty: 'hard',
    minutes: 40,
    objective: 'Phân biệt tính chất và dấu hiệu nhận biết hình chữ nhật, hình thoi, hình vuông.',
    theory:
      'Hình chữ nhật là hình bình hành có một góc vuông (hai đường chéo bằng nhau). Hình thoi là hình bình hành có hai cạnh kề bằng nhau (hai đường chéo vuông góc, là phân giác các góc). Hình vuông vừa là hình chữ nhật vừa là hình thoi.',
  },
  {
    title: 'Định lí Pythagore và ứng dụng',
    topic: 'Tam giác vuông',
    difficulty: 'medium',
    minutes: 40,
    objective: 'Vận dụng định lí Pythagore để tính độ dài cạnh trong tam giác vuông.',
    theory:
      'Trong tam giác vuông, bình phương cạnh huyền bằng tổng bình phương hai cạnh góc vuông: a² + b² = c². Định lí đảo dùng để nhận biết tam giác vuông. Ví dụ: tam giác có hai cạnh góc vuông 3 và 4 thì cạnh huyền = √(9 + 16) = 5.',
  },
];

type AnswerType = 'multiple_choice' | 'short_answer';

interface ExerciseSeed {
  question_text: string;
  answer_type: AnswerType;
  choices: string[] | null;
  correct_answer: string;
  explanation: string;
  difficulty: Difficulty;
}

const mc = (
  question_text: string,
  choices: string[],
  correct_answer: string,
  explanation: string,
  difficulty: Difficulty = 'easy'
): ExerciseSeed => ({ question_text, answer_type: 'multiple_choice', choices, correct_answer, explanation, difficulty });

const sa = (
  question_text: string,
  correct_answer: string,
  explanation: string,
  difficulty: Difficulty = 'medium'
): ExerciseSeed => ({ question_text, answer_type: 'short_answer', choices: null, correct_answer, explanation, difficulty });

// 3 bài tập cho mỗi bài học, key theo đúng lesson_title ở trên.
const EXERCISES_BY_TITLE: Record<string, ExerciseSeed[]> = {
  'Nhân đơn thức với đa thức': [
    mc('Khai triển $2x(3x - 5)$.', ['$6x^2 - 10x$', '$6x^2 - 5$', '$5x^2 - 10x$', '$6x - 10$'], '$6x^2 - 10x$', 'Nhân $2x$ với từng hạng tử: $2x·3x - 2x·5 = 6x^2 - 10x$.'),
    sa('Khai triển $x(x + 4)$.', 'x^2 + 4x', '$x·x + x·4 = x^2 + 4x$.', 'easy'),
    sa('Khai triển $-3x(2x - 1)$.', '-6x^2 + 3x', '$-3x·2x + (-3x)·(-1) = -6x^2 + 3x$.'),
  ],
  'Nhân đa thức với đa thức': [
    mc('Khai triển $(x + 2)(x - 3)$.', ['$x^2 - x - 6$', '$x^2 + x - 6$', '$x^2 - 6$', '$x^2 - 5x - 6$'], '$x^2 - x - 6$', '$x^2 - 3x + 2x - 6 = x^2 - x - 6$.'),
    sa('Khai triển $(x + 1)(x + 5)$.', 'x^2 + 6x + 5', '$x^2 + 5x + x + 5 = x^2 + 6x + 5$.', 'easy'),
    sa('Khai triển $(2x - 1)(x + 3)$.', '2x^2 + 5x - 3', '$2x^2 + 6x - x - 3 = 2x^2 + 5x - 3$.'),
  ],
  'Hằng đẳng thức: Bình phương của một tổng, một hiệu': [
    mc('Khai triển $(x + 3)^2$.', ['$x^2 + 6x + 9$', '$x^2 + 9$', '$x^2 + 3x + 9$', '$x^2 + 6x + 3$'], '$x^2 + 6x + 9$', '$(a+b)^2 = a^2 + 2ab + b^2$.'),
    sa('Khai triển $(x - 4)^2$.', 'x^2 - 8x + 16', '$(a-b)^2 = a^2 - 2ab + b^2 = x^2 - 8x + 16$.', 'easy'),
    sa('Tính nhanh $101^2$.', '10201', '$(100+1)^2 = 10000 + 200 + 1 = 10201$.'),
  ],
  'Hằng đẳng thức: Hiệu hai bình phương': [
    mc('Phân tích $49 - x^2$.', ['$(7 - x)(7 + x)$', '$(7 - x)^2$', '$(x - 7)(x + 7)$', '$(49 - x)(49 + x)$'], '$(7 - x)(7 + x)$', '$a^2 - b^2 = (a-b)(a+b)$ với $a=7, b=x$.'),
    sa('Phân tích $x^2 - 25$.', '(x - 5)(x + 5)', '$x^2 - 5^2 = (x-5)(x+5)$.', 'easy'),
    sa('Tính nhanh $103 · 97$.', '9991', '$(100+3)(100-3) = 100^2 - 3^2 = 9991$.'),
  ],
  'Hằng đẳng thức: Lập phương của một tổng, một hiệu': [
    sa('Khai triển $(x + 1)^3$.', 'x^3 + 3x^2 + 3x + 1', '$(a+b)^3 = a^3 + 3a^2b + 3ab^2 + b^3$.'),
    sa('Khai triển $(x - 2)^3$.', 'x^3 - 6x^2 + 12x - 8', '$(a-b)^3 = a^3 - 3a^2b + 3ab^2 - b^3$.', 'hard'),
    mc('Khai triển $(a + b)^3$ có bao nhiêu hạng tử sau khi thu gọn?', ['$4$', '$2$', '$3$', '$5$'], '$4$', '$a^3 + 3a^2b + 3ab^2 + b^3$ gồm 4 hạng tử.'),
  ],
  'Hằng đẳng thức: Tổng và hiệu hai lập phương': [
    sa('Phân tích $x^3 - 8$.', '(x - 2)(x^2 + 2x + 4)', '$a^3 - b^3 = (a-b)(a^2+ab+b^2)$ với $b=2$.'),
    sa('Phân tích $x^3 + 27$.', '(x + 3)(x^2 - 3x + 9)', '$a^3 + b^3 = (a+b)(a^2-ab+b^2)$ với $b=3$.', 'hard'),
    mc('Công thức $a^3 + b^3$ bằng?', ['$(a+b)(a^2 - ab + b^2)$', '$(a+b)(a^2 + ab + b^2)$', '$(a+b)^3$', '$(a-b)(a^2+ab+b^2)$'], '$(a+b)(a^2 - ab + b^2)$', 'Tổng hai lập phương.'),
  ],
  'Phân tích đa thức thành nhân tử: Đặt nhân tử chung': [
    sa('Phân tích $6x^2 - 9x$.', '3x(2x - 3)', 'Nhân tử chung là $3x$.', 'easy'),
    sa('Phân tích $5x^3 + 10x^2$.', '5x^2(x + 2)', 'Nhân tử chung là $5x^2$.'),
    mc('Nhân tử chung của $4x^2y$ và $6xy^2$ là?', ['$2xy$', '$2x^2y^2$', '$xy$', '$12xy$'], '$2xy$', 'ƯCLN hệ số là 2; biến chung là $xy$.'),
  ],
  'Phân tích đa thức thành nhân tử: Dùng hằng đẳng thức': [
    sa('Phân tích $x^2 - 6x + 9$.', '(x - 3)^2', '$x^2 - 2·3·x + 3^2 = (x-3)^2$.', 'easy'),
    sa('Phân tích $4x^2 - 25$.', '(2x - 5)(2x + 5)', '$(2x)^2 - 5^2$.'),
    sa('Phân tích $x^2 + 10x + 25$.', '(x + 5)^2', '$x^2 + 2·5·x + 5^2 = (x+5)^2$.'),
  ],
  'Phân tích đa thức thành nhân tử: Nhóm hạng tử': [
    sa('Phân tích $x^2 + xy + x + y$.', '(x + y)(x + 1)', '$x(x+y) + (x+y) = (x+y)(x+1)$.'),
    sa('Phân tích $xy - 3x + 2y - 6$.', '(y - 3)(x + 2)', '$x(y-3) + 2(y-3) = (y-3)(x+2)$.', 'hard'),
    sa('Phân tích $ax + ay + bx + by$.', '(a + b)(x + y)', '$a(x+y) + b(x+y) = (a+b)(x+y)$.'),
  ],
  'Phân tích đa thức thành nhân tử: Phối hợp nhiều phương pháp': [
    sa('Phân tích $2x^3 - 8x$.', '2x(x - 2)(x + 2)', '$2x(x^2 - 4) = 2x(x-2)(x+2)$.', 'hard'),
    sa('Phân tích $3x^2 - 12$.', '3(x - 2)(x + 2)', '$3(x^2 - 4) = 3(x-2)(x+2)$.'),
    sa('Phân tích $x^3 - x$.', 'x(x - 1)(x + 1)', '$x(x^2 - 1) = x(x-1)(x+1)$.'),
  ],
  'Chia đơn thức cho đơn thức': [
    mc('Tính $15x^4 : 3x^2$.', ['$5x^2$', '$5x^6$', '$12x^2$', '$5x$'], '$5x^2$', '$15:3 = 5$; $x^4 : x^2 = x^2$.'),
    sa('Tính $20x^5 : 4x^3$.', '5x^2', '$20:4 = 5$; $x^5 : x^3 = x^2$.', 'easy'),
    sa('Tính $-12x^3y^2 : 3xy$.', '-4x^2y', '$-12:3 = -4$; $x^3:x = x^2$; $y^2:y = y$.'),
  ],
  'Chia đa thức một biến đã sắp xếp': [
    mc('Tính $(x^2 - 5x + 6) : (x - 2)$.', ['$x - 3$', '$x + 3$', '$x - 2$', '$x - 6$'], '$x - 3$', '$x^2 - 5x + 6 = (x-2)(x-3)$.'),
    sa('Tính $(x^2 - 1) : (x - 1)$.', 'x + 1', '$x^2 - 1 = (x-1)(x+1)$.', 'easy'),
    sa('Tính $(x^2 + 5x + 6) : (x + 2)$.', 'x + 3', '$x^2 + 5x + 6 = (x+2)(x+3)$.'),
  ],
  'Phân thức đại số và điều kiện xác định': [
    mc('Điều kiện xác định của $\\dfrac{5}{x + 2}$ là?', ['$x \\ne -2$', '$x = -2$', '$x \\ne 2$', 'mọi $x$'], '$x \\ne -2$', 'Mẫu khác 0: $x + 2 \\ne 0$.'),
    mc('Điều kiện xác định của $\\dfrac{1}{x - 3}$ là?', ['$x \\ne 3$', '$x = 3$', '$x \\ne -3$', 'mọi $x$'], '$x \\ne 3$', 'Mẫu khác 0: $x - 3 \\ne 0$.'),
    sa('Tìm điều kiện xác định của $\\dfrac{x}{x^2 - 1}$.', 'x ≠ 1 và x ≠ -1', '$x^2 - 1 \\ne 0$ nên $x \\ne \\pm 1$.'),
  ],
  'Tính chất cơ bản và rút gọn phân thức': [
    sa('Rút gọn $\\dfrac{x^2 - 4}{x + 2}$ (với $x \\ne -2$).', 'x - 2', '$\\dfrac{(x-2)(x+2)}{x+2} = x - 2$.'),
    mc('Rút gọn $\\dfrac{2x}{4x}$ (với $x \\ne 0$).', ['$\\dfrac{1}{2}$', '$\\dfrac{1}{4}$', '$2$', '$x$'], '$\\dfrac{1}{2}$', 'Chia tử và mẫu cho $2x$.'),
    sa('Rút gọn $\\dfrac{x^2 - 9}{x - 3}$ (với $x \\ne 3$).', 'x + 3', '$\\dfrac{(x-3)(x+3)}{x-3} = x + 3$.'),
  ],
  'Quy đồng mẫu thức nhiều phân thức': [
    mc('Mẫu thức chung của $\\dfrac{1}{x}$ và $\\dfrac{1}{x+1}$ là?', ['$x(x + 1)$', '$x + 1$', '$x$', '$x^2 + 1$'], '$x(x + 1)$', 'Hai mẫu nguyên tố cùng nhau nên MTC là tích.'),
    sa('Mẫu thức chung của $\\dfrac{1}{x-1}$ và $\\dfrac{1}{x+1}$.', '(x - 1)(x + 1)', 'Tích hai mẫu, cũng bằng $x^2 - 1$.'),
    mc('Mẫu thức chung của $\\dfrac{1}{2x}$ và $\\dfrac{1}{3x}$ là?', ['$6x$', '$5x$', '$6x^2$', '$x$'], '$6x$', 'BCNN của $2x$ và $3x$ là $6x$.'),
  ],
  'Cộng, trừ phân thức đại số': [
    sa('Tính $\\dfrac{1}{x} + \\dfrac{1}{x+1}$.', '(2x + 1)/(x(x+1))', 'Quy đồng: $\\dfrac{x+1 + x}{x(x+1)} = \\dfrac{2x+1}{x(x+1)}$.', 'hard'),
    sa('Tính $\\dfrac{3}{x} - \\dfrac{1}{x}$.', '2/x', 'Cùng mẫu: $\\dfrac{3-1}{x} = \\dfrac{2}{x}$.', 'easy'),
    sa('Tính $\\dfrac{1}{x-1} - \\dfrac{1}{x+1}$.', '2/((x-1)(x+1))', '$\\dfrac{(x+1)-(x-1)}{(x-1)(x+1)} = \\dfrac{2}{x^2-1}$.', 'hard'),
  ],
  'Nhân, chia phân thức đại số': [
    sa('Tính $\\dfrac{x}{2} · \\dfrac{4}{x^2}$ (với $x \\ne 0$).', '2/x', '$\\dfrac{4x}{2x^2} = \\dfrac{2}{x}$.'),
    sa('Tính $\\dfrac{x}{3} : \\dfrac{x}{6}$ (với $x \\ne 0$).', '2', '$\\dfrac{x}{3} · \\dfrac{6}{x} = \\dfrac{6}{3} = 2$.'),
    sa('Tính $\\dfrac{2}{x} · \\dfrac{x}{4}$ (với $x \\ne 0$).', '1/2', '$\\dfrac{2x}{4x} = \\dfrac{1}{2}$.', 'easy'),
  ],
  'Phương trình bậc nhất một ẩn': [
    sa('Giải $2x - 6 = 0$.', 'x = 3', '$2x = 6 \\Rightarrow x = 3$.', 'easy'),
    sa('Giải $3x + 9 = 0$.', 'x = -3', '$3x = -9 \\Rightarrow x = -3$.', 'easy'),
    mc('Nghiệm của $5x = 20$ là?', ['$x = 4$', '$x = 5$', '$x = 15$', '$x = 100$'], '$x = 4$', '$x = 20 : 5 = 4$.'),
  ],
  'Phương trình đưa được về dạng ax + b = 0': [
    sa('Giải $2(x - 1) = x + 3$.', 'x = 5', '$2x - 2 = x + 3 \\Rightarrow x = 5$.'),
    sa('Giải $3x - 4 = x + 6$.', 'x = 5', '$2x = 10 \\Rightarrow x = 5$.'),
    sa('Giải $5x + 2 = 3x - 4$.', 'x = -3', '$2x = -6 \\Rightarrow x = -3$.'),
  ],
  'Phương trình tích': [
    mc('Nghiệm của $(x - 1)(x + 2) = 0$ là?', ['$x = 1$ hoặc $x = -2$', '$x = -1$ hoặc $x = 2$', '$x = 1$ và $x = 2$', '$x = -1$ hoặc $x = -2$'], '$x = 1$ hoặc $x = -2$', 'Tích bằng 0 khi một nhân tử bằng 0.'),
    sa('Giải $x(x - 3) = 0$.', 'x = 0 hoặc x = 3', '$x = 0$ hoặc $x - 3 = 0$.', 'easy'),
    sa('Giải $(2x - 4)(x + 1) = 0$.', 'x = 2 hoặc x = -1', '$2x - 4 = 0 \\Rightarrow x = 2$; $x + 1 = 0 \\Rightarrow x = -1$.'),
  ],
  'Phương trình chứa ẩn ở mẫu': [
    sa('Giải $\\dfrac{1}{x - 1} = 2$ (với $x \\ne 1$).', 'x = 3/2', '$1 = 2(x-1) \\Rightarrow 2x = 3 \\Rightarrow x = 3/2$.', 'hard'),
    mc('Điều kiện xác định của phương trình có mẫu $(x - 2)$ là?', ['$x \\ne 2$', '$x = 2$', '$x \\ne -2$', 'mọi $x$'], '$x \\ne 2$', 'Mẫu phải khác 0.'),
    sa('Giải $\\dfrac{2}{x} = 1$ (với $x \\ne 0$).', 'x = 2', '$2 = x \\Rightarrow x = 2$.', 'easy'),
  ],
  'Giải bài toán bằng cách lập phương trình': [
    sa('Tổng hai số là 20, số lớn hơn số bé 4 đơn vị. Tìm số lớn.', '12', 'Gọi số bé $x$: $x + (x+4) = 20 \\Rightarrow x = 8$, số lớn $= 12$.'),
    sa('Một số cộng với 7 thì được 15. Tìm số đó.', '8', '$x + 7 = 15 \\Rightarrow x = 8$.', 'easy'),
    sa('Hình chữ nhật có chu vi 24 cm, chiều dài hơn chiều rộng 2 cm. Tìm chiều rộng.', '5', 'Nửa chu vi $= 12$; gọi rộng $x$: $x + (x+2) = 12 \\Rightarrow x = 5$.', 'hard'),
  ],
  'Liên hệ giữa thứ tự và phép cộng, phép nhân': [
    mc('Khi nhân hai vế một bất đẳng thức với số âm thì chiều bất đẳng thức?', ['Đổi chiều', 'Giữ nguyên', 'Bằng nhau', 'Mất nghiệm'], 'Đổi chiều', 'Nhân/chia số âm làm đổi chiều bất đẳng thức.', 'easy'),
    mc('Nếu $a < b$ thì $a + 3$ và $b + 3$ quan hệ thế nào?', ['$a + 3 < b + 3$', '$a + 3 > b + 3$', '$a + 3 = b + 3$', 'Không so sánh được'], '$a + 3 < b + 3$', 'Cộng cùng một số giữ nguyên chiều.', 'easy'),
    sa('Từ $a < b$, hãy điền dấu: $-2a \\;?\\; -2b$.', '-2a > -2b', 'Nhân với $-2 < 0$ nên đổi chiều.'),
  ],
  'Bất phương trình bậc nhất một ẩn': [
    sa('Giải bất phương trình $-2x + 4 > 0$.', 'x < 2', '$-2x > -4 \\Rightarrow x < 2$ (đổi chiều khi chia số âm).'),
    sa('Giải $3x - 9 \\le 0$.', 'x ≤ 3', '$3x \\le 9 \\Rightarrow x \\le 3$.', 'easy'),
    mc('Nghiệm của $2x > 6$ là?', ['$x > 3$', '$x < 3$', '$x > 12$', '$x \\ge 3$'], '$x > 3$', '$x > 6 : 2 = 3$.'),
  ],
  'Phương trình chứa dấu giá trị tuyệt đối': [
    mc('Nghiệm của $|x - 3| = 5$ là?', ['$x = 8$ hoặc $x = -2$', '$x = 8$', '$x = 2$ hoặc $x = -8$', '$x = -2$'], '$x = 8$ hoặc $x = -2$', '$x - 3 = 5$ hoặc $x - 3 = -5$.'),
    sa('Giải $|x| = 4$.', 'x = 4 hoặc x = -4', 'Giá trị tuyệt đối bằng 4 có hai nghiệm đối nhau.', 'easy'),
    sa('Giải $|x + 1| = 0$.', 'x = -1', '$|A| = 0 \\Leftrightarrow A = 0$.', 'easy'),
  ],
  'Tứ giác và tổng các góc trong tứ giác': [
    mc('Tổng số đo bốn góc của một tứ giác lồi bằng?', ['$360°$', '$180°$', '$270°$', '$540°$'], '$360°$', 'Tứ giác chia thành hai tam giác, mỗi tam giác $180°$.', 'easy'),
    sa('Tứ giác có ba góc $80°, 90°, 100°$. Tính góc còn lại.', '90', '$360° - (80° + 90° + 100°) = 90°$.', 'easy'),
    sa('Một tứ giác có ba góc vuông. Góc thứ tư bằng bao nhiêu độ?', '90', '$360° - 3·90° = 90°$.'),
  ],
  'Hình thang và hình thang cân': [
    mc('Hình thang là tứ giác có hai cạnh đối?', ['Song song', 'Bằng nhau', 'Vuông góc', 'Cắt nhau'], 'Song song', 'Định nghĩa hình thang.', 'easy'),
    sa('Đường trung bình hình thang có hai đáy $6$ và $10$ dài bao nhiêu?', '8', 'Bằng nửa tổng hai đáy: $(6+10)/2 = 8$.'),
    mc('Trong hình thang cân, hai đường chéo?', ['Bằng nhau', 'Vuông góc', 'Song song', 'Bằng cạnh bên'], 'Bằng nhau', 'Tính chất hình thang cân.'),
  ],
  'Hình bình hành': [
    mc('Hai đường chéo của hình bình hành?', ['Cắt nhau tại trung điểm mỗi đường', 'Bằng nhau', 'Vuông góc', 'Song song'], 'Cắt nhau tại trung điểm mỗi đường', 'Tính chất đường chéo hình bình hành.', 'easy'),
    mc('Các góc đối của hình bình hành?', ['Bằng nhau', 'Bù nhau', 'Phụ nhau', 'Vuông'], 'Bằng nhau', 'Tính chất góc hình bình hành.', 'easy'),
    sa('Hình bình hành có một góc $70°$. Góc kề với nó bằng bao nhiêu độ?', '110', 'Hai góc kề một cạnh bù nhau: $180° - 70° = 110°$.'),
  ],
  'Hình chữ nhật, hình thoi và hình vuông': [
    mc('Hai đường chéo của hình chữ nhật?', ['Bằng nhau', 'Vuông góc', 'Là phân giác các góc', 'Không bằng nhau'], 'Bằng nhau', 'Đặc trưng của hình chữ nhật.', 'easy'),
    mc('Hai đường chéo của hình thoi?', ['Vuông góc với nhau', 'Bằng nhau', 'Song song', 'Bằng cạnh'], 'Vuông góc với nhau', 'Đặc trưng của hình thoi.', 'easy'),
    mc('Hình vuông là hình?', ['Vừa là hình chữ nhật vừa là hình thoi', 'Chỉ là hình chữ nhật', 'Chỉ là hình thoi', 'Không phải hình bình hành'], 'Vừa là hình chữ nhật vừa là hình thoi', 'Hình vuông có đủ tính chất cả hai.'),
  ],
  'Định lí Pythagore và ứng dụng': [
    sa('Tam giác vuông có hai cạnh góc vuông $3$ và $4$. Tính cạnh huyền.', '5', '$\\sqrt{3^2 + 4^2} = \\sqrt{25} = 5$.', 'easy'),
    sa('Tam giác vuông có hai cạnh góc vuông $6$ và $8$. Tính cạnh huyền.', '10', '$\\sqrt{36 + 64} = \\sqrt{100} = 10$.'),
    mc('Hệ thức $a^2 + b^2 = c^2$ đúng với tam giác?', ['Vuông', 'Đều', 'Cân', 'Tù'], 'Vuông', 'Định lí Pythagore áp dụng cho tam giác vuông ($c$ là cạnh huyền).', 'easy'),
  ],
};

async function run(): Promise<void> {
  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  console.log(`Connected to MongoDB database "${DB_NAME}"`);

  const UserModel = mongoose.model('User');

  // Ưu tiên teacher demo, sau đó bất kỳ teacher/admin nào.
  const author =
    (await UserModel.findOne({ email: 'teacher@mathai.vn' }).lean()) ??
    (await UserModel.findOne({ role: { $in: ['teacher', 'admin'] } }).lean());

  if (!author) {
    throw new Error(
      'Không tìm thấy user teacher/admin để gán created_by. Hãy chạy `npm run seed` trước.'
    );
  }

  const authorId = (author as { _id: mongoose.Types.ObjectId })._id;
  const authorRole = (author as { role?: string }).role ?? 'teacher';
  const publishedAt = new Date();

  let upserted = 0;
  let exercisesUpserted = 0;
  for (const [index, lesson] of LESSONS.entries()) {
    const lessonTemplate = await LessonTemplateModel.findOneAndUpdate(
      { lesson_title: lesson.title, created_by: authorId },
      {
        $set: {
          curriculum_template_id: null,
          module_template_id: null,
          theory_content: lesson.theory,
          lesson_objective: lesson.objective,
          grade_level: GRADE,
          age_group: AGE_GROUP,
          topic: lesson.topic,
          difficulty_level: lesson.difficulty,
          estimated_minutes: lesson.minutes,
          order_index: index + 1,
          status: 'published',
          created_by: authorId,
          created_by_role: authorRole,
          source: 'manual',
          ai_prompt: null,
          ai_model: null,
          tokens_input: 0,
          tokens_output: 0,
          published_at: publishedAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    upserted += 1;

    const exercises = EXERCISES_BY_TITLE[lesson.title] ?? [];
    for (const [exIndex, exercise] of exercises.entries()) {
      await ExerciseTemplateModel.findOneAndUpdate(
        { lesson_template_id: lessonTemplate!._id, order_index: exIndex + 1 },
        {
          $set: {
            topic: lesson.topic,
            difficulty_level: exercise.difficulty,
            question_text: exercise.question_text,
            answer_type: exercise.answer_type,
            choices: exercise.choices,
            correct_answer: exercise.correct_answer,
            solution_steps: null,
            explanation: exercise.explanation,
            grade_level: GRADE,
            math_topic: lesson.topic,
            question_type: exercise.answer_type === 'multiple_choice' ? 'multiple_choice' : 'calculation',
            source: 'manual',
            question_bank_status: 'published',
            max_points: 1,
            estimated_minutes: 5,
            tags: ['grade8', 'content-library'],
          },
          $setOnInsert: {
            lesson_template_id: lessonTemplate!._id,
            order_index: exIndex + 1,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      exercisesUpserted += 1;
    }
  }

  console.log(`Upserted ${upserted} bài học Toán lớp ${GRADE} (LessonTemplate, status=published).`);
  console.log(`Upserted ${exercisesUpserted} bài tập (ExerciseTemplate, question_bank_status=published).`);
  console.log(`created_by: ${(author as { email?: string }).email ?? authorId} (${authorRole})`);
  console.log('Seed grade-8 math complete!');

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('Seed grade-8 math failed:', error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
