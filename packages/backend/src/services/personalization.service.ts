
import { AITutorRepository } from '../models/ai-tutor.model';
import { LessonQuizResultRepository, LessonQuizResultModel } from '../models/lesson.model';
import { TopicMasteryRepository } from '../models/progress.model';
import { StudentProfileRepository, StudentThemeRepository } from '../models/student.model';
import aiService from './ai.service';
import {
  AITutor,
  LessonQuizResult,
  PreferredTeacherGender,
  StudentProfile,
  StudentThemePreference,
  TopicMastery,
} from '../types';
import { NotFoundError } from '../utils/errors';

// ── Types ──────────────────────────────────────────────────────────────

export interface PersonalitySummary {
  learning_style: 'visual' | 'auditory' | 'kinesthetic' | 'reading';
  pace: 'slow' | 'moderate' | 'fast';
  persistence: 'low' | 'medium' | 'high';
  traits: string[];
  summary: string;
}

export interface UIPersonalization {
  /** Bảng màu dựa trên sở thích */
  color_scheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  /** Font size preference */
  font_size: 'small' | 'medium' | 'large';
  /** Dark/light mode */
  theme_mode: 'light' | 'dark';
  /** Microcopy style phù hợp tính cách */
  microcopy: {
    greeting: string;
    encouragement: string;
    on_correct: string;
    on_wrong: string;
    on_streak: string;
    on_return: string;
  };
}

export interface PersonalizationResult {
  personality: PersonalitySummary;
  ui: UIPersonalization;
  recommended_tutor: AITutor | null;
  tutor_reason: string;
}

// ── Service ────────────────────────────────────────────────────────────

export class PersonalizationService {
  private readonly studentRepo: StudentProfileRepository;
  private readonly themeRepo: StudentThemeRepository;
  private readonly tutorRepo: AITutorRepository;
  private readonly quizResultRepo: LessonQuizResultRepository;
  private readonly topicMasteryRepo: TopicMasteryRepository;

  constructor() {
    this.studentRepo = new StudentProfileRepository();
    this.themeRepo = new StudentThemeRepository();
    this.tutorRepo = new AITutorRepository();
    this.quizResultRepo = new LessonQuizResultRepository();
    this.topicMasteryRepo = new TopicMasteryRepository();
  }

  /**
   * Tạo personalization đầy đủ cho học sinh
   */
  public async getPersonalization(studentId: string): Promise<PersonalizationResult> {
    const profile = await this.getProfileOrThrow(studentId);
    const theme = await this.themeRepo.findByStudentId(studentId) as any;
    const behaviorData = await this.collectBehaviorData(studentId);
    const personality = await this.analyzePersonality(profile, behaviorData);
    const ui = this.buildUIPersonalization(profile, theme, personality);
    const { tutor, reason } = await this.recommendTutor(profile, personality) as any;

    return {
      personality,
      ui,
      recommended_tutor: tutor as any,
      tutor_reason: reason,
    };
  }

  // ── Personality Analysis ───────────────────────────────────────────

  private async collectBehaviorData(studentId: string): Promise<BehaviorData> {
    const quizResults = (await LessonQuizResultModel.find({ student_id: studentId })
      .sort({ submitted_at: -1 })
      .limit(10)
      .exec()) as unknown as LessonQuizResult[];

    const topicMasteries = await this.topicMasteryRepo.findByStudent(studentId);

    // Tính thời gian trung bình làm quiz
    const avgDuration = quizResults.length > 0
      ? quizResults.reduce((sum, q) => sum + (q.duration_seconds ?? 0), 0) / quizResults.length
      : 0;

    // Tính xu hướng điểm (tăng/giảm/ổn định)
    const scores = quizResults
      .filter(q => q.percentage !== null)
      .map(q => Number(q.percentage));
    const trend = this.calculateTrend(scores);

    // Đếm số lần retry (quiz score < 50% rồi quiz lại)
    const retryCount = quizResults.filter(q => Number(q.percentage ?? 0) < 50).length;

    // Tính consistency
    const scoreVariance = this.calculateVariance(scores);

    return {
      quiz_count: quizResults.length,
      avg_quiz_duration_seconds: avgDuration,
      avg_quiz_score: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      score_trend: trend,
      retry_count: retryCount,
      score_variance: scoreVariance,
      topic_mastery_count: topicMasteries.length,
      weak_topic_count: topicMasteries.filter(t => t.strength_label === 'weak').length,
      strong_topic_count: topicMasteries.filter(t => t.strength_label === 'strong' || t.strength_label === 'mastered').length,
    };
  }

  private async analyzePersonality(
    profile: StudentProfile,
    behavior: BehaviorData
  ): Promise<PersonalitySummary> {
    // Rule-based analysis trước, AI bổ sung sau
    const pace = behavior.avg_quiz_duration_seconds < 300 ? 'fast'
      : behavior.avg_quiz_duration_seconds > 900 ? 'slow'
      : 'moderate';

    const persistence = behavior.retry_count >= 3 ? 'high'
      : behavior.quiz_count >= 5 ? 'medium'
      : 'low';

    try {
      const prompt = [
        'Phân tích tính cách học tập của học sinh dựa trên dữ liệu hành vi:',
        '',
        `Lớp: ${profile.grade_level ?? '?'}`,
        `Sở thích: ${profile.interests ?? 'Chưa có'}`,
        `Tự đánh giá: ${profile.self_assessed_level ?? 'Chưa có'}`,
        '',
        'Dữ liệu hành vi:',
        `- Số quiz đã làm: ${behavior.quiz_count}`,
        `- Điểm TB quiz: ${behavior.avg_quiz_score.toFixed(1)}%`,
        `- Thời gian TB làm quiz: ${Math.round(behavior.avg_quiz_duration_seconds / 60)} phút`,
        `- Xu hướng điểm: ${behavior.score_trend}`,
        `- Số lần làm lại (retry): ${behavior.retry_count}`,
        `- Độ ổn định điểm (variance): ${behavior.score_variance.toFixed(1)}`,
        `- Tốc độ làm bài: ${pace}`,
        `- Tính kiên trì: ${persistence}`,
        `- Chủ đề mạnh: ${behavior.strong_topic_count}, yếu: ${behavior.weak_topic_count}`,
        '',
        'Trả về JSON:',
        '{"learning_style": "visual|auditory|kinesthetic|reading", "pace": "slow|moderate|fast", "persistence": "low|medium|high", "traits": ["...", "..."], "summary": "Mô tả 1-2 câu"}',
      ].join('\n');

      const result = await aiService.generateJSON<PersonalitySummary>(
        'Bạn là chuyên gia tâm lý giáo dục, phân tích phong cách học tập.',
        prompt,
        { temperature: 0.3 }
      );

      return {
        learning_style: this.normalizeLearningStyle(result.data.learning_style),
        pace,
        persistence,
        traits: Array.isArray(result.data.traits) ? result.data.traits.slice(0, 5) : [],
        summary: result.data.summary ?? 'Đang thu thập thêm dữ liệu hành vi.',
      };
    } catch {
      return {
        learning_style: 'visual',
        pace,
        persistence,
        traits: [],
        summary: 'Đang thu thập dữ liệu hành vi để phân tích.',
      };
    }
  }

  // ── UI Personalization ─────────────────────────────────────────────

  private buildUIPersonalization(
    profile: StudentProfile,
    theme: StudentThemePreference | null,
    personality: PersonalitySummary
  ): UIPersonalization {
    const favoriteColor = theme?.favorite_color ?? profile.favorite_color ?? '#4F46E5';
    const colorScheme = this.generateColorScheme(favoriteColor);

    const microcopy = this.buildMicrocopy(personality, profile);

    return {
      color_scheme: colorScheme,
      font_size: theme?.font_size ?? 'medium',
      theme_mode: theme?.theme_mode ?? 'light',
      microcopy,
    };
  }

  private generateColorScheme(baseColor: string): UIPersonalization['color_scheme'] {
    // Tạo bảng màu từ màu yêu thích
    // Simple hue rotation approach
    return {
      primary: baseColor,
      secondary: this.lightenColor(baseColor, 30),
      accent: this.rotateHue(baseColor, 30),
      background: this.lightenColor(baseColor, 90),
    };
  }

  private buildMicrocopy(
    personality: PersonalitySummary,
    profile: StudentProfile
  ): UIPersonalization['microcopy'] {
    const name = profile.interests ? 'bạn' : 'bạn';

    // Style theo tính cách
    if (personality.pace === 'fast' && personality.persistence === 'high') {
      return {
        greeting: `Chào ${name}! Sẵn sàng chinh phục bài mới chưa? 🚀`,
        encouragement: 'Tốc độ tuyệt vời! Giữ vững phong độ nhé!',
        on_correct: 'Chính xác! Nhanh và đúng!',
        on_wrong: 'Sai rồi, nhưng thử chậm lại một chút nhé!',
        on_streak: 'Streak ấn tượng! Không ai cản nổi bạn!',
        on_return: 'Welcome back! Tiếp tục hành trình thôi!',
      };
    }

    if (personality.pace === 'slow') {
      return {
        greeting: `Chào ${name}! Hôm nay mình học từ từ nhé! 📚`,
        encouragement: 'Cẩn thận là tốt! Từng bước một nhé.',
        on_correct: 'Đúng rồi! Suy nghĩ kỹ là được!',
        on_wrong: 'Không sao, đọc lại đề thử xem nhé.',
        on_streak: 'Kiên trì đã có kết quả! Giỏi lắm!',
        on_return: 'Chào mừng trở lại! Mình tiếp tục nhé!',
      };
    }

    if (personality.persistence === 'low') {
      return {
        greeting: `Chào ${name}! Chỉ cần 15 phút thôi nhé! ⏰`,
        encouragement: 'Mỗi bước nhỏ đều đáng giá! Cố lên!',
        on_correct: 'Tuyệt! Thấy chưa, bạn làm được mà!',
        on_wrong: 'Không sao, thử lại lần nữa nhé!',
        on_streak: 'Wow, streak đẹp lắm! Đừng dừng lại!',
        on_return: 'Vui khi thấy bạn quay lại! Mình bắt đầu nhé!',
      };
    }

    // Default balanced
    return {
      greeting: `Chào ${name}! Sẵn sàng học toán chưa? 🎯`,
      encouragement: 'Bạn đang làm rất tốt! Tiếp tục nhé!',
      on_correct: 'Chính xác! Giỏi lắm!',
      on_wrong: 'Chưa đúng, xem lại gợi ý nhé!',
      on_streak: 'Chuỗi đúng liên tiếp! Tuyệt vời!',
      on_return: 'Chào mừng trở lại! Tiếp tục bài hôm trước nhé!',
    };
  }

  // ── Tutor Recommendation ──────────────────────────────────────────

  private async recommendTutor(
    profile: StudentProfile,
    personality: PersonalitySummary
  ): Promise<{ tutor: AITutor | null; reason: string }> {
    const activeTutors = await this.tutorRepo.findActive();

    if (activeTutors.length === 0) {
      return { tutor: null, reason: 'Chưa có tutor nào khả dụng.' };
    }

    // Nếu đã chọn tutor rồi, giữ nguyên
    if (profile.selected_tutor_id) {
      const current = activeTutors.find(t => t.id === profile.selected_tutor_id) as any;
      if (current) {
        return { tutor: current as any, reason: 'Tutor bạn đã chọn.' };
      }
    }

    // Match based on personality + interests
    try {
      const prompt = [
        'Chọn AI tutor phù hợp nhất cho học sinh:',
        '',
        `Tính cách: ${personality.summary}`,
        `Phong cách học: ${personality.learning_style}`,
        `Tốc độ: ${personality.pace}`,
        `Tính kiên trì: ${personality.persistence}`,
        `Sở thích: ${profile.interests ?? 'Chưa rõ'}`,
        '',
        'Danh sách tutor:',
        ...activeTutors.map((t, i) =>
          `${i + 1}. ${t.name} - ${t.teaching_style ?? 'Chưa rõ'} - ${t.personality ?? 'Chưa rõ'}`
        ),
        '',
        'Trả về JSON: {"tutor_index": 1, "reason": "Lý do chọn..."}',
      ].join('\n');

      const result = await aiService.generateJSON<{ tutor_index: number; reason: string }>(
        'Bạn là cố vấn giáo dục, chọn tutor phù hợp nhất cho học sinh.',
        prompt,
        { temperature: 0.3 }
      );

      const idx = Math.min(Math.max((result.data.tutor_index ?? 1) - 1, 0), activeTutors.length - 1);
      return {
        tutor: activeTutors[idx] as any,
        reason: result.data.reason ?? 'Phù hợp với phong cách học tập của bạn.',
      };
    } catch {
      return {
        tutor: activeTutors[0] as any,
        reason: 'Tutor mặc định.',
      };
    }
  }

  // ── Color Utils ────────────────────────────────────────────────────

  private lightenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, ((num >> 16) & 0xFF) + Math.round(255 * percent / 100));
    const g = Math.min(255, ((num >> 8) & 0xFF) + Math.round(255 * percent / 100));
    const b = Math.min(255, (num & 0xFF) + Math.round(255 * percent / 100));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  private rotateHue(hex: string, degrees: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    let r = (num >> 16) & 0xFF;
    let g = (num >> 8) & 0xFF;
    let b = num & 0xFF;

    // Simple hue shift via RGB rotation approximation
    const cos = Math.cos((degrees * Math.PI) / 180);
    const sin = Math.sin((degrees * Math.PI) / 180);

    const newR = Math.round(Math.min(255, Math.max(0,
      r * (cos + (1 - cos) / 3) + g * ((1 - cos) / 3 - Math.sqrt(1 / 3) * sin) + b * ((1 - cos) / 3 + Math.sqrt(1 / 3) * sin)
    )));
    const newG = Math.round(Math.min(255, Math.max(0,
      r * ((1 - cos) / 3 + Math.sqrt(1 / 3) * sin) + g * (cos + (1 - cos) / 3) + b * ((1 - cos) / 3 - Math.sqrt(1 / 3) * sin)
    )));
    const newB = Math.round(Math.min(255, Math.max(0,
      r * ((1 - cos) / 3 - Math.sqrt(1 / 3) * sin) + g * ((1 - cos) / 3 + Math.sqrt(1 / 3) * sin) + b * (cos + (1 - cos) / 3)
    )));

    return `#${((newR << 16) | (newG << 8) | newB).toString(16).padStart(6, '0')}`;
  }

  // ── Math Utils ─────────────────────────────────────────────────────

  private calculateTrend(scores: number[]): 'improving' | 'declining' | 'stable' {
    if (scores.length < 3) return 'stable';
    const recent = scores.slice(0, 3);
    const older = scores.slice(3, 6);
    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    if (recentAvg - olderAvg > 5) return 'improving';
    if (olderAvg - recentAvg > 5) return 'declining';
    return 'stable';
  }

  private calculateVariance(scores: number[]): number {
    if (scores.length < 2) return 0;
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    return scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  }

  private normalizeLearningStyle(value: string | undefined): PersonalitySummary['learning_style'] {
    const valid = ['visual', 'auditory', 'kinesthetic', 'reading'] as const;
    if (value && valid.includes(value as typeof valid[number])) {
      return value as PersonalitySummary['learning_style'];
    }
    return 'visual';
  }

  private async getProfileOrThrow(studentId: string): Promise<StudentProfile> {
    const profile = await this.studentRepo.findById(studentId);
    if (!profile) throw new NotFoundError('Không tìm thấy hồ sơ học sinh');
    return profile as any;
  }
}

interface BehaviorData {
  quiz_count: number;
  avg_quiz_duration_seconds: number;
  avg_quiz_score: number;
  score_trend: 'improving' | 'declining' | 'stable';
  retry_count: number;
  score_variance: number;
  topic_mastery_count: number;
  weak_topic_count: number;
  strong_topic_count: number;
}

export const personalizationService = new PersonalizationService();

export default personalizationService;
