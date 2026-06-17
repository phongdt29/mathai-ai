
import { StudentProfileRepository } from '../models/student.model';
import { AssessmentAttemptRepository, AssessmentAttemptModel, AssessmentModel } from '../models/assessment.model';
import { TopicMasteryRepository, TopicMasteryModel } from '../models/progress.model';
import aiService from './ai.service';
import {
  AbilityLevel,
  AssessmentAttempt,
  ClassificationLevel,
  MultiDimensionalClassification,
  ProcessingSpeed,
  SelfStudyLevel,
  StudentProfile,
  TopicMastery,
} from '../types';
import { NotFoundError } from '../utils/errors';
import {
  type AnswerSpeed,
  type ComprehensionLevel,
  averageAccuracy,
  classifySpeed,
  computeComprehensionLevel,
} from '../utils/diagnostic-insights';

// ── Types ──────────────────────────────────────────────────────────────

export type { ClassificationLevel } from '../types';

export interface RuleClassificationResult {
  level: ClassificationLevel;
  source: 'math_average_score';
  score: number;
}

export interface DiagnosticSignals {
  percentage: number | null;
  time_spent_seconds: number | null;
  time_per_question_seconds: number | null;
  total_questions: number;
  correct_answers: number;
  topic_weaknesses: string[];
  topic_strengths: string[];
  error_patterns: Record<string, number>; // topic -> wrong count
  topic_accuracy: Record<string, number>; // topic -> accuracy 0-100
  stability_score: number; // 0-1, consistency between easy/hard questions
  speed: AnswerSpeed; // Module 2: tốc độ làm bài (fast/normal/slow)
  comprehension_level: ComprehensionLevel; // Module 2: mức độ hiểu
}

export interface ClassificationResult {
  rule_based: RuleClassificationResult;
  diagnostic_signals: DiagnosticSignals | null;
  multi_dimensional: MultiDimensionalClassification | null;
  final_level: ClassificationLevel;
  final_confidence: number;
}

// ── Service ────────────────────────────────────────────────────────────

export class ClassificationService {
  private readonly studentRepo: StudentProfileRepository;
  private readonly attemptRepo: AssessmentAttemptRepository;
  private readonly topicMasteryRepo: TopicMasteryRepository;

  constructor() {
    this.studentRepo = new StudentProfileRepository();
    this.attemptRepo = new AssessmentAttemptRepository();
    this.topicMasteryRepo = new TopicMasteryRepository();
  }

  /**
   * Tầng 1: Phân loại cứng từ điểm trung bình toán cuối kỳ
   */
  public classifyByScore(mathAverageScore: number): RuleClassificationResult {
    let level: ClassificationLevel;

    if (mathAverageScore <= 3.5) {
      level = 'yeu';
    } else if (mathAverageScore <= 5) {
      level = 'trung_binh';
    } else if (mathAverageScore <= 8) {
      level = 'kha';
    } else {
      level = 'gioi';
    }

    return {
      level,
      source: 'math_average_score',
      score: mathAverageScore,
    };
  }

  /**
   * Thu thập tín hiệu từ bài test đầu vào (diagnostic)
   * Enhanced: thêm time_per_question, stability, topic_accuracy
   */
  public async collectDiagnosticSignals(studentId: string): Promise<DiagnosticSignals | null> {
    // Find the latest graded diagnostic attempt
    // First find diagnostic assessments, then find the latest graded attempt for one
    const gradedAttempts = await AssessmentAttemptModel.find({
      student_id: studentId,
      status: 'graded',
    }).sort({ updatedAt: -1 }).exec();

    let latestAttempt: AssessmentAttempt | undefined;
    for (const attempt of gradedAttempts) {
      const assessment = await AssessmentModel.findById(attempt.assessment_id).exec();
      if (assessment && assessment.type === 'diagnostic') {
        latestAttempt = attempt as unknown as AssessmentAttempt;
        break;
      }
    }

    if (!latestAttempt) {
      return null;
    }

    // Lấy topic mastery để phân tích lỗi theo chủ đề
    const topicMasteries = (await TopicMasteryModel.find({ student_id: studentId })
      .exec()) as unknown as TopicMastery[];

    const topicWeaknesses: string[] = [];
    const topicStrengths: string[] = [];
    const errorPatterns: Record<string, number> = {};
    const topicAccuracy: Record<string, number> = {};

    // Per-topic accuracy for stability calculation
    const accuracyValues: number[] = [];

    for (const tm of topicMasteries) {
      const mastery = Number(tm.mastery_level);
      const wrongCount = tm.total_attempts - tm.correct_attempts;
      const accuracy = tm.total_attempts > 0
        ? Math.round((tm.correct_attempts / tm.total_attempts) * 100)
        : 0;

      topicAccuracy[tm.topic] = accuracy;
      accuracyValues.push(accuracy);

      if (mastery < 50) {
        topicWeaknesses.push(tm.topic);
      } else if (mastery >= 75) {
        topicStrengths.push(tm.topic);
      }

      if (wrongCount > 0) {
        errorPatterns[tm.topic] = wrongCount;
      }
    }

    // Tính thời gian làm bài
    let timeSpentSeconds: number | null = null;
    if (latestAttempt.started_at && latestAttempt.submitted_at) {
      const start = new Date(latestAttempt.started_at).getTime();
      const end = new Date(latestAttempt.submitted_at).getTime();
      timeSpentSeconds = Math.round((end - start) / 1000);
    }

    // Tính số câu đúng
    const totalQuestions = topicMasteries.reduce((sum, tm) => sum + tm.total_attempts, 0);
    const correctAnswers = topicMasteries.reduce((sum, tm) => sum + tm.correct_attempts, 0);
    const percentage = latestAttempt.percentage !== null ? Number(latestAttempt.percentage) : null;

    // Time per question
    const timePerQuestion = (timeSpentSeconds !== null && totalQuestions > 0)
      ? Math.round(timeSpentSeconds / totalQuestions)
      : null;

    // Stability score: 1 - normalized standard deviation of per-topic accuracy
    // High stability = consistent performance across topics
    // Low stability = big gaps between strong/weak topics
    let stabilityScore = 0.5; // default when insufficient data
    if (accuracyValues.length >= 2) {
      const mean = accuracyValues.reduce((a, b) => a + b, 0) / accuracyValues.length;
      const variance = accuracyValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / accuracyValues.length;
      const stdDev = Math.sqrt(variance);
      // Normalize: stdDev of 0 = perfect stability (1.0), stdDev of 50 = no stability (0.0)
      stabilityScore = Math.max(0, Math.min(1, 1 - stdDev / 50));
    }

    const roundedStability = Math.round(stabilityScore * 100) / 100;

    return {
      percentage,
      time_spent_seconds: timeSpentSeconds,
      time_per_question_seconds: timePerQuestion,
      total_questions: totalQuestions,
      correct_answers: correctAnswers,
      topic_weaknesses: topicWeaknesses,
      topic_strengths: topicStrengths,
      error_patterns: errorPatterns,
      topic_accuracy: topicAccuracy,
      stability_score: roundedStability,
      // Module 2: tốc độ làm bài + mức độ hiểu
      speed: classifySpeed(timePerQuestion),
      comprehension_level: computeComprehensionLevel(
        averageAccuracy(accuracyValues),
        roundedStability,
      ),
    };
  }

  /**
   * Tầng 2: AI phân tích đa chiều dựa trên bài test thật
   * Output: MultiDimensionalClassification (general, topic-specific, self-study, speed)
   */
  public async aiMultiDimensionalClassify(
    ruleLevel: ClassificationLevel,
    signals: DiagnosticSignals,
    profile: StudentProfile
  ): Promise<MultiDimensionalClassification> {
    const prompt = [
      'Bạn là chuyên gia đánh giá học lực toán cho học sinh Việt Nam.',
      'Hãy phân tích ĐA CHIỀU năng lực học sinh dựa trên dữ liệu sau.',
      '',
      `Phân loại ban đầu (từ điểm TB cuối kỳ): ${ruleLevel}`,
      `Lớp: ${profile.grade_level ?? 'chưa rõ'}`,
      `Trường: ${profile.school_name ?? 'chưa rõ'}`,
      `Tự đánh giá: ${profile.self_assessed_level ?? 'chưa rõ'}`,
      '',
      'Kết quả bài kiểm tra đầu vào:',
      `- Điểm: ${signals.percentage !== null ? `${signals.percentage}%` : 'N/A'}`,
      `- Số câu đúng: ${signals.correct_answers}/${signals.total_questions}`,
      `- Thời gian làm bài: ${signals.time_spent_seconds !== null ? `${Math.round(signals.time_spent_seconds / 60)} phút` : 'N/A'}`,
      `- Thời gian trung bình/câu: ${signals.time_per_question_seconds !== null ? `${signals.time_per_question_seconds} giây` : 'N/A'}`,
      `- Độ ổn định (consistency): ${signals.stability_score} (0=rất không đều, 1=rất đều)`,
      `- Chủ đề mạnh: ${signals.topic_strengths.length > 0 ? signals.topic_strengths.join(', ') : 'Chưa có'}`,
      `- Chủ đề yếu: ${signals.topic_weaknesses.length > 0 ? signals.topic_weaknesses.join(', ') : 'Chưa có'}`,
      `- Độ chính xác theo chủ đề: ${JSON.stringify(signals.topic_accuracy)}`,
      `- Phân bố lỗi: ${JSON.stringify(signals.error_patterns)}`,
      '',
      'Phân tích theo 4 chiều:',
      '1. general_ability (1-5): Năng lực toán tổng quát',
      '2. topic_abilities: Năng lực từng chủ đề (1-5 cho mỗi topic có data)',
      '3. self_study_level: Khả năng tự học (needs_guidance / semi_independent / independent)',
      '   - needs_guidance: cần hướng dẫn từng bước',
      '   - semi_independent: tự làm được bài vừa, cần trợ giúp bài khó',
      '   - independent: tự học tốt, chỉ cần gợi ý nhẹ',
      '4. processing_speed: Tốc độ xử lý (slow / normal / fast)',
      '   - Dựa trên time_per_question so với mức trung bình lớp (~60-90s/câu)',
      '',
      'Lưu ý phân tích:',
      '- Nếu điểm test thấp hơn nhiều so với điểm TB cuối kỳ → hạ general_ability',
      '- Nếu thời gian nhanh + nhiều lỗi → processing_speed=fast nhưng general_ability thấp',
      '- Nếu thời gian lâu + ít lỗi → processing_speed=slow nhưng self_study=semi_independent+',
      '- Nếu stability thấp → yếu cục bộ, topic_abilities khác nhau nhiều',
      '- Nếu stability cao + điểm cao → independent learner',
      '- Nếu topic/yêu cầu bài kiểm tra có dấu hiệu thấp hơn nhiều so với lớp hiện tại, giảm confidence và ghi rõ trong reasoning rằng kết quả có thể bị lệch do đề chưa đúng cấp lớp.',
      '- Không kết luận học sinh giỏi/yếu chỉ dựa trên điểm cao ở các câu quá dễ so với lớp hiện tại.',
      '',
      'Trả về JSON:',
      '{',
      '  "general_ability": 1-5,',
      '  "topic_abilities": {"topic_name": 1-5, ...},',
      '  "self_study_level": "needs_guidance|semi_independent|independent",',
      '  "processing_speed": "slow|normal|fast",',
      '  "stability_score": 0.0-1.0,',
      '  "overall_level": "yeu|trung_binh|kha|gioi",',
      '  "confidence": 0.0-1.0,',
      '  "reasoning": "...",',
      '  "skill_gaps": ["..."],',
      '  "recommendations": ["..."]',
      '}',
    ].join('\n');

    const result = await aiService.generateJSON<MultiDimensionalClassification>(
      'Bạn là chuyên gia giáo dục toán học, phân tích đa chiều năng lực học sinh.',
      prompt,
      { temperature: 0.2 }
    );

    const data = result.data;

    return {
      general_ability: this.normalizeAbility(data.general_ability),
      topic_abilities: this.normalizeTopicAbilities(data.topic_abilities),
      self_study_level: this.normalizeSelfStudy(data.self_study_level),
      processing_speed: this.normalizeSpeed(data.processing_speed),
      stability_score: Math.min(Math.max(Number(data.stability_score ?? signals.stability_score), 0), 1),
      overall_level: this.normalizeLevel(data.overall_level),
      confidence: Math.min(Math.max(Number(data.confidence ?? 0.5), 0), 1),
      reasoning: data.reasoning ?? '',
      skill_gaps: Array.isArray(data.skill_gaps) ? data.skill_gaps : [],
      recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
    };
  }

  /**
   * Pipeline phân loại đầy đủ 2 tầng → multi-dimensional
   */
  public async classifyStudent(studentId: string): Promise<ClassificationResult> {
    const profile = await this.studentRepo.findById(studentId);

    if (!profile) {
      throw new NotFoundError('Không tìm thấy hồ sơ học sinh');
    }

    const mathScore = Number(profile.math_average_score ?? 5);

    // Tầng 1: Rule cứng
    const ruleBased = this.classifyByScore(mathScore);

    // Tầng 2: Thu thập tín hiệu diagnostic
    const diagnosticSignals = await this.collectDiagnosticSignals(studentId);

    // Nếu chưa có bài test → dùng kết quả rule cứng
    if (!diagnosticSignals || diagnosticSignals.total_questions === 0) {
      await this.saveClassification(profile.id, ruleBased.level);

      return {
        rule_based: ruleBased,
        diagnostic_signals: null,
        multi_dimensional: null,
        final_level: ruleBased.level,
        final_confidence: 0.6,
      };
    }

    // Tầng 2: AI multi-dimensional classification
    const multiDim = await this.aiMultiDimensionalClassify(ruleBased.level, diagnosticSignals, profile as any);

    // Quyết định final level
    const finalLevel = multiDim.confidence >= 0.7
      ? multiDim.overall_level
      : ruleBased.level;

    const finalConfidence = multiDim.confidence >= 0.7
      ? multiDim.confidence
      : 0.6;

    await this.saveClassification(profile.id, finalLevel);

    return {
      rule_based: ruleBased,
      diagnostic_signals: diagnosticSignals,
      multi_dimensional: multiDim,
      final_level: finalLevel,
      final_confidence: finalConfidence,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private async saveClassification(profileId: string, level: ClassificationLevel): Promise<void> {
    await this.studentRepo.update(profileId, {
      initial_classification: level,
    } as any);
  }

  private normalizeLevel(value: string | undefined | null): ClassificationLevel {
    const valid: ClassificationLevel[] = ['yeu', 'trung_binh', 'kha', 'gioi'];
    if (value && valid.includes(value as ClassificationLevel)) {
      return value as ClassificationLevel;
    }
    return 'trung_binh';
  }

  private normalizeAbility(value: unknown): AbilityLevel {
    const num = Number(value);
    if (num >= 1 && num <= 5 && Number.isInteger(num)) {
      return num as AbilityLevel;
    }
    return 3 as AbilityLevel;
  }

  private normalizeTopicAbilities(value: unknown): Record<string, AbilityLevel> {
    if (!value || typeof value !== 'object') return {};
    const result: Record<string, AbilityLevel> = {};
    for (const [topic, level] of Object.entries(value as Record<string, unknown>)) {
      result[topic] = this.normalizeAbility(level);
    }
    return result;
  }

  private normalizeSelfStudy(value: unknown): SelfStudyLevel {
    const valid: SelfStudyLevel[] = ['needs_guidance', 'semi_independent', 'independent'];
    if (typeof value === 'string' && valid.includes(value as SelfStudyLevel)) {
      return value as SelfStudyLevel;
    }
    return 'needs_guidance';
  }

  private normalizeSpeed(value: unknown): ProcessingSpeed {
    const valid: ProcessingSpeed[] = ['slow', 'normal', 'fast'];
    if (typeof value === 'string' && valid.includes(value as ProcessingSpeed)) {
      return value as ProcessingSpeed;
    }
    return 'normal';
  }
}

export const classificationService = new ClassificationService();

export default classificationService;
