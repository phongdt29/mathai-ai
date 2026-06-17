
import {
  LearningRiskScore,
  RiskLevel,
  JsonValue,
} from '../types';
import { learningRiskScoreRepo, attendanceRecordRepo, engagementSessionRepo } from '../models/engagement.model';
import { LessonRecommendationRepository } from '../models/progress.model';

/**
 * LearningRiskService
 *
 * Computes daily Learning Risk Score (0-100) from 5 weighted signals:
 *
 * risk_score =
 *   0.30 * absenteeism_rate
 * + 0.20 * incomplete_session_rate
 * + 0.20 * low_engagement_rate
 * + 0.15 * quiz_decline_rate
 * + 0.15 * missed_recommendation_rate
 *
 * Risk levels:
 * - low (0-30): green — student is on track
 * - medium (31-60): yellow — needs attention
 * - high (61-100): red — urgent intervention needed
 */
export class LearningRiskService {
  private readonly recommendationRepo: LessonRecommendationRepository;

  /** Lookback window in days for computing rates */
  private static readonly LOOKBACK_DAYS = 7;

  /** Weights for each component */
  private static readonly WEIGHTS = {
    absenteeism: 0.30,
    incomplete_session: 0.20,
    low_engagement: 0.20,
    quiz_decline: 0.15,
    missed_recommendation: 0.15,
  };

  constructor() {
    this.recommendationRepo = new LessonRecommendationRepository();
  }

  /**
   * Compute and store today's risk score for a student.
   */
  public async computeRiskScore(studentId: string): Promise<LearningRiskScore> {
    const today = new Date().toISOString().split('T')[0]!;
    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - LearningRiskService.LOOKBACK_DAYS);
    const startStr = lookbackStart.toISOString().split('T')[0]!;

    // 1. Absenteeism rate (absent / total scheduled)
    const attendanceCounts = await attendanceRecordRepo.countByStatus(
      studentId,
      LearningRiskService.LOOKBACK_DAYS
    );
    const totalAttendance = attendanceCounts.present + attendanceCounts.partial + attendanceCounts.absent;
    const absenteeismRate = totalAttendance > 0
      ? attendanceCounts.absent / totalAttendance
      : 0;

    // 2. Incomplete session rate (abandoned or partial sessions / total)
    const sessions = await engagementSessionRepo.findByStudentInDateRange(
      studentId,
      startStr,
      today
    );
    const totalSessions = sessions.length;
    const incompleteSessions = sessions.filter(
      s => s.status === 'abandoned' || Number(s.focus_ratio) < 0.5
    ).length;
    const incompleteSessionRate = totalSessions > 0
      ? incompleteSessions / totalSessions
      : 0;

    // 3. Low engagement rate (sessions with focus_ratio < 0.5)
    const lowEngagementSessions = sessions.filter(
      s => Number(s.focus_ratio) < 0.5
    ).length;
    const lowEngagementRate = totalSessions > 0
      ? lowEngagementSessions / totalSessions
      : 0;

    // 4. Quiz decline rate (% of sessions where quiz was not completed)
    const sessionsWithExpectedQuiz = sessions.filter(
      s => s.status === 'completed' && s.lesson_id !== null
    );
    const quizMissed = sessionsWithExpectedQuiz.filter(s => !s.quiz_completed).length;
    const quizDeclineRate = sessionsWithExpectedQuiz.length > 0
      ? quizMissed / sessionsWithExpectedQuiz.length
      : 0;

    // 5. Missed recommendation rate
    const recommendations = await this.recommendationRepo.getRecentRecommendations(
      studentId,
      LearningRiskService.LOOKBACK_DAYS
    );
    const missedRecommendations = recommendations.filter(r => !r.is_completed).length;
    const missedRecommendationRate = recommendations.length > 0
      ? missedRecommendations / recommendations.length
      : 0;

    // Compute weighted score (0-100)
    const W = LearningRiskService.WEIGHTS;
    const riskScore = Math.round(
      (W.absenteeism * absenteeismRate +
        W.incomplete_session * incompleteSessionRate +
        W.low_engagement * lowEngagementRate +
        W.quiz_decline * quizDeclineRate +
        W.missed_recommendation * missedRecommendationRate) * 100
    );

    const riskLevel: RiskLevel =
      riskScore <= 30 ? 'low' :
      riskScore <= 60 ? 'medium' :
      'high';

    const details: JsonValue = {
      lookback_days: LearningRiskService.LOOKBACK_DAYS,
      total_sessions: totalSessions,
      total_attendance_records: totalAttendance,
      components: {
        absenteeism_rate: Math.round(absenteeismRate * 10000) / 10000,
        incomplete_session_rate: Math.round(incompleteSessionRate * 10000) / 10000,
        low_engagement_rate: Math.round(lowEngagementRate * 10000) / 10000,
        quiz_decline_rate: Math.round(quizDeclineRate * 10000) / 10000,
        missed_recommendation_rate: Math.round(missedRecommendationRate * 10000) / 10000,
      },
      weights: W,
    };

    // Upsert: check if today's score already exists
    const existing = await learningRiskScoreRepo.getLatest(studentId);
    if (existing && existing.score_date === today) {
      return learningRiskScoreRepo.update(existing.id, {
        absenteeism_rate: absenteeismRate,
        incomplete_session_rate: incompleteSessionRate,
        low_engagement_rate: lowEngagementRate,
        quiz_decline_rate: quizDeclineRate,
        missed_recommendation_rate: missedRecommendationRate,
        risk_score: riskScore,
        risk_level: riskLevel,
        details,
      } as any) as any;
    }

    return learningRiskScoreRepo.create({
      student_id: studentId,
      score_date: today,
      absenteeism_rate: absenteeismRate,
      incomplete_session_rate: incompleteSessionRate,
      low_engagement_rate: lowEngagementRate,
      quiz_decline_rate: quizDeclineRate,
      missed_recommendation_rate: missedRecommendationRate,
      risk_score: riskScore,
      risk_level: riskLevel,
      details,
    } as any) as any;
  }

  /**
   * Get the latest risk score for a student.
   */
  public async getLatestRiskScore(studentId: string): Promise<LearningRiskScore | null> {
    return learningRiskScoreRepo.getLatest(studentId) as any;
  }

  /**
   * Get risk history for trending.
   */
  public async getRiskHistory(
    studentId: string,
    days: number = 30
  ): Promise<LearningRiskScore[]> {
    return learningRiskScoreRepo.getHistory(studentId, days) as any;
  }

  /**
   * Generate intervention suggestions based on risk components.
   */
  public generateInterventionSuggestions(risk: LearningRiskScore): string[] {
    const suggestions: string[] = [];

    if (Number(risk.absenteeism_rate) > 0.3) {
      suggestions.push('Cần nhắc nhở học sinh vào học đúng giờ. Xem xét đổi khung giờ học phù hợp hơn.');
    }
    if (Number(risk.incomplete_session_rate) > 0.3) {
      suggestions.push('Học sinh thường xuyên bỏ giữa chừng. Nên kiểm tra xem nội dung có quá khó hoặc quá dài không.');
    }
    if (Number(risk.low_engagement_rate) > 0.3) {
      suggestions.push('Mức tập trung thấp. Nên rút ngắn thời gian buổi học hoặc thêm hoạt động tương tác.');
    }
    if (Number(risk.quiz_decline_rate) > 0.3) {
      suggestions.push('Học sinh thường bỏ quiz cuối buổi. Cần tăng ôn phần cũ trước khi kiểm tra.');
    }
    if (Number(risk.missed_recommendation_rate) > 0.3) {
      suggestions.push('Học sinh không theo gợi ý học tập. Kiểm tra xem gợi ý có phù hợp không.');
    }

    if (suggestions.length === 0 && Number(risk.risk_score) > 30) {
      suggestions.push('Nhiều chỉ số đang ở mức cần theo dõi. Nên duy trì liên lạc thường xuyên.');
    }

    return suggestions;
  }
}

export const learningRiskService = new LearningRiskService();
export default learningRiskService;
