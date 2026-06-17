import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import '../src/models/ai-tutor.model';
import '../src/models/content-assignment.model';
import '../src/models/content-library.model';
import '../src/models/curriculum.model';
import '../src/models/lesson.model';
import '../src/models/notification-template.model';
import '../src/models/parent-child.model';
import '../src/models/progress.model';
import '../src/models/setting.model';
import '../src/models/student.model';
import '../src/models/user.model';

import { DEFAULT_NOTIFICATION_TEMPLATES } from '../src/models/notification-template.seed';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'mathai';
const DEMO_PASSWORD_ENV = process.env.SEED_DEMO_PASSWORD;
export const DEFAULT_DEMO_PASSWORD = 'MathAI@Demo123';
export const DEMO_PASSWORD = DEMO_PASSWORD_ENV || DEFAULT_DEMO_PASSWORD;

const isProduction = process.env.NODE_ENV === 'production';

export const DEFAULT_AI_TUTORS = [
  {
    code: 'thay_minh',
    name: 'Thầy Minh',
    display_name: 'Thầy Minh',
    avatar_url: null,
    avatar_emoji: '👨‍🏫',
    gender_style: 'nam',
    tone_style: 'Nghiêm túc, logic, có hệ thống',
    teaching_style: 'Phân tích từng bước, giải thích chi tiết',
    personality: 'Kiên nhẫn, tỉ mỉ, luôn khuyến khích học sinh',
    description: 'Thầy Minh chuyên dạy theo phương pháp phân tích logic, giúp học sinh hiểu bản chất vấn đề.',
    system_prompt:
      'Bạn là Thầy Minh, một giáo viên toán nghiêm túc và có hệ thống. Bạn luôn giải thích từng bước một cách logic, kiên nhẫn với học sinh. Khi học sinh sai, bạn không chê trách mà hướng dẫn lại từ đầu. Sử dụng ngôn ngữ tiếng Việt tự nhiên, xưng "thầy" và gọi học sinh là "em".',
    is_active: true,
  },
  {
    code: 'co_lan',
    name: 'Cô Lan',
    display_name: 'Cô Lan',
    avatar_url: null,
    avatar_emoji: '👩‍🏫',
    gender_style: 'nu',
    tone_style: 'Nhẹ nhàng, ấm áp, động viên',
    teaching_style: 'Liên hệ thực tế, ví dụ gần gũi',
    personality: 'Thân thiện, vui vẻ, luôn khen ngợi nỗ lực',
    description: 'Cô Lan dạy toán bằng cách liên hệ thực tế, giúp học sinh thấy toán học thú vị và gần gũi.',
    system_prompt:
      'Bạn là Cô Lan, một giáo viên toán thân thiện và ấm áp. Bạn thích dùng ví dụ thực tế để giải thích các khái niệm toán học. Luôn khen ngợi nỗ lực của học sinh dù kết quả chưa đúng. Xưng "cô" và gọi học sinh là "em". Giọng điệu nhẹ nhàng, động viên.',
    is_active: true,
  },
  {
    code: 'thay_duc',
    name: 'Thầy Đức',
    display_name: 'Thầy Đức',
    avatar_url: null,
    avatar_emoji: '🧑‍💻',
    gender_style: 'nam',
    tone_style: 'Năng động, hiện đại, hài hước',
    teaching_style: 'Gamification, thử thách, thi đua',
    personality: 'Trẻ trung, hài hước, tạo động lực bằng thử thách',
    description: 'Thầy Đức biến toán học thành trò chơi với các thử thách thú vị, phù hợp với học sinh thích cạnh tranh.',
    system_prompt:
      'Bạn là Thầy Đức, một giáo viên toán trẻ trung và năng động. Bạn thích biến bài toán thành thử thách và trò chơi. Dùng emoji, ngôn ngữ hiện đại nhưng vẫn lịch sự. Khuyến khích học sinh bằng cách tạo cảm giác chinh phục. Xưng "thầy" và gọi học sinh là "em".',
    is_active: true,
  },
  {
    code: 'co_huong',
    name: 'Cô Hương',
    display_name: 'Cô Hương',
    avatar_url: null,
    avatar_emoji: '🌸',
    gender_style: 'nu',
    tone_style: 'Dịu dàng, kiên nhẫn, từ từ',
    teaching_style: 'Lặp lại nhiều lần, đi chậm, chắc chắn',
    personality: 'Cực kỳ kiên nhẫn, không bao giờ nóng giận',
    description: 'Cô Hương phù hợp với học sinh cần thời gian, giải thích đi giải thích lại không biết mệt.',
    system_prompt:
      'Bạn là Cô Hương, một giáo viên toán cực kỳ kiên nhẫn. Bạn sẵn sàng giải thích lại nhiều lần theo nhiều cách khác nhau. Không bao giờ tỏ ra khó chịu khi học sinh chưa hiểu. Đi từng bước nhỏ, chắc chắn từng bước. Xưng "cô" và gọi học sinh là "em".',
    is_active: true,
  },
  {
    code: 'thay_hung',
    name: 'Thầy Hùng',
    display_name: 'Thầy Hùng',
    avatar_url: null,
    avatar_emoji: '💪',
    gender_style: 'nam',
    tone_style: 'Mạnh mẽ, trực tiếp, thách thức',
    teaching_style: 'Đặt câu hỏi ngược, kích thích tư duy',
    personality: 'Thẳng thắn, đòi hỏi cao, nhưng công bằng',
    description: 'Thầy Hùng dạy bằng cách đặt câu hỏi ngược, buộc học sinh phải tự suy nghĩ trước khi cho đáp án.',
    system_prompt:
      'Bạn là Thầy Hùng, một giáo viên toán thẳng thắn và đòi hỏi cao. Thay vì cho đáp án ngay, bạn đặt câu hỏi ngược để kích thích tư duy. Khen ngợi khi học sinh tự tìm ra lời giải. Xưng "thầy" và gọi học sinh là "em". Giọng mạnh mẽ nhưng công bằng.',
    is_active: true,
  },
] as const;

export const DEMO_USERS = [
  { email: 'admin@mathai.vn', full_name: 'Quản trị viên Demo', role: 'admin' },
  { email: 'teacher@mathai.vn', full_name: 'Giáo viên Demo', role: 'teacher' },
  { email: 'student@mathai.vn', full_name: 'Nguyễn Minh Anh', role: 'student' },
  { email: 'parent@mathai.vn', full_name: 'Phụ huynh Demo', role: 'parent' },
  { email: 'staff@mathai.vn', full_name: 'Nhân viên Demo', role: 'staff' },
] as const;

export const DEMO_STUDENT_PROFILE = {
  // Sinh 9/2012 → vào lớp 1 năm 2018 → lớp 8 trong năm học 2025-2026
  date_of_birth: new Date('2012-09-15T00:00:00.000Z'),
  phone: '0900000003',
  address: 'Quận Cầu Giấy, Hà Nội',
  school_name: 'THCS Demo MathAI',
  grade_level: 8,
  self_assessed_level: 'kha',
  math_average_score: 7.2,
  preferred_teacher_gender: 'co',
  favorite_color: '#4F46E5',
  interests: 'Bóng rổ, vẽ truyện tranh, khám phá khoa học',
  initial_classification: 'kha',
} as const;

export const SYSTEM_SETTINGS = [
  { setting_key: 'ai_endpoint', setting_value: '' },
  { setting_key: 'ai_api_key', setting_value: '' },
  { setting_key: 'ai_model', setting_value: 'gpt-4o-mini' },
] as const;

const LEGACY_SAMPLE_CURRICULUM_TITLES = [
  'Demo Dev - Lộ trình Toán lớp 8 nền tảng',
] as const;

export const SAMPLE_CONTENT = {
  curriculumTitle: 'Mẫu thử — Lộ trình Toán lớp 8 nền tảng',
  moduleTitle: 'Phân thức đại số cơ bản',
  lessonTitle: 'Rút gọn phân thức đại số',
  topic: 'Phân thức đại số',
  exercises: [
    {
      topic: 'Phân thức đại số',
      difficulty_level: 'easy',
      question_text: 'Rút gọn phân thức $\\dfrac{2x}{4x}$ với $x \\ne 0$.',
      answer_type: 'multiple_choice',
      choices: ['$\\dfrac{1}{4}$', '$\\dfrac{1}{2}$', '$2$', '$4$'],
      correct_answer: '$\\dfrac{1}{2}$',
      solution_steps: ['Chia cả tử và mẫu cho $2x$.', '$\\dfrac{2x}{4x} = \\dfrac{1}{2}$.'],
      explanation: 'Khi $x \\ne 0$, có thể triệt tiêu $x$ ở tử và mẫu.',
      order_index: 1,
    },
    {
      topic: 'Phân thức đại số',
      difficulty_level: 'medium',
      question_text: 'Rút gọn phân thức $\\dfrac{x^2 - 9}{x - 3}$ với $x \\ne 3$.',
      answer_type: 'short_answer',
      choices: null,
      correct_answer: 'x + 3',
      solution_steps: ['Phân tích $x^2 - 9 = (x - 3)(x + 3)$.', 'Triệt tiêu nhân tử $x - 3$ vì $x \\ne 3$.', 'Kết quả là $x + 3$.'],
      explanation: 'Dùng hằng đẳng thức hiệu hai bình phương.',
      order_index: 2,
    },
    {
      topic: 'Phân thức đại số',
      difficulty_level: 'medium',
      question_text: 'Điều kiện xác định của phân thức $\\dfrac{5}{x + 2}$ là gì?',
      answer_type: 'multiple_choice',
      choices: ['$x = -2$', '$x \\ne -2$', '$x = 2$', 'mọi $x$'],
      correct_answer: '$x \\ne -2$',
      solution_steps: ['Mẫu số không được bằng 0.', '$x + 2 \\ne 0$ nên $x \\ne -2$.'],
      explanation: 'Phân thức xác định khi mẫu số khác 0.',
      order_index: 3,
    },
  ],
} as const;

// Bài học bổ sung: Số mũ, Hàm số, Biểu thức đơn giản (module "Đại số nền tảng").
export const EXTRA_LESSONS_MODULE = {
  moduleTitle: 'Đại số nền tảng',
  moduleDescription: 'Làm quen số mũ, hàm số và biểu thức đại số đơn giản.',
  topic: 'Đại số',
  stage: 'foundation',
  orderIndex: 2,
  lessons: [
    {
      lessonTitle: 'Số mũ (lũy thừa)',
      topic: 'Số mũ',
      objective: 'Hiểu lũy thừa với số mũ tự nhiên và các quy tắc nhân, chia lũy thừa cùng cơ số.',
      theory: [
        '# Số mũ (lũy thừa)',
        '![Minh họa](/lessons/illustrations/default-math.svg)',
        'Lũy thừa bậc $n$ của $a$ là tích của $n$ thừa số $a$: $a^n = \\underbrace{a \\cdot a \\cdots a}_{n}$.',
        '**Quy tắc cơ bản:**',
        '- Nhân cùng cơ số: $a^m \\cdot a^n = a^{m+n}$.',
        '- Chia cùng cơ số: $a^m : a^n = a^{m-n}$ (với $a \\ne 0$).',
        '- Lũy thừa của lũy thừa: $(a^m)^n = a^{m \\cdot n}$.',
        '- Quy ước: $a^0 = 1$ với $a \\ne 0$.',
      ].join('\n'),
      exercises: [
        {
          topic: 'Số mũ',
          difficulty_level: 'easy',
          question_text: 'Tính giá trị của $2^3$.',
          answer_type: 'multiple_choice',
          choices: ['$5$', '$6$', '$8$', '$9$'],
          correct_answer: '$8$',
          solution_steps: ['$2^3 = 2 \\cdot 2 \\cdot 2$.', '$= 8$.'],
          explanation: 'Nhân ba thừa số 2 với nhau.',
          order_index: 1,
        },
        {
          topic: 'Số mũ',
          difficulty_level: 'medium',
          question_text: 'Rút gọn $x^2 \\cdot x^3$ thành một lũy thừa của $x$.',
          answer_type: 'short_answer',
          choices: null,
          correct_answer: 'x^5',
          solution_steps: ['Áp dụng $a^m \\cdot a^n = a^{m+n}$.', '$x^2 \\cdot x^3 = x^{2+3} = x^5$.'],
          explanation: 'Cộng số mũ khi nhân cùng cơ số.',
          order_index: 2,
        },
        {
          topic: 'Số mũ',
          difficulty_level: 'easy',
          question_text: 'Giá trị của $5^0$ là bao nhiêu?',
          answer_type: 'multiple_choice',
          choices: ['$0$', '$1$', '$5$', 'không xác định'],
          correct_answer: '$1$',
          solution_steps: ['Theo quy ước $a^0 = 1$ với $a \\ne 0$.'],
          explanation: 'Mọi số khác 0 mũ 0 đều bằng 1.',
          order_index: 3,
        },
      ],
    },
    {
      lessonTitle: 'Hàm số',
      topic: 'Hàm số',
      objective: 'Hiểu khái niệm hàm số và cách tính giá trị của hàm số bậc nhất.',
      theory: [
        '# Hàm số',
        '![Minh họa](/lessons/illustrations/graph.svg)',
        'Hàm số là quy tắc cho mỗi giá trị $x$ tương ứng đúng một giá trị $y$, viết là $y = f(x)$.',
        'Hàm số bậc nhất có dạng $y = ax + b$ với $a \\ne 0$.',
        '- Khi $a > 0$: hàm số **đồng biến** (tăng).',
        '- Khi $a < 0$: hàm số **nghịch biến** (giảm).',
        'Để tính giá trị, thay $x$ vào biểu thức $f(x)$.',
      ].join('\n'),
      exercises: [
        {
          topic: 'Hàm số',
          difficulty_level: 'easy',
          question_text: 'Cho $f(x) = 2x + 1$. Tính $f(3)$.',
          answer_type: 'multiple_choice',
          choices: ['$5$', '$6$', '$7$', '$8$'],
          correct_answer: '$7$',
          solution_steps: ['Thay $x = 3$: $f(3) = 2 \\cdot 3 + 1$.', '$= 7$.'],
          explanation: 'Thay số vào biểu thức hàm số.',
          order_index: 1,
        },
        {
          topic: 'Hàm số',
          difficulty_level: 'medium',
          question_text: 'Hàm số $y = ax + b$ đồng biến khi nào?',
          answer_type: 'multiple_choice',
          choices: ['$a > 0$', '$a < 0$', '$a = 0$', '$b > 0$'],
          correct_answer: '$a > 0$',
          solution_steps: ['Hệ số góc $a > 0$ thì $y$ tăng khi $x$ tăng.'],
          explanation: 'Dấu của hệ số góc $a$ quyết định tính đồng biến/nghịch biến.',
          order_index: 2,
        },
        {
          topic: 'Hàm số',
          difficulty_level: 'easy',
          question_text: 'Cho $f(x) = -x + 4$. Tính $f(0)$.',
          answer_type: 'short_answer',
          choices: null,
          correct_answer: '4',
          solution_steps: ['Thay $x = 0$: $f(0) = -0 + 4 = 4$.'],
          explanation: 'Giá trị hàm số tại $x = 0$ chính là hệ số tự do $b$.',
          order_index: 3,
        },
      ],
    },
    {
      lessonTitle: 'Biểu thức đơn giản',
      topic: 'Biểu thức đại số',
      objective: 'Biết thu gọn biểu thức đại số đơn giản và tính giá trị khi thay số.',
      theory: [
        '# Biểu thức đại số đơn giản',
        '![Minh họa](/lessons/illustrations/equation.svg)',
        'Biểu thức đại số gồm các số, chữ và phép toán, ví dụ $3x + 2$.',
        '**Thu gọn:** cộng/trừ các hạng tử đồng dạng (cùng phần biến).',
        'Ví dụ: $2x + 3x = 5x$.',
        '**Tính giá trị:** thay giá trị của biến vào rồi thực hiện phép tính.',
      ].join('\n'),
      exercises: [
        {
          topic: 'Biểu thức đại số',
          difficulty_level: 'easy',
          question_text: 'Thu gọn biểu thức $2x + 3x$.',
          answer_type: 'multiple_choice',
          choices: ['$5x$', '$6x$', '$5x^2$', '$6$'],
          correct_answer: '$5x$',
          solution_steps: ['Cộng các hạng tử đồng dạng: $2x + 3x = (2+3)x$.', '$= 5x$.'],
          explanation: 'Cộng hệ số của các hạng tử cùng phần biến.',
          order_index: 1,
        },
        {
          topic: 'Biểu thức đại số',
          difficulty_level: 'easy',
          question_text: 'Tính giá trị của biểu thức $3a + 2$ khi $a = 4$.',
          answer_type: 'multiple_choice',
          choices: ['$12$', '$14$', '$9$', '$20$'],
          correct_answer: '$14$',
          solution_steps: ['Thay $a = 4$: $3 \\cdot 4 + 2$.', '$= 12 + 2 = 14$.'],
          explanation: 'Thay số rồi tính theo thứ tự phép toán.',
          order_index: 2,
        },
        {
          topic: 'Biểu thức đại số',
          difficulty_level: 'medium',
          question_text: 'Thu gọn $5y - 2y + y$.',
          answer_type: 'short_answer',
          choices: null,
          correct_answer: '4y',
          solution_steps: ['$5y - 2y + y = (5 - 2 + 1)y$.', '$= 4y$.'],
          explanation: 'Cộng trừ các hệ số của hạng tử đồng dạng.',
          order_index: 3,
        },
      ],
    },
  ],
} as const;

export const SAMPLE_CONTENT_LIBRARY = {
  marker: 'mathai-dev-content-library-seed-v1',
  curriculumTitle: 'Mẫu thử — Toán 8: Phân thức đại số',
  moduleTitle: 'Phân thức đại số cơ bản',
  lessonTitle: 'Mẫu thử — Rút gọn phân thức đại số',
  assignmentTitle: 'Mẫu thử — Rút gọn phân thức đại số',
  gradeLevel: 8,
  ageGroup: '13-14 tuổi',
  subject: 'math',
  topic: 'Phân thức đại số',
  mathTopicPath: ['Toán 8', 'Đại số', 'Phân thức đại số'],
  difficultyLevel: 'medium',
  exercises: [
    {
      topic: 'Phân thức đại số',
      difficulty_level: 'easy',
      question_text: 'Rút gọn phân thức $\\dfrac{3x}{6x}$ với $x \\ne 0$.',
      answer_type: 'multiple_choice',
      choices: ['$\\dfrac{1}{3}$', '$\\dfrac{1}{2}$', '$2$', '$3$'],
      correct_answer: '$\\dfrac{1}{2}$',
      solution_steps: ['Chia cả tử và mẫu cho $3x$.', '$\\dfrac{3x}{6x} = \\dfrac{1}{2}$.'],
      explanation: 'Vì $x \\ne 0$ nên có thể triệt tiêu nhân tử chung $3x$.',
      order_index: 1,
    },
    {
      topic: 'Phân thức đại số',
      difficulty_level: 'medium',
      question_text: 'Rút gọn phân thức $\\dfrac{x^2 - 16}{x - 4}$ với $x \\ne 4$.',
      answer_type: 'short_answer',
      choices: null,
      correct_answer: 'x + 4',
      solution_steps: ['Phân tích $x^2 - 16 = (x - 4)(x + 4)$.', 'Triệt tiêu $x - 4$ vì $x \\ne 4$.', 'Kết quả là $x + 4$.'],
      explanation: 'Áp dụng hằng đẳng thức hiệu hai bình phương.',
      order_index: 2,
    },
  ],
} as const;

export function getDemoEmails(): string[] {
  return DEMO_USERS.map((user) => user.email);
}

export function getSeedRecommendedDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function assertUniqueSeedKeys(): void {
  const duplicateTutorCodes = findDuplicates(DEFAULT_AI_TUTORS.map((tutor) => tutor.code));
  const duplicateEmails = findDuplicates(getDemoEmails());

  if (duplicateTutorCodes.length > 0 || duplicateEmails.length > 0) {
    throw new Error(`Duplicate seed keys: tutors=${duplicateTutorCodes.join(',')}; emails=${duplicateEmails.join(',')}`);
  }
}

function findDuplicates(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

async function upsertAITutors() {
  const AITutor = mongoose.model('AITutor');
  const results = [];

  for (const tutor of DEFAULT_AI_TUTORS) {
    const result = await AITutor.findOneAndUpdate(
      { code: tutor.code },
      { $set: tutor },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    results.push(result);
  }

  return results;
}

async function upsertSystemSettings() {
  const SystemSetting = mongoose.model('SystemSetting');

  for (const setting of SYSTEM_SETTINGS) {
    await SystemSetting.findOneAndUpdate(
      { setting_key: setting.setting_key },
      { $setOnInsert: setting },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function upsertDemoUsers(passwordHash: string) {
  const User = mongoose.model('User');
  const users: Record<string, any> = {};

  for (const user of DEMO_USERS) {
    users[user.email] = await User.findOneAndUpdate(
      { email: user.email },
      {
        $set: {
          full_name: user.full_name,
          password_hash: passwordHash,
          role: user.role,
          is_active: true,
        },
        $setOnInsert: {
          email: user.email,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  return users;
}

async function upsertStudentProfile(studentUser: any, tutor: any) {
  const StudentProfile = mongoose.model('StudentProfile');

  return StudentProfile.findOneAndUpdate(
    { user_id: studentUser._id },
    {
      $set: {
        ...DEMO_STUDENT_PROFILE,
        selected_tutor_id: tutor?._id ?? null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function upsertStudentTheme(studentProfile: any) {
  const StudentThemePreference = mongoose.model('StudentThemePreference');

  return StudentThemePreference.findOneAndUpdate(
    { student_id: studentProfile._id },
    {
      $set: {
        favorite_color: DEMO_STUDENT_PROFILE.favorite_color,
        font_size: 'medium',
        theme_mode: 'light',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function upsertParentChild(parentUser: any, studentProfile: any) {
  const ParentChild = mongoose.model('ParentChild');

  return ParentChild.findOneAndUpdate(
    { parent_user_id: parentUser._id, student_id: studentProfile._id },
    { $setOnInsert: { parent_user_id: parentUser._id, student_id: studentProfile._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function upsertSampleLearningContent(studentProfile: any, tutor: any) {
  const Curriculum = mongoose.model('Curriculum');
  const CurriculumModule = mongoose.model('CurriculumModule');
  const Lesson = mongoose.model('Lesson');
  const LessonExercise = mongoose.model('LessonExercise');
  const StudentProgress = mongoose.model('StudentProgress');
  const TopicMastery = mongoose.model('TopicMastery');
  const LessonRecommendation = mongoose.model('LessonRecommendation');

  const curriculum = await Curriculum.findOneAndUpdate(
    {
      student_id: studentProfile._id,
      title: { $in: [SAMPLE_CONTENT.curriculumTitle, ...LEGACY_SAMPLE_CURRICULUM_TITLES] },
    },
    {
      $set: {
        title: SAMPLE_CONTENT.curriculumTitle,
        input_level: DEMO_STUDENT_PROFILE.self_assessed_level,
        ai_summary:
          'Giáo trình mẫu tối thiểu để trình diễn bài học và bài kiểm tra mà không cần kết nối nhà cung cấp AI.',
        target_goal: 'Củng cố nền tảng đại số lớp 8 và luyện bài kiểm tra cuối buổi.',
        estimated_total_sessions: 1,
        status: 'active',
        created_by_ai: false,
      },
      $setOnInsert: {
        student_id: studentProfile._id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const module = await CurriculumModule.findOneAndUpdate(
    { curriculum_id: curriculum._id, order_index: 1 },
    {
      $set: {
        module_title: SAMPLE_CONTENT.moduleTitle,
        module_description: 'Ôn điều kiện xác định và kỹ thuật rút gọn phân thức đại số.',
        topic: SAMPLE_CONTENT.topic,
        estimated_sessions: 1,
        target_mastery: 0.75,
        status: 'in_progress',
      },
      $setOnInsert: {
        curriculum_id: curriculum._id,
        order_index: 1,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const lesson = await Lesson.findOneAndUpdate(
    { curriculum_id: curriculum._id, module_id: module._id, order_index: 1 },
    {
      $set: {
        student_id: studentProfile._id,
        lesson_title: SAMPLE_CONTENT.lessonTitle,
        lesson_date: null,
        theory_content: [
          '# Phân thức đại số',
          '![Hình minh họa phân thức đại số](/lessons/illustrations/algebra-fraction.svg)',
          'Phân thức đại số là biểu thức có dạng $\\dfrac{A}{B}$, trong đó $B \\ne 0$.',
          'Khi rút gọn, hãy phân tích tử và mẫu thành nhân tử rồi triệt tiêu nhân tử chung hợp lệ.',
          '**Lưu ý:** luôn xác định điều kiện xác định trước khi rút gọn.',
        ].join('\n'),
        lesson_objective: 'Học sinh biết tìm điều kiện xác định và rút gọn phân thức đại số đơn giản.',
        ai_tutor_id: tutor?._id ?? null,
        estimated_minutes: 30,
        // 'available' để recommendation service chọn được bài này
        status: 'available',
      },
      $setOnInsert: {
        curriculum_id: curriculum._id,
        module_id: module._id,
        order_index: 1,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  for (const exercise of SAMPLE_CONTENT.exercises) {
    await LessonExercise.findOneAndUpdate(
      { lesson_id: lesson._id, order_index: exercise.order_index },
      {
        $set: {
          topic: exercise.topic,
          difficulty_level: exercise.difficulty_level,
          question_text: exercise.question_text,
          answer_type: exercise.answer_type,
          choices: exercise.choices,
          correct_answer: exercise.correct_answer,
          solution_steps: exercise.solution_steps,
          explanation: exercise.explanation,
        },
        $setOnInsert: {
          lesson_id: lesson._id,
          order_index: exercise.order_index,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  // ── Module bổ sung: Số mũ, Hàm số, Biểu thức đơn giản ──────────────────
  const extraModule = await CurriculumModule.findOneAndUpdate(
    { curriculum_id: curriculum._id, order_index: EXTRA_LESSONS_MODULE.orderIndex },
    {
      $set: {
        module_title: EXTRA_LESSONS_MODULE.moduleTitle,
        module_description: EXTRA_LESSONS_MODULE.moduleDescription,
        topic: EXTRA_LESSONS_MODULE.topic,
        stage: EXTRA_LESSONS_MODULE.stage,
        estimated_sessions: EXTRA_LESSONS_MODULE.lessons.length,
        target_mastery: 0.75,
        status: 'available',
      },
      $setOnInsert: {
        curriculum_id: curriculum._id,
        order_index: EXTRA_LESSONS_MODULE.orderIndex,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  let extraLessonCount = 0;
  for (const [index, lessonData] of EXTRA_LESSONS_MODULE.lessons.entries()) {
    const extraLesson = await Lesson.findOneAndUpdate(
      { curriculum_id: curriculum._id, module_id: extraModule._id, order_index: index + 1 },
      {
        $set: {
          student_id: studentProfile._id,
          lesson_title: lessonData.lessonTitle,
          lesson_date: null,
          theory_content: lessonData.theory,
          lesson_objective: lessonData.objective,
          ai_tutor_id: tutor?._id ?? null,
          estimated_minutes: 30,
          status: 'available',
        },
        $setOnInsert: {
          curriculum_id: curriculum._id,
          module_id: extraModule._id,
          order_index: index + 1,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    extraLessonCount += 1;

    for (const exercise of lessonData.exercises) {
      await LessonExercise.findOneAndUpdate(
        { lesson_id: extraLesson._id, order_index: exercise.order_index },
        {
          $set: {
            topic: exercise.topic,
            difficulty_level: exercise.difficulty_level,
            question_text: exercise.question_text,
            answer_type: exercise.answer_type,
            choices: exercise.choices,
            correct_answer: exercise.correct_answer,
            solution_steps: exercise.solution_steps,
            explanation: exercise.explanation,
          },
          $setOnInsert: {
            lesson_id: extraLesson._id,
            order_index: exercise.order_index,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  }

  await StudentProgress.findOneAndUpdate(
    { student_id: studentProfile._id, curriculum_id: curriculum._id },
    {
      $set: {
        total_lessons: 1 + extraLessonCount,
        completed_lessons: 0,
        completion_percentage: 0,
        average_quiz_score: null,
        total_study_time_minutes: 0,
        current_streak_days: 0,
        longest_streak_days: 0,
        last_study_date: null,
        ai_progress_summary:
          'Học sinh đã có lộ trình mẫu và sẵn sàng làm bài kiểm tra cuối buổi.',
        predicted_improvement: 0.12,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await TopicMastery.findOneAndUpdate(
    { student_id: studentProfile._id, topic: SAMPLE_CONTENT.topic, grade_level: DEMO_STUDENT_PROFILE.grade_level },
    {
      $set: {
        // Thang 0-100 (%) — khớp với lesson/assessment service và ngưỡng recommendation
        mastery_level: 35,
        total_attempts: 0,
        correct_attempts: 0,
        strength_label: 'can_luyen_tap',
        last_practiced_at: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const recommendedDate = getSeedRecommendedDate();

  await LessonRecommendation.findOneAndUpdate(
    { student_id: studentProfile._id, lesson_id: lesson._id, recommended_date: recommendedDate },
    {
      $set: {
        recommendation_type: 'next_lesson',
        reason:
          'Bài học mẫu để kiểm thử trang tổng quan, chi tiết bài học và luồng làm bài kiểm tra.',
        // Cùng thang với recommendation service (10/8/7) để không đè khuyến nghị thích ứng
        priority: 10,
        is_completed: false,
      },
      $setOnInsert: {
        student_id: studentProfile._id,
        lesson_id: lesson._id,
        recommended_date: recommendedDate,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { curriculum, module, lesson, exerciseCount: SAMPLE_CONTENT.exercises.length };
}

async function upsertSampleContentLibraryTemplates(users: Record<string, any>, studentProfile: any) {
  const CurriculumTemplate = mongoose.model('CurriculumTemplate');
  const CurriculumModuleTemplate = mongoose.model('CurriculumModuleTemplate');
  const LessonTemplate = mongoose.model('LessonTemplate');
  const ExerciseTemplate = mongoose.model('ExerciseTemplate');
  const ContentAssignment = mongoose.model('ContentAssignment');
  const StudentAssignedContent = mongoose.model('StudentAssignedContent');

  const teacherUser = users['teacher@mathai.vn'];
  const publishedAt = new Date('2026-01-01T00:00:00.000Z');

  const curriculumTemplate = await CurriculumTemplate.findOneAndUpdate(
    { title: SAMPLE_CONTENT_LIBRARY.curriculumTitle, subject: SAMPLE_CONTENT_LIBRARY.subject },
    {
      $set: {
        description:
          'Dữ liệu mẫu để kiểm thử thư viện nội dung và các trang chi tiết cho Toán lớp 8.',
        grade_level: SAMPLE_CONTENT_LIBRARY.gradeLevel,
        age_group: SAMPLE_CONTENT_LIBRARY.ageGroup,
        subject: SAMPLE_CONTENT_LIBRARY.subject,
        difficulty_level: SAMPLE_CONTENT_LIBRARY.difficultyLevel,
        target_goal: 'Giúp học sinh nhận biết điều kiện xác định và rút gọn phân thức đại số cơ bản.',
        estimated_total_sessions: 1,
        status: 'published',
        created_by: teacherUser._id,
        created_by_role: 'teacher',
        source: 'manual',
        ai_prompt: SAMPLE_CONTENT_LIBRARY.marker,
        ai_model: null,
        tokens_input: 0,
        tokens_output: 0,
        published_at: publishedAt,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const moduleTemplate = await CurriculumModuleTemplate.findOneAndUpdate(
    { curriculum_template_id: curriculumTemplate._id, order_index: 1 },
    {
      $set: {
        module_title: SAMPLE_CONTENT_LIBRARY.moduleTitle,
        module_description: 'Ôn tập khái niệm, điều kiện xác định và phép rút gọn phân thức.',
        topic: SAMPLE_CONTENT_LIBRARY.topic,
        estimated_sessions: 1,
        target_mastery: 0.75,
      },
      $setOnInsert: {
        curriculum_template_id: curriculumTemplate._id,
        order_index: 1,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const lessonTemplate = await LessonTemplate.findOneAndUpdate(
    { lesson_title: SAMPLE_CONTENT_LIBRARY.lessonTitle, created_by: teacherUser._id },
    {
      $set: {
        curriculum_template_id: curriculumTemplate._id,
        module_template_id: moduleTemplate._id,
        theory_content:
          'Phân thức đại số có dạng A/B với B khác 0. Để rút gọn, hãy phân tích tử và mẫu thành nhân tử rồi triệt tiêu nhân tử chung, đồng thời luôn ghi điều kiện xác định.',
        lesson_objective: 'Học sinh xác định được điều kiện mẫu khác 0 và rút gọn phân thức bằng nhân tử chung.',
        grade_level: SAMPLE_CONTENT_LIBRARY.gradeLevel,
        age_group: SAMPLE_CONTENT_LIBRARY.ageGroup,
        topic: SAMPLE_CONTENT_LIBRARY.topic,
        difficulty_level: SAMPLE_CONTENT_LIBRARY.difficultyLevel,
        estimated_minutes: 35,
        order_index: 1,
        status: 'published',
        created_by: teacherUser._id,
        created_by_role: 'teacher',
        source: 'manual',
        ai_prompt: SAMPLE_CONTENT_LIBRARY.marker,
        ai_model: null,
        tokens_input: 0,
        tokens_output: 0,
        published_at: publishedAt,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  for (const exercise of SAMPLE_CONTENT_LIBRARY.exercises) {
    await ExerciseTemplate.findOneAndUpdate(
      { lesson_template_id: lessonTemplate._id, order_index: exercise.order_index },
      {
        $set: {
          topic: exercise.topic,
          difficulty_level: exercise.difficulty_level,
          question_text: exercise.question_text,
          answer_type: exercise.answer_type,
          choices: exercise.choices,
          correct_answer: exercise.correct_answer,
          solution_steps: exercise.solution_steps,
          explanation: exercise.explanation,
          grade_level: SAMPLE_CONTENT_LIBRARY.gradeLevel,
          math_topic: SAMPLE_CONTENT_LIBRARY.topic,
          math_topic_path: SAMPLE_CONTENT_LIBRARY.mathTopicPath,
          question_type: exercise.answer_type === 'multiple_choice' ? 'multiple_choice' : 'calculation',
          source: 'manual',
          question_bank_status: 'published',
          max_points: 1,
          estimated_minutes: 5,
          learning_objectives: [{ objective_id: 'MATH8-ALG-FRACTION-SIMPLIFY', description: 'Rút gọn phân thức đại số cơ bản' }],
          prerequisite_objectives: [{ objective_id: 'MATH8-ALG-FACTORING', description: 'Phân tích đa thức thành nhân tử' }],
          tags: ['demo-dev', 'content-library', SAMPLE_CONTENT_LIBRARY.marker],
        },
        $setOnInsert: {
          lesson_template_id: lessonTemplate._id,
          order_index: exercise.order_index,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const templateSnapshot = {
    title: SAMPLE_CONTENT_LIBRARY.assignmentTitle,
    description: 'Assignment mẫu dev/local gắn với lesson template đã published.',
    grade_level: SAMPLE_CONTENT_LIBRARY.gradeLevel,
    difficulty_level: SAMPLE_CONTENT_LIBRARY.difficultyLevel,
    topic: SAMPLE_CONTENT_LIBRARY.topic,
    status: 'published',
    published_at: publishedAt,
  };

  const assignment = await ContentAssignment.findOneAndUpdate(
    { template_type: 'lesson_template', template_id: lessonTemplate._id, target_type: 'student', target_id: studentProfile._id, assigned_by: teacherUser._id },
    {
      $set: {
        status: 'active',
        auto_apply_new_students: false,
        materialization_strategy: 'on_demand',
        template_snapshot: templateSnapshot,
        recipient_mapping: {
          class_id: null,
          student_ids: [studentProfile._id],
          applied_student_ids: [studentProfile._id],
        },
      },
      $setOnInsert: {
        template_type: 'lesson_template',
        template_id: lessonTemplate._id,
        target_type: 'student',
        target_id: studentProfile._id,
        assigned_by: teacherUser._id,
        assigned_by_role: 'teacher',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await StudentAssignedContent.findOneAndUpdate(
    { assignment_id: assignment._id, student_id: studentProfile._id },
    {
      $set: {
        class_id: null,
        template_type: 'lesson_template',
        template_id: lessonTemplate._id,
        status: 'active',
        materialization_strategy: 'on_demand',
        assigned_by: teacherUser._id,
        template_snapshot: templateSnapshot,
      },
      $setOnInsert: {
        assignment_id: assignment._id,
        student_id: studentProfile._id,
        assigned_at: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { curriculumTemplate, moduleTemplate, lessonTemplate, assignment, exerciseCount: SAMPLE_CONTENT_LIBRARY.exercises.length };
}

async function upsertNotificationTemplates() {
  const NotificationTemplate = mongoose.model('NotificationTemplate');
  const results = [];

  for (const template of DEFAULT_NOTIFICATION_TEMPLATES) {
    const result = await NotificationTemplate.findOneAndUpdate(
      { template_id: template.template_id },
      { $set: template },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    results.push(result);
  }

  return results;
}

export async function seed() {
  if (isProduction && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    throw new Error('Seed MongoDB demo/dev bị chặn trong NODE_ENV=production. Chỉ chạy cho local/dev/staging.');
  }

  assertUniqueSeedKeys();

  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  console.log(`Connected to MongoDB database "${DB_NAME}"`);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const tutors = await upsertAITutors();
  await upsertSystemSettings();
  const users = await upsertDemoUsers(passwordHash);

  const defaultTutor = tutors.find((tutor: any) => tutor.code === 'co_lan') ?? tutors[0];
  const studentProfile = await upsertStudentProfile(users['student@mathai.vn'], defaultTutor);
  await upsertStudentTheme(studentProfile);
  await upsertParentChild(users['parent@mathai.vn'], studentProfile);
  const content = await upsertSampleLearningContent(studentProfile, defaultTutor);
  const contentLibrary = await upsertSampleContentLibraryTemplates(users, studentProfile);
  const notificationTemplates = await upsertNotificationTemplates();

  console.log(`Upserted ${tutors.length} AI tutors`);
  console.log(`Upserted ${DEMO_USERS.length} demo users with real bcrypt password hashes`);
  console.log('Upserted demo student profile, theme preference and parent-child link');
  console.log(
    `Upserted sample curriculum "${content.curriculum.title}", lesson "${content.lesson.lesson_title}" and ${content.exerciseCount} exercises`
  );
  console.log(
    `Upserted content library curriculum template "${contentLibrary.curriculumTemplate.title}", lesson template "${contentLibrary.lessonTemplate.lesson_title}", assignment ${contentLibrary.assignment._id} and ${contentLibrary.exerciseCount} exercise templates`
  );
  console.log(`Upserted ${notificationTemplates.length} notification templates`);
  console.log(`Demo emails: ${getDemoEmails().join(', ')}`);
  console.log(`Demo password: ${DEMO_PASSWORD_ENV ? 'from SEED_DEMO_PASSWORD' : DEFAULT_DEMO_PASSWORD} (dev/staging only)`);

  await mongoose.disconnect();
  console.log('Seed complete!');
}

if (require.main === module) {
  seed().catch(async (err) => {
    console.error('Seed failed:', err);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
}
