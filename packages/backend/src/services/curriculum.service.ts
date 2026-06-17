
import {
  AssessmentAttempt,
  Curriculum,
  CurriculumModule,
  JsonValue,
  Lesson,
  LessonExercise,
  StudentProfile,
} from '../types';
import { AssessmentAttemptRepository, AssessmentAttemptModel, AssessmentModel } from '../models/assessment.model';
import { CurriculumModuleRepository, CurriculumRepository, CurriculumModel } from '../models/curriculum.model';
import { LessonExerciseRepository, LessonRepository, LessonModel } from '../models/lesson.model';
import { StudentProfileRepository } from '../models/student.model';
import { mapModulesToStages } from '../utils/curriculum-stages';
import { aiService } from './ai.service';
import {
  GRAPH_BLOCK_GUIDELINES,
  MATH_FORMAT_JSON_GUIDELINES,
} from '../constants/math-format';
import { NotFoundError, ValidationError } from '../utils/errors';

interface GenerateCurriculumOptions {
  title?: string;
  total_modules?: number;
  lessons_per_module?: number;
  exercises_per_lesson?: number;
  // Enhanced inputs
  target_goal?: string;
  estimated_weekly_hours?: number;
  skill_strengths?: string[];
  skill_weaknesses?: string[];
  include_end_of_lesson_quiz?: boolean; // quiz 15 phút cuối buổi
}

interface DiagnosticAnalysis {
  strengths: string[];
  weaknesses: string[];
  recommendations?: string;
}

interface CurriculumExerciseDraft {
  exercise_number: number;
  exercise_type: 'multiple_choice' | 'short_answer' | 'essay';
  question_text: string;
  options?: string[] | null;
  correct_answer?: string | null;
  explanation?: string | null;
  hints?: string[] | null;
  difficulty_level: 'easy' | 'medium' | 'hard';
  points?: number;
}

interface CurriculumLessonDraft {
  title: string;
  description?: string | null;
  content: string;
  lesson_type: 'theory' | 'practice' | 'mixed';
  difficulty_level: 'easy' | 'medium' | 'hard';
  order_index: number;
  estimated_duration_minutes?: number;
  exercises: CurriculumExerciseDraft[];
  // Quiz 15 phút cuối buổi
  end_of_lesson_quiz?: {
    title: string;
    duration_minutes: number; // always 15
    questions: CurriculumExerciseDraft[];
  } | null;
}

interface CurriculumModuleDraft {
  title: string;
  description?: string | null;
  order_index: number;
  lessons: CurriculumLessonDraft[];
}

interface GeneratedCurriculumDraft {
  title: string;
  description?: string | null;
  difficulty_level: 'easy' | 'medium' | 'hard';
  modules: CurriculumModuleDraft[];
}

export interface CurriculumLessonWithExercises extends Lesson {
  exercises: LessonExercise[];
}

export interface CurriculumModuleWithLessons extends CurriculumModule {
  lessons: CurriculumLessonWithExercises[];
}

export interface CurriculumDetail extends Curriculum {
  modules: CurriculumModuleWithLessons[];
}

export interface CurriculumDetailWithLessonList extends Curriculum {
  modules: Array<CurriculumModule & { lessons: Lesson[] }>;
}

export interface ModuleDetail extends CurriculumModule {
  lessons: Lesson[];
}

interface DiagnosticContext {
  percentage: number | null;
  strengths: string[];
  weaknesses: string[];
  ai_feedback: string | null;
}

const CURRICULUM_AI_MODEL = 'gpt-4o-mini';
const DEFAULT_FALLBACK_TOPICS = [
  'Số học và phép tính cơ bản',
  'Phân số và số thập phân',
  'Tỉ lệ, phần trăm và bài toán thực tế',
  'Đại số nền tảng',
  'Hình học cơ bản',
  'Giải bài toán có lời văn',
];

export class CurriculumService {
  private readonly curriculumRepo: CurriculumRepository;
  private readonly moduleRepo: CurriculumModuleRepository;
  private readonly lessonRepo: LessonRepository;
  private readonly exerciseRepo: LessonExerciseRepository;
  private readonly attemptRepo: AssessmentAttemptRepository;
  private readonly studentRepo: StudentProfileRepository;

  constructor() {
    this.curriculumRepo = new CurriculumRepository();
    this.moduleRepo = new CurriculumModuleRepository();
    this.lessonRepo = new LessonRepository();
    this.exerciseRepo = new LessonExerciseRepository();
    this.attemptRepo = new AssessmentAttemptRepository();
    this.studentRepo = new StudentProfileRepository();
  }

  public async generateCurriculum(
    studentId: string,
    options: GenerateCurriculumOptions
  ): Promise<CurriculumDetail> {
    const profile = await this.getStudentProfileOrThrow(studentId);
    const diagnostic = await this.getLatestDiagnosticContext(studentId);
    const totalModules = options.total_modules ?? 4;
    const lessonsPerModule = options.lessons_per_module ?? 4;
    const exercisesPerLesson = options.exercises_per_lesson ?? 5;
    const prompt = this.buildGeneratePrompt(profile, diagnostic, {
      title: options.title,
      total_modules: totalModules,
      lessons_per_module: lessonsPerModule,
      exercises_per_lesson: exercisesPerLesson,
      target_goal: options.target_goal,
      estimated_weekly_hours: options.estimated_weekly_hours,
      skill_strengths: options.skill_strengths,
      skill_weaknesses: options.skill_weaknesses,
      include_end_of_lesson_quiz: options.include_end_of_lesson_quiz,
    });

    const startedAt = Date.now();
    let draft: GeneratedCurriculumDraft | null = null;
    let rawResponse = '';
    let tokensInput = 0;
    let tokensOutput = 0;

    try {
      const generationResult = await aiService.generateJSON<GeneratedCurriculumDraft>(
        'Bạn là chuyên gia giáo dục toán học tại Việt Nam. Nhiệm vụ: tạo giáo trình cá nhân hóa cho học sinh.',
        prompt,
        { temperature: 0.4, model: CURRICULUM_AI_MODEL }
      );

      draft = this.normalizeGeneratedCurriculum(generationResult.data, {
        title: options.title,
        total_modules: totalModules,
        lessons_per_module: lessonsPerModule,
        exercises_per_lesson: exercisesPerLesson,
      });
      rawResponse = JSON.stringify(draft);
      tokensInput = generationResult.tokensUsed.input;
      tokensOutput = generationResult.tokensUsed.output;
    } catch (error: unknown) {
      draft = this.buildFallbackCurriculum(profile, diagnostic, {
        title: options.title,
        total_modules: totalModules,
        lessons_per_module: lessonsPerModule,
        exercises_per_lesson: exercisesPerLesson,
      });
      rawResponse = JSON.stringify({ source: 'deterministic_fallback', ...draft });

      await aiService.logGeneration(
        studentId,
        'curriculum_generate',
        prompt,
        rawResponse,
        CURRICULUM_AI_MODEL,
        tokensInput,
        tokensOutput,
        Date.now() - startedAt,
        'error',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    if (!draft) {
      throw new ValidationError('Không tạo được giáo trình cá nhân hóa');
    }

    const createdCurriculum = await this.curriculumRepo.transaction(async (session) => {
      const activeCurricula = await this.curriculumRepo.findActiveByStudent(studentId);

      for (const activeCurriculum of activeCurricula) {
        await this.curriculumRepo.update(
          activeCurriculum.id,
          {
            status: 'archived',
        } as any,
          session
        );
      }

      const estimatedTotalSessions = draft.modules.reduce((sum, module) => sum + module.lessons.length, 0);
      const curriculum = await this.curriculumRepo.create(
        {
          student_id: studentId,
          title: draft.title,
          input_level: draft.difficulty_level,
          ai_summary: draft.description ?? 'Giáo trình toán học cá nhân hóa được tạo bởi AI.',
          target_goal: this.buildTargetGoal(diagnostic),
          estimated_total_sessions: estimatedTotalSessions,
          status: 'active',
          created_by_ai: true,
        } as any,
        session
      );

      const modules: CurriculumModuleWithLessons[] = [];

      // Gán giai đoạn lộ trình (Module 3): GĐ1 nền tảng → … → GĐ4 luyện đề.
      const stageByPosition = mapModulesToStages(draft.modules.length);

      for (const [moduleIndex, moduleDraft] of draft.modules.entries()) {
        const module = await this.moduleRepo.create(
          {
            curriculum_id: curriculum.id,
            module_title: moduleDraft.title,
            module_description: moduleDraft.description ?? null,
            topic: this.extractModuleTopic(moduleDraft.title, moduleDraft.description),
            order_index: moduleDraft.order_index,
            stage: stageByPosition[moduleIndex] ?? null,
            estimated_sessions: moduleDraft.lessons.length,
            target_mastery: null,
            status: moduleDraft.order_index === 1 ? 'active' : 'locked',
          } as any,
          session
        );

        const lessons: CurriculumLessonWithExercises[] = [];

        for (const lessonDraft of moduleDraft.lessons) {
          const isInActiveModule = moduleDraft.order_index === 1;
          const lesson = await this.lessonRepo.create(
            {
              curriculum_id: curriculum.id,
              module_id: module.id,
              student_id: studentId,
              lesson_title: lessonDraft.title,
              lesson_date: null,
              theory_content: this.buildLessonContent(lessonDraft),
              lesson_objective: lessonDraft.description ?? null,
              ai_tutor_id: profile.selected_tutor_id ?? null,
              estimated_minutes: lessonDraft.estimated_duration_minutes ?? 30,
              order_index: lessonDraft.order_index,
              status: isInActiveModule ? 'available' : 'scheduled',
            } as any,
            session
          );

          const exercises: LessonExercise[] = [];

          for (const exerciseDraft of lessonDraft.exercises) {
            const exercise = await this.exerciseRepo.create(
              {
                lesson_id: lesson.id,
                topic: module.topic,
                difficulty_level: exerciseDraft.difficulty_level,
                question_text: exerciseDraft.question_text,
                answer_type: this.mapExerciseType(exerciseDraft.exercise_type),
                choices: (exerciseDraft.options ?? null) as JsonValue,
                correct_answer: exerciseDraft.correct_answer ?? null,
                solution_steps: (exerciseDraft.hints ?? null) as JsonValue,
                explanation: exerciseDraft.explanation ?? null,
                order_index: exerciseDraft.exercise_number,
              } as any,
              session
            );

            exercises.push(exercise as any);
          }

          // Lưu quiz cuối buổi (nếu có) như exercise với order_index từ 100+
          if (lessonDraft.end_of_lesson_quiz && lessonDraft.end_of_lesson_quiz.questions.length > 0) {
            for (const quizQ of lessonDraft.end_of_lesson_quiz.questions) {
              const quizExercise = await this.exerciseRepo.create(
                {
                  lesson_id: lesson.id,
                  topic: `quiz:${module.topic}`,
                  difficulty_level: quizQ.difficulty_level,
                  question_text: quizQ.question_text,
                  answer_type: this.mapExerciseType(quizQ.exercise_type),
                  choices: (quizQ.options ?? null) as JsonValue,
                  correct_answer: quizQ.correct_answer ?? null,
                  solution_steps: (quizQ.hints ?? null) as JsonValue,
                  explanation: quizQ.explanation ?? null,
                  order_index: 100 + quizQ.exercise_number,
                } as any,
                session
              );
              exercises.push(quizExercise as any);
            }
          }

          lessons.push({
            ...(typeof (lesson as any).toObject === 'function' ? (lesson as any).toObject() : lesson),
            exercises: exercises.map((ex) => (typeof (ex as any).toObject === 'function' ? (ex as any).toObject() : ex)),
          } as any);
        }

        modules.push({
          ...(typeof (module as any).toObject === 'function' ? (module as any).toObject() : module),
          lessons,
        } as any);
      }

      return {
        ...(typeof (curriculum as any).toObject === 'function' ? (curriculum as any).toObject() : curriculum),
        modules,
      } as any;
    });

    await aiService.logGeneration(
      studentId,
      'curriculum_generate',
      prompt,
      rawResponse,
      CURRICULUM_AI_MODEL,
      tokensInput,
      tokensOutput,
      Date.now() - startedAt,
      'success'
    );

    return createdCurriculum;
  }

  public async listCurricula(studentId: string): Promise<Curriculum[]> {
    return (await CurriculumModel.find({ student_id: studentId })
      .sort({ updatedAt: -1 })
      .exec()) as any;
  }

  public async getActiveCurriculum(studentId: string): Promise<(Curriculum & { modules: CurriculumModule[] }) | null> {
    const activeCurricula = await this.curriculumRepo.findActiveByStudent(studentId);
    const activeCurriculum = activeCurricula[0] ?? null;

    if (!activeCurriculum) {
      return null;
    }

    const modules = await this.moduleRepo.findByCurriculumId(activeCurriculum.id);

    return {
      ...(typeof (activeCurriculum as any).toObject === 'function' ? (activeCurriculum as any).toObject() : activeCurriculum),
      modules: modules.map((module) => (typeof (module as any).toObject === 'function' ? (module as any).toObject() : module)),
    } as any;
  }

  public async getCurriculumDetail(
    curriculumId: string,
    studentId: string
  ): Promise<CurriculumDetailWithLessonList> {
    const curriculum = await this.getOwnedCurriculumOrThrow(curriculumId, studentId);
    const modules = await this.moduleRepo.findByCurriculumId(curriculum.id!);
    const moduleIds = modules.map((module) => module.id);

    const lessons = moduleIds.length
      ? ((await LessonModel.find({ module_id: { $in: moduleIds } })
          .sort({ module_id: 1, order_index: 1 })
          .exec()) as any)
      : [];

    const lessonsByModuleId = new Map<string, any[]>();

    for (const lesson of lessons) {
      const moduleId = lesson.module_id;

      if (!moduleId) {
        continue;
      }

      const currentLessons = lessonsByModuleId.get(String(moduleId)) ?? [];
      currentLessons.push(typeof (lesson as any).toObject === 'function' ? (lesson as any).toObject() : lesson);
      lessonsByModuleId.set(String(moduleId), currentLessons);
    }

    return {
      ...(typeof (curriculum as any).toObject === 'function' ? (curriculum as any).toObject() : curriculum),
      modules: modules.map((module) => ({
        ...(typeof (module as any).toObject === 'function' ? (module as any).toObject() : module),
        lessons: lessonsByModuleId.get(String(module.id)) ?? [],
      })),
    } as any;
  }

  public async getModuleDetail(
    curriculumId: string,
    moduleId: string,
    studentId: string
  ): Promise<ModuleDetail> {
    const curriculum = await this.getOwnedCurriculumOrThrow(curriculumId, studentId);
    const module = await this.moduleRepo.findById(moduleId);

    if (!module || String(module.curriculum_id) !== String(curriculum.id)) {
      throw new NotFoundError('Không tìm thấy module');
    }

    const lessons = (await LessonModel.find({ module_id: module.id, curriculum_id: curriculum.id, student_id: studentId })
      .sort({ order_index: 1 })
      .exec()) as any;

    return {
      ...(module.toObject ? module.toObject() : module),
      lessons: lessons.map((lesson: any) => (lesson.toObject ? lesson.toObject() : lesson)),
    } as any;
  }

  private async getStudentProfileOrThrow(studentId: string): Promise<StudentProfile> {
    const profile = await this.studentRepo.findById(studentId);

    if (!profile) {
      throw new NotFoundError('Không tìm thấy hồ sơ học sinh');
    }

    return profile as any;
  }

  private async getOwnedCurriculumOrThrow(curriculumId: string, studentId: string): Promise<Curriculum> {
    const curriculum = await this.curriculumRepo.findById(curriculumId);

    if (!curriculum || String(curriculum.student_id) !== String(studentId)) {
      throw new NotFoundError('Không tìm thấy giáo trình');
    }

    return curriculum as any;
  }

  private async getLatestDiagnosticContext(studentId: string): Promise<DiagnosticContext> {
    const latestAttempt = await AssessmentAttemptModel.findOne({
      student_id: studentId,
      status: 'graded',
    }).sort({ updatedAt: -1 }).exec();

    // We need to verify the assessment is diagnostic type
    if (latestAttempt) {
      const assessment = await AssessmentModel.findById(latestAttempt.assessment_id).exec();
      if (!assessment || assessment.type !== 'diagnostic') {
        return {
          percentage: null,
          strengths: [],
          weaknesses: [],
          ai_feedback: null,
        };
      }
    }

    if (!latestAttempt) {
      return {
        percentage: null,
        strengths: [],
        weaknesses: [],
        ai_feedback: null,
      };
    }

    const aiAnalysis = this.parseDiagnosticAnalysis(latestAttempt.ai_analysis);

    return {
      percentage: latestAttempt.percentage !== null ? Number(latestAttempt.percentage) : null,
      strengths: aiAnalysis.strengths,
      weaknesses: aiAnalysis.weaknesses,
      ai_feedback: latestAttempt.ai_feedback,
    };
  }

  private parseDiagnosticAnalysis(value: JsonValue | null): DiagnosticAnalysis {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        strengths: [],
        weaknesses: [],
        recommendations: '',
      };
    }

    const raw = value as Record<string, unknown>;

    return {
      strengths: Array.isArray(raw.strengths)
        ? raw.strengths.filter((item): item is string => typeof item === 'string')
        : [],
      weaknesses: Array.isArray(raw.weaknesses)
        ? raw.weaknesses.filter((item): item is string => typeof item === 'string')
        : [],
      recommendations: typeof raw.recommendations === 'string' ? raw.recommendations : '',
    };
  }

  private buildGeneratePrompt(
    profile: StudentProfile,
    diagnostic: DiagnosticContext,
    options: Required<Pick<GenerateCurriculumOptions, 'total_modules' | 'lessons_per_module' | 'exercises_per_lesson'>> &
      Pick<GenerateCurriculumOptions, 'title' | 'target_goal' | 'estimated_weekly_hours' | 'skill_strengths' | 'skill_weaknesses' | 'include_end_of_lesson_quiz'>
  ): string {
    const gradeLevel = profile.grade_level ?? 'chưa xác định';
    const strengths = (options.skill_strengths && options.skill_strengths.length > 0)
      ? options.skill_strengths.join(', ')
      : (diagnostic.strengths.length > 0 ? diagnostic.strengths.join(', ') : 'Chưa có dữ liệu');
    const weaknesses = (options.skill_weaknesses && options.skill_weaknesses.length > 0)
      ? options.skill_weaknesses.join(', ')
      : (diagnostic.weaknesses.length > 0 ? diagnostic.weaknesses.join(', ') : 'Chưa có dữ liệu');
    const aiFeedback = diagnostic.ai_feedback ?? 'Chưa có nhận xét từ bài kiểm tra đầu vào';
    const percentage = diagnostic.percentage !== null ? `${diagnostic.percentage}%` : 'Chưa có dữ liệu';
    const requestedTitle = options.title ? `- Tiêu đề ưu tiên: ${options.title}` : '- Tiêu đề ưu tiên: AI tự đặt tên phù hợp';
    const targetGoal = options.target_goal ? `- Mục tiêu cải thiện: ${options.target_goal}` : '';
    const weeklyHours = options.estimated_weekly_hours ? `- Thời lượng học dự kiến: ${options.estimated_weekly_hours} giờ/tuần` : '';
    const includeQuiz = options.include_end_of_lesson_quiz !== false; // default true

    const quizInstruction = includeQuiz
      ? [
          '',
          'QUIZ CUỐI BUỔI (BẮT BUỘC):',
          '- Mỗi bài học PHẢI có trường "end_of_lesson_quiz"',
          '- Quiz 15 phút, 5 câu hỏi (3 multiple_choice + 2 short_answer)',
          '- Nội dung quiz bao quát kiến thức đã học trong bài đó',
          '- Độ khó vừa phải, kiểm tra hiểu biết chứ không gài bẫy',
        ].join('\n')
      : '';

    const quizExample = includeQuiz
      ? `,
                  "end_of_lesson_quiz": {
                    "title": "Quiz cuối buổi - Bài 1",
                    "duration_minutes": 15,
                    "questions": [
                      {
                        "exercise_number": 1,
                        "exercise_type": "multiple_choice",
                        "question_text": "...",
                        "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
                        "correct_answer": "...",
                        "explanation": "...",
                        "difficulty_level": "medium",
                        "points": 2
                      }
                    ]
                  }`
      : '';

    return [
      'Thông tin học sinh:',
      `- Lớp: ${gradeLevel}`,
      `- Học lực đầu vào: ${profile.initial_classification ?? 'chưa phân loại'}`,
      `- Kết quả kiểm tra đầu vào: ${percentage}`,
      `- Kỹ năng mạnh: ${strengths}`,
      `- Kỹ năng yếu: ${weaknesses}`,
      `- Nhận xét: ${aiFeedback}`,
      '',
      'QUY CHUẨN TOÁN HỌC VÀ CẤP LỚP:',
      MATH_FORMAT_JSON_GUIDELINES,
      GRAPH_BLOCK_GUIDELINES,
      '- Nội dung phải đúng chương trình/lứa tuổi của lớp học sinh theo GDPT 2018; nếu cần ôn lớp dưới thì ghi rõ là phần ôn nền tảng, không biến thành nội dung chính của giáo trình lớp cao.',
      '- Với học sinh lớp 10 trở lên, không tạo giáo trình chỉ xoay quanh kiến thức lớp 5-7 như cộng trừ phân số đơn giản, số học cơ bản hoặc bài toán quá sơ cấp.',
      '',
      'Yêu cầu:',
      requestedTitle,
      targetGoal,
      weeklyHours,
      `- Tạo ${options.total_modules} chương/module`,
      `- Mỗi module có ${options.lessons_per_module} bài học`,
      `- Mỗi bài học có ${options.exercises_per_lesson} bài tập`,
      '- Ưu tiên bổ sung kiến thức ở điểm yếu',
      '- Sắp xếp từ dễ đến khó theo một lộ trình học rõ ràng: ôn nền tảng cần thiết → kiến thức chính → luyện tập → vận dụng.',
      '- Bài học kiểu: theory (lý thuyết), practice (thực hành), mixed (kết hợp)',
      '- Bài tập đa dạng: multiple_choice, short_answer, essay',
      '- Nội dung bài học bằng tiếng Việt, rõ ràng, có cấu trúc markdown',
      '- Mỗi bài học phải có: mục tiêu, mở bài gợi hứng thú, kiến thức trọng tâm, ví dụ mẫu từng bước, lỗi sai thường gặp, bài tập luyện, tóm tắt cuối bài.',
      '- Nội dung phải phù hợp năng lực học sinh: không quá trẻ con, không quá hàn lâm; tăng dần thử thách theo kết quả đầu vào.',
      '- estimated_duration_minutes phải hợp lý theo độ khó: thường 30-45 phút cho cơ bản, 45-60 phút cho nâng cao.',
      '- Nội dung các bài theory cần đủ chi tiết để học sinh tự học',
      quizInstruction,
      '',
      'Trả về JSON format:',
      JSON.stringify(
        {
          title: 'Giáo trình toán lớp X - Cá nhân hóa',
          description: 'Mô tả tổng quan...',
          difficulty_level: 'easy',
          modules: [
            {
              title: 'Chương 1: ...',
              description: '...',
              order_index: 1,
              lessons: [
                {
                  title: 'Bài 1: ...',
                  description: '...',
                  content: 'Nội dung bài học chi tiết bằng markdown...',
                  lesson_type: 'theory',
                  difficulty_level: 'easy',
                  order_index: 1,
                  estimated_duration_minutes: 30,
                  exercises: [
                    {
                      exercise_number: 1,
                      exercise_type: 'multiple_choice',
                      question_text: '...',
                      options: ['A. ...', 'B. ...', 'C. ...', 'D. ...'],
                      correct_answer: '...',
                      explanation: '...',
                      hints: ['Gợi ý 1', 'Gợi ý 2'],
                      difficulty_level: 'easy',
                      points: 1,
                    },
                  ],
                },
              ],
            },
          ],
        },
        null,
        2
      ) + (includeQuiz ? `\n\n(Mỗi lesson cần thêm trường end_of_lesson_quiz như mô tả ở trên)` : ''),
    ].filter(Boolean).join('\n');
  }

  private normalizeGeneratedCurriculum(
    draft: GeneratedCurriculumDraft,
    options: Required<Pick<GenerateCurriculumOptions, 'total_modules' | 'lessons_per_module' | 'exercises_per_lesson'>> &
      Pick<GenerateCurriculumOptions, 'title'>
  ): GeneratedCurriculumDraft {
    if (!draft || !Array.isArray(draft.modules) || draft.modules.length === 0) {
      throw new ValidationError('AI không trả về cấu trúc giáo trình hợp lệ');
    }

    const normalizedModules = draft.modules.slice(0, options.total_modules).map((module, moduleIndex) => ({
      title: module.title?.trim() || `Chương ${moduleIndex + 1}`,
      description: module.description?.trim() || `Nội dung trọng tâm của chương ${moduleIndex + 1}`,
      order_index: moduleIndex + 1,
      lessons: (Array.isArray(module.lessons) ? module.lessons : [])
        .slice(0, options.lessons_per_module)
        .map((lesson, lessonIndex) => ({
          title: lesson.title?.trim() || `Bài ${lessonIndex + 1}`,
          description: lesson.description?.trim() || `Mục tiêu bài học ${lessonIndex + 1}`,
          content: lesson.content?.trim() || 'Nội dung bài học đang được cập nhật.',
          lesson_type: this.normalizeLessonType(lesson.lesson_type),
          difficulty_level: this.normalizeDifficulty(lesson.difficulty_level),
          order_index: lessonIndex + 1,
          estimated_duration_minutes: lesson.estimated_duration_minutes ?? 30,
          exercises: (Array.isArray(lesson.exercises) ? lesson.exercises : [])
            .slice(0, options.exercises_per_lesson)
            .map((exercise, exerciseIndex) => ({
              exercise_number: exerciseIndex + 1,
              exercise_type: this.normalizeExerciseType(exercise.exercise_type),
              question_text:
                exercise.question_text?.trim() || `Bài tập ${exerciseIndex + 1} của ${lesson.title || `bài ${lessonIndex + 1}`}`,
              options:
                exercise.exercise_type === 'multiple_choice' && Array.isArray(exercise.options)
                  ? exercise.options.filter((item): item is string => typeof item === 'string')
                  : null,
              correct_answer: exercise.correct_answer?.trim() || null,
              explanation: exercise.explanation?.trim() || null,
              hints: Array.isArray(exercise.hints)
                ? exercise.hints.filter((item): item is string => typeof item === 'string')
                : null,
              difficulty_level: this.normalizeDifficulty(exercise.difficulty_level),
              points: typeof exercise.points === 'number' ? exercise.points : 1,
            })),
          end_of_lesson_quiz: lesson.end_of_lesson_quiz
            ? {
                title: lesson.end_of_lesson_quiz.title?.trim() || `Tự kiểm tra cuối bài ${lessonIndex + 1}`,
                duration_minutes: 15,
                questions: (Array.isArray(lesson.end_of_lesson_quiz.questions)
                  ? lesson.end_of_lesson_quiz.questions
                  : []
                )
                  .slice(0, 5)
                  .map((exercise, exerciseIndex) => ({
                    exercise_number: exerciseIndex + 1,
                    exercise_type: this.normalizeExerciseType(exercise.exercise_type),
                    question_text:
                      exercise.question_text?.trim() || `Câu tự kiểm tra ${exerciseIndex + 1} của ${lesson.title || `bài ${lessonIndex + 1}`}`,
                    options:
                      exercise.exercise_type === 'multiple_choice' && Array.isArray(exercise.options)
                        ? exercise.options.filter((item): item is string => typeof item === 'string')
                        : null,
                    correct_answer: exercise.correct_answer?.trim() || null,
                    explanation: exercise.explanation?.trim() || null,
                    hints: Array.isArray(exercise.hints)
                      ? exercise.hints.filter((item): item is string => typeof item === 'string')
                      : null,
                    difficulty_level: this.normalizeDifficulty(exercise.difficulty_level),
                    points: typeof exercise.points === 'number' ? exercise.points : 1,
                  })),
              }
            : null,
        })),
    }));

    if (normalizedModules.length !== options.total_modules) {
      throw new ValidationError('Số lượng module AI trả về không đúng yêu cầu');
    }

    for (const module of normalizedModules) {
      if (module.lessons.length !== options.lessons_per_module) {
        throw new ValidationError('Số lượng bài học trong module không đúng yêu cầu');
      }

      for (const lesson of module.lessons) {
        if (lesson.exercises.length !== options.exercises_per_lesson) {
          throw new ValidationError('Số lượng bài tập trong bài học không đúng yêu cầu');
        }

        for (const exercise of lesson.exercises) {
          this.repairMultipleChoiceAnswer(exercise);
        }
        for (const question of lesson.end_of_lesson_quiz?.questions ?? []) {
          this.repairMultipleChoiceAnswer(question);
        }
      }
    }

    return {
      title: options.title?.trim() || draft.title?.trim() || 'Giáo trình toán cá nhân hóa',
      description: draft.description?.trim() || 'Giáo trình học tập cá nhân hóa dựa trên năng lực hiện tại của học sinh.',
      difficulty_level: this.normalizeDifficulty(draft.difficulty_level),
      modules: normalizedModules,
    };
  }

  /**
   * Câu trắc nghiệm chỉ chấm được khi correct_answer trùng đúng một phần tử
   * trong options. Sửa các dạng AI hay trả về: chữ cái đơn ("B"), thiếu
   * tiền tố "B. ", hoặc options không hợp lệ (ít hơn 2 phương án).
   */
  private repairMultipleChoiceAnswer(exercise: {
    exercise_type: 'multiple_choice' | 'short_answer' | 'essay';
    options: string[] | null;
    correct_answer: string | null;
  }): void {
    if (exercise.exercise_type !== 'multiple_choice') return;

    if (!Array.isArray(exercise.options) || exercise.options.length < 2) {
      throw new ValidationError('Câu trắc nghiệm AI trả về thiếu phương án lựa chọn');
    }

    const answer = exercise.correct_answer?.trim() ?? '';
    if (!answer) {
      throw new ValidationError('Câu trắc nghiệm AI trả về thiếu đáp án đúng');
    }
    if (exercise.options.includes(answer)) return;

    // Đáp án dạng chữ cái: "B", "B.", "Đáp án B"
    const letterMatch = answer
      .replace(/^(?:đáp án|dap an)\s*/i, '')
      .match(/^([A-Da-d])\s*[.)]?$/);
    if (letterMatch) {
      const index = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
      if (index < exercise.options.length) {
        exercise.correct_answer = exercise.options[index];
        return;
      }
    }

    // Đáp án thiếu/thừa tiền tố "B. ..." so với options
    const stripPrefix = (value: string) => value.replace(/^[A-Da-d]\s*[.)]\s*/, '').trim();
    const matched = exercise.options.find(
      (option) => stripPrefix(option) === stripPrefix(answer),
    );
    if (matched) {
      exercise.correct_answer = matched;
      return;
    }

    throw new ValidationError('Đáp án trắc nghiệm AI trả về không khớp với phương án nào');
  }

  private normalizeDifficulty(value: string | undefined | null): 'easy' | 'medium' | 'hard' {
    if (value === 'easy' || value === 'medium' || value === 'hard') {
      return value;
    }

    return 'medium';
  }

  private normalizeLessonType(value: string | undefined | null): 'theory' | 'practice' | 'mixed' {
    if (value === 'theory' || value === 'practice' || value === 'mixed') {
      return value;
    }

    return 'mixed';
  }

  private normalizeExerciseType(value: string | undefined | null): 'multiple_choice' | 'short_answer' | 'essay' {
    if (value === 'multiple_choice' || value === 'short_answer' || value === 'essay') {
      return value;
    }

    return 'short_answer';
  }

  private mapExerciseType(value: 'multiple_choice' | 'short_answer' | 'essay'): 'multiple_choice' | 'short_answer' | 'essay' {
    return value;
  }

  private extractModuleTopic(title: string, description?: string | null): string {
    const normalizedTitle = title.replace(/^Chương\s*\d+\s*[:.-]?\s*/i, '').trim();

    if (normalizedTitle) {
      return normalizedTitle.slice(0, 100);
    }

    return (description?.trim() || 'Tổng hợp kiến thức').slice(0, 100);
  }

  private buildTargetGoal(diagnostic: DiagnosticContext): string {
    if (diagnostic.weaknesses.length > 0) {
      return `Củng cố các nội dung còn yếu: ${diagnostic.weaknesses.join(', ')}`;
    }

    if (diagnostic.strengths.length > 0) {
      return `Phát huy thế mạnh hiện có và nâng cao dần độ khó ở các chủ đề: ${diagnostic.strengths.join(', ')}`;
    }

    return 'Xây dựng lộ trình học toán cá nhân hóa từ nền tảng đến nâng cao.';
  }

  private buildLessonContent(lesson: CurriculumLessonDraft): string {
    return [
      `# ${lesson.title}`,
      '',
      lesson.description ?? '',
      '',
      `**Loại bài học:** ${this.lessonTypeLabel(lesson.lesson_type)}`,
      `**Mức độ:** ${this.difficultyLabel(lesson.difficulty_level)}`,
      `**Thời lượng ước tính:** ${lesson.estimated_duration_minutes ?? 30} phút`,
      '',
      lesson.content,
    ]
      .filter((value) => value !== '')
      .join('\n');
  }

  private buildFallbackCurriculum(
    profile: StudentProfile,
    diagnostic: DiagnosticContext,
    options: Required<Pick<GenerateCurriculumOptions, 'total_modules' | 'lessons_per_module' | 'exercises_per_lesson'>> &
      Pick<GenerateCurriculumOptions, 'title'>
  ): GeneratedCurriculumDraft {
    const gradeLevel = typeof profile.grade_level === 'number' ? profile.grade_level : null;
    const topics = this.buildFallbackTopics(gradeLevel, diagnostic, options.total_modules);

    return {
      title: options.title?.trim() || (gradeLevel ? `Giáo trình Toán lớp ${gradeLevel} cá nhân hóa` : 'Giáo trình Toán cá nhân hóa'),
      description: this.buildFallbackSummary(diagnostic),
      difficulty_level: this.inferCurriculumDifficulty(diagnostic),
      modules: Array.from({ length: options.total_modules }, (_, moduleIndex) => {
        const topic = topics[moduleIndex % topics.length];
        return {
          title: `Chương ${moduleIndex + 1}: ${topic}`,
          description: `Củng cố ${topic.toLowerCase()} bằng bài học ngắn, ví dụ mẫu và bài tập thực hành.`,
          order_index: moduleIndex + 1,
          lessons: Array.from({ length: options.lessons_per_module }, (_, lessonIndex) =>
            this.buildFallbackLesson(topic, gradeLevel, moduleIndex, lessonIndex, options.exercises_per_lesson),
          ),
        };
      }),
    };
  }

  private buildFallbackTopics(
    gradeLevel: number | null,
    diagnostic: DiagnosticContext,
    totalModules: number,
  ): string[] {
    const diagnosticTopics = [...diagnostic.weaknesses, ...diagnostic.strengths]
      .map((item) => item.split(':')[0]?.trim())
      .filter((item): item is string => Boolean(item && item.length >= 2));
    const gradeTopics = this.gradeFallbackTopics(gradeLevel);
    const uniqueTopics = Array.from(new Set([...diagnosticTopics, ...gradeTopics, ...DEFAULT_FALLBACK_TOPICS]));
    return uniqueTopics.slice(0, Math.max(totalModules, 1));
  }

  // Chủ đề trọng tâm theo từng lớp, bám chương trình GDPT 2018 môn Toán.
  private gradeFallbackTopics(gradeLevel: number | null): string[] {
    if (gradeLevel === 6) {
      return ['Số tự nhiên', 'Phân số', 'Số thập phân', 'Hình học trực quan'];
    }
    if (gradeLevel === 7) {
      return ['Số hữu tỉ', 'Tỉ lệ thức', 'Biểu thức đại số', 'Đường thẳng song song'];
    }
    if (gradeLevel === 8) {
      return ['Đa thức và hằng đẳng thức', 'Phân thức đại số', 'Phương trình bậc nhất và hàm số bậc nhất', 'Định lí Thalès và tam giác đồng dạng'];
    }
    if (gradeLevel === 9) {
      return ['Căn bậc hai và căn bậc ba', 'Hàm số y = ax² và phương trình bậc hai', 'Hệ phương trình bậc nhất hai ẩn', 'Đường tròn'];
    }
    if (gradeLevel === 10) {
      return ['Mệnh đề và tập hợp', 'Hàm số bậc hai và đồ thị', 'Hệ thức lượng trong tam giác', 'Vectơ'];
    }
    if (gradeLevel === 11) {
      return ['Hàm số lượng giác và phương trình lượng giác', 'Dãy số, cấp số cộng và cấp số nhân', 'Đạo hàm', 'Quan hệ vuông góc trong không gian'];
    }
    if (gradeLevel && gradeLevel >= 12) {
      return ['Ứng dụng đạo hàm và khảo sát hàm số', 'Nguyên hàm và tích phân', 'Phương pháp tọa độ trong không gian Oxyz', 'Xác suất có điều kiện'];
    }
    return DEFAULT_FALLBACK_TOPICS;
  }

  private buildFallbackLesson(
    topic: string,
    gradeLevel: number | null,
    moduleIndex: number,
    lessonIndex: number,
    exercisesPerLesson: number,
  ): CurriculumLessonDraft {
    const lessonNumber = lessonIndex + 1;
    const focus = [
      'Ôn lại khái niệm cốt lõi',
      'Luyện ví dụ mẫu từng bước',
      'Vận dụng vào bài toán quen thuộc',
      'Tổng hợp và tự kiểm tra',
    ][lessonIndex % 4];
    const title = `Bài ${lessonNumber}: ${focus} - ${topic}`;

    return {
      title,
      description: `Học sinh nắm chắc ${topic.toLowerCase()} qua lý thuyết ngắn, ví dụ và bài tập.`,
      content: [
        `## Mục tiêu`,
        `- Hiểu lại phần ${topic.toLowerCase()} ở mức phù hợp với lớp ${gradeLevel ?? 'hiện tại'}.`,
        '- Biết nhận dạng dạng bài thường gặp và chọn bước giải hợp lý.',
        '- Tự kiểm tra bằng bài tập cuối bài.',
        '',
        '## Kiến thức trọng tâm',
        `1. Đọc kỹ đề và xác định dữ kiện liên quan đến ${topic.toLowerCase()}.`,
        '2. Viết lại công thức hoặc quy tắc cần dùng trước khi tính.',
        '3. Giải từng bước, kiểm tra lại kết quả cuối cùng.',
        '',
        '## Ví dụ mẫu',
        `Với một bài toán thuộc chủ đề ${topic.toLowerCase()}, hãy gạch chân dữ kiện chính, chọn phép biến đổi phù hợp, rồi trình bày lời giải theo từng dòng.`,
        '',
        '## Cách tự học',
        '- Làm lại ví dụ mẫu mà không nhìn lời giải.',
        '- Ghi lại lỗi sai nếu tính nhầm hoặc dùng sai quy tắc.',
        '- Hoàn thành toàn bộ bài tập bên dưới trước khi sang bài tiếp theo.',
      ].join('\n'),
      lesson_type: lessonIndex % 3 === 0 ? 'theory' : lessonIndex % 3 === 1 ? 'mixed' : 'practice',
      difficulty_level: moduleIndex === 0 ? 'easy' : moduleIndex < 3 ? 'medium' : 'hard',
      order_index: lessonNumber,
      estimated_duration_minutes: 30,
      exercises: Array.from({ length: exercisesPerLesson }, (_, exerciseIndex) =>
        this.buildFallbackExercise(topic, exerciseIndex, moduleIndex),
      ),
      end_of_lesson_quiz: {
        title: `Tự kiểm tra cuối bài ${lessonNumber}`,
        duration_minutes: 15,
        questions: Array.from({ length: Math.min(5, exercisesPerLesson) }, (_, exerciseIndex) =>
          this.buildFallbackExercise(topic, exerciseIndex, moduleIndex),
        ),
      },
    };
  }

  private buildFallbackExercise(
    topic: string,
    exerciseIndex: number,
    moduleIndex: number,
    offset = 0,
  ): CurriculumExerciseDraft {
    const number = exerciseIndex + 1;
    const isMultipleChoice = exerciseIndex % 2 === 0;

    return {
      exercise_number: offset + number,
      exercise_type: isMultipleChoice ? 'multiple_choice' : 'short_answer',
      question_text: isMultipleChoice
        ? `Câu ${number}: Khi học chủ đề ${topic}, bước nào nên làm đầu tiên để tránh sai sót?`
        : `Câu ${number}: Hãy nêu một quy tắc quan trọng khi giải bài thuộc chủ đề ${topic}.`,
      options: isMultipleChoice
        ? ['Đọc đề và xác định dữ kiện', 'Tính ngay kết quả', 'Bỏ qua đơn vị', 'Chọn đáp án ngẫu nhiên']
        : null,
      correct_answer: isMultipleChoice ? 'Đọc đề và xác định dữ kiện' : 'Đọc đề, xác định dữ kiện và áp dụng đúng quy tắc.',
      explanation: isMultipleChoice
        ? 'Đọc đề và xác định dữ kiện giúp chọn đúng công thức, tránh tính nhầm.'
        : 'Một lời giải tốt cần bắt đầu từ dữ kiện, sau đó mới áp dụng quy tắc hoặc công thức.',
      hints: ['Gạch chân dữ kiện chính.', 'Nhắc lại quy tắc trước khi tính.'],
      difficulty_level: moduleIndex === 0 ? 'easy' : moduleIndex < 3 ? 'medium' : 'hard',
      points: 1,
    };
  }

  private buildFallbackSummary(diagnostic: DiagnosticContext): string {
    if (diagnostic.weaknesses.length > 0) {
      return `Giáo trình học tập được tạo để củng cố các điểm yếu: ${diagnostic.weaknesses.join(', ')}.`;
    }
    return 'Giáo trình học tập gồm bài học, nội dung tự học và bài tập thực hành bằng tiếng Việt.';
  }

  private inferCurriculumDifficulty(diagnostic: DiagnosticContext): 'easy' | 'medium' | 'hard' {
    if (diagnostic.percentage === null) return 'medium';
    if (diagnostic.percentage < 50) return 'easy';
    if (diagnostic.percentage >= 80) return 'hard';
    return 'medium';
  }

  private lessonTypeLabel(value: 'theory' | 'practice' | 'mixed'): string {
    if (value === 'theory') return 'Lý thuyết';
    if (value === 'practice') return 'Luyện tập';
    return 'Lý thuyết và luyện tập';
  }

  private difficultyLabel(value: 'easy' | 'medium' | 'hard'): string {
    if (value === 'easy') return 'Cơ bản';
    if (value === 'hard') return 'Nâng cao';
    return 'Trung bình';
  }
}

export const curriculumService = new CurriculumService();

export default curriculumService;
