
import {
  EngagementEvent,
  EngagementEventType,
  EngagementSession,
  EngagementSessionStatus,
  StartEngagementSessionDTO,
  TrackEngagementEventDTO,
} from '../types';
import {
  engagementSessionRepo,
  engagementEventRepo,
  EngagementSessionModel,
} from '../models/engagement.model';

/**
 * EngagementTrackingService
 *
 * Tracks real-time student interactions during study sessions.
 * Computes effective_study_time (active learning time) from interaction events.
 *
 * Interaction signals tracked:
 * - lesson_view, scroll, click (content engagement)
 * - exercise_start/answer/correct/wrong (practice)
 * - hint_request, chat_message (help-seeking)
 * - quiz_start/submit (assessment)
 * - tab_away/tab_return (distraction)
 * - idle_start/idle_end (inactivity)
 */
export class EngagementTrackingService {
  /** Max seconds between interactions before counting as idle */
  private static readonly IDLE_THRESHOLD_SECONDS = 120; // 2 minutes
  /** Min session duration to count as valid */
  private static readonly MIN_VALID_SESSION_SECONDS = 60; // 1 minute

  // ── Session Lifecycle ─────────────────────────────────────────────

  /**
   * Start a new engagement session. Ends any active session first.
   */
  public async startSession(dto: StartEngagementSessionDTO): Promise<EngagementSession> {
    // End any active session first
    const activeSession = await engagementSessionRepo.findActiveByStudent(dto.student_id);
    if (activeSession) {
      await this.endSession(activeSession.id);
    }

    const session = await engagementSessionRepo.create({
      student_id: dto.student_id,
      lesson_id: dto.lesson_id ?? null,
      curriculum_id: dto.curriculum_id ?? null,
      started_at: new Date(),
      status: 'active',
      total_duration_seconds: 0,
      active_duration_seconds: 0,
      idle_duration_seconds: 0,
      focus_ratio: 0,
      scroll_count: 0,
      click_count: 0,
      answer_count: 0,
      correct_answer_count: 0,
      hint_request_count: 0,
      chat_message_count: 0,
      tab_away_count: 0,
      tab_away_total_seconds: 0,
      quiz_completed: false,
      quiz_score: null,
      lessons_viewed: 0,
      exercises_attempted: 0,
      exercises_completed: 0,
    } as any);

    // Log session_start event
    await this.trackEvent({
      session_id: session.id,
      event_type: 'session_start',
      lesson_id: dto.lesson_id,
    });

    return session as any;
  }

  /**
   * End an active session. Computes final metrics from events.
   * Integration: updates gamification streak on session end (Requirement 12.2).
   */
  public async endSession(sessionId: string): Promise<EngagementSession> {
    const session = await engagementSessionRepo.findById(sessionId);
    if (!session || session.status !== 'active') {
      throw new Error(`Session ${sessionId} not found or not active`);
    }

    // Log session_end event
    await engagementEventRepo.create({
      session_id: sessionId,
      student_id: session.student_id,
      event_type: 'session_end',
    } as any);

    // Compute final metrics
    const metrics = await this.computeSessionMetrics(sessionId);

    const now = new Date();
    const startedAt = new Date(session.started_at);
    const totalDuration = Math.round((now.getTime() - startedAt.getTime()) / 1000);

    const updatedSession = await engagementSessionRepo.update(sessionId, {
      ended_at: now,
      status: 'completed',
      total_duration_seconds: totalDuration,
      active_duration_seconds: metrics.activeDuration,
      idle_duration_seconds: metrics.idleDuration,
      focus_ratio: totalDuration > 0
        ? Math.round((metrics.activeDuration / totalDuration) * 10000) / 10000
        : 0,
      scroll_count: metrics.scrollCount,
      click_count: metrics.clickCount,
      answer_count: metrics.answerCount,
      correct_answer_count: metrics.correctAnswerCount,
      hint_request_count: metrics.hintRequestCount,
      chat_message_count: metrics.chatMessageCount,
      tab_away_count: metrics.tabAwayCount,
      tab_away_total_seconds: metrics.tabAwayTotalSeconds,
      quiz_completed: metrics.quizCompleted,
      exercises_attempted: metrics.exercisesAttempted,
      exercises_completed: metrics.exercisesCompleted,
      lessons_viewed: metrics.lessonsViewed,
    } as any) as any;

    // Gamification integration: update streak on session end (fail-soft)
    try {
      const { gamificationService } = await import('./gamification.service');
      // Use ICT date for streak tracking (Asia/Ho_Chi_Minh timezone)
      const sessionDate = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
      await gamificationService.updateStreakOnSession(
        String(session.student_id),
        sessionDate,
      );
    } catch (error) {
      // Fail-soft: don't block session end if gamification fails (Requirement 12.11)
      console.error(
        `[EngagementService] Gamification streak update failed for student=${session.student_id}:`,
        error,
      );
    }

    return updatedSession;
  }

  /**
   * Mark session as abandoned (e.g., no activity for extended period)
   */
  public async abandonSession(sessionId: string): Promise<void> {
    const session = await engagementSessionRepo.findById(sessionId);
    if (!session || session.status !== 'active') return;

    const metrics = await this.computeSessionMetrics(sessionId);
    const now = new Date();
    const startedAt = new Date(session.started_at);
    const totalDuration = Math.round((now.getTime() - startedAt.getTime()) / 1000);

    await engagementSessionRepo.update(sessionId, {
      ended_at: now,
      status: 'abandoned',
      total_duration_seconds: totalDuration,
      active_duration_seconds: metrics.activeDuration,
      idle_duration_seconds: metrics.idleDuration,
      focus_ratio: totalDuration > 0
        ? Math.round((metrics.activeDuration / totalDuration) * 10000) / 10000
        : 0,
    } as any);
  }

  // ── Event Tracking ────────────────────────────────────────────────

  /**
   * Track a single interaction event. Also updates session counters.
   */
  public async trackEvent(dto: TrackEngagementEventDTO): Promise<EngagementEvent> {
    const session = await engagementSessionRepo.findById(dto.session_id);
    if (!session) {
      throw new Error(`Session ${dto.session_id} not found`);
    }

    const event = await engagementEventRepo.create({
      session_id: dto.session_id,
      student_id: session.student_id,
      event_type: dto.event_type,
      payload: dto.payload ?? null,
      lesson_id: dto.lesson_id ?? null,
      exercise_id: dto.exercise_id ?? null,
    } as any);

    // Increment counters on the session for fast reads
    await this.incrementSessionCounter(dto.session_id, dto.event_type);

    return event as any;
  }

  /**
   * Batch track multiple events (e.g., frontend sends buffered events)
   */
  public async trackEvents(events: TrackEngagementEventDTO[]): Promise<void> {
    for (const event of events) {
      await this.trackEvent(event);
    }
  }

  // ── Metrics Computation ───────────────────────────────────────────

  /**
   * Compute session metrics from raw events.
   *
   * Active time = sum of intervals between consecutive interactions
   *               where gap < IDLE_THRESHOLD_SECONDS
   * Idle time = total_duration - active_time
   */
  public async computeSessionMetrics(sessionId: string): Promise<SessionMetrics> {
    const events = await engagementEventRepo.findBySession(sessionId);

    let activeDuration = 0;
    let tabAwayTotalSeconds = 0;
    let tabAwayCount = 0;
    let scrollCount = 0;
    let clickCount = 0;
    let answerCount = 0;
    let correctAnswerCount = 0;
    let hintRequestCount = 0;
    let chatMessageCount = 0;
    let quizCompleted = false;
    let exercisesAttempted = 0;
    let exercisesCompleted = 0;
    let lessonsViewed = 0;

    const seenExercises = new Set<string>();
    const completedExercises = new Set<string>();
    const seenLessons = new Set<string>();

    let lastInteractionTime: number | null = null;
    let tabAwayStart: number | null = null;

    for (const event of events) {
      const eventTime = new Date((event as any).created_at ?? (event as any).createdAt).getTime();
      const eventType = event.event_type;

      // Count event types
      switch (eventType) {
        case 'scroll': scrollCount++; break;
        case 'click': clickCount++; break;
        case 'exercise_answer': answerCount++; break;
        case 'exercise_correct':
          correctAnswerCount++;
          if (event.exercise_id) completedExercises.add(String(event.exercise_id));
          break;
        case 'exercise_wrong':
          // wrong answer is still an attempt
          break;
        case 'exercise_start':
          if (event.exercise_id) seenExercises.add(String(event.exercise_id));
          break;
        case 'hint_request': hintRequestCount++; break;
        case 'chat_message': chatMessageCount++; break;
        case 'quiz_submit': quizCompleted = true; break;
        case 'tab_away':
          tabAwayCount++;
          tabAwayStart = eventTime;
          break;
        case 'tab_return':
          if (tabAwayStart !== null) {
            tabAwayTotalSeconds += Math.round((eventTime - tabAwayStart) / 1000);
            tabAwayStart = null;
          }
          break;
        case 'lesson_view':
          if (event.lesson_id) seenLessons.add(String(event.lesson_id));
          break;
        default:
          break;
      }

      // Compute active time (skip idle/tab_away events)
      const isActiveEvent = !['tab_away', 'idle_start', 'session_start', 'session_end'].includes(eventType);
      if (isActiveEvent && lastInteractionTime !== null) {
        const gap = (eventTime - lastInteractionTime) / 1000;
        if (gap <= EngagementTrackingService.IDLE_THRESHOLD_SECONDS) {
          activeDuration += gap;
        }
      }

      if (isActiveEvent) {
        lastInteractionTime = eventTime;
      }
    }

    exercisesAttempted = seenExercises.size;
    exercisesCompleted = completedExercises.size;
    lessonsViewed = seenLessons.size;

    return {
      activeDuration: Math.round(activeDuration),
      idleDuration: 0, // computed by caller as total - active
      scrollCount,
      clickCount,
      answerCount,
      correctAnswerCount,
      hintRequestCount,
      chatMessageCount,
      tabAwayCount,
      tabAwayTotalSeconds: Math.round(tabAwayTotalSeconds),
      quizCompleted,
      exercisesAttempted,
      exercisesCompleted,
      lessonsViewed,
    };
  }

  // ── Query Helpers ─────────────────────────────────────────────────

  /**
   * Get active session for a student (if any)
   */
  public async getActiveSession(studentId: string): Promise<EngagementSession | null> {
    return engagementSessionRepo.findActiveByStudent(studentId) as any;
  }

  /**
   * Get recent completed sessions for analytics
   */
  public async getRecentSessions(
    studentId: string,
    limit: number = 10
  ): Promise<EngagementSession[]> {
    return engagementSessionRepo.findRecentByStudent(studentId, limit) as any;
  }

  /**
   * Get average focus ratio over last N sessions
   */
  public async getAverageFocusRatio(
    studentId: string,
    sessionCount: number = 5
  ): Promise<number> {
    const sessions = await this.getRecentSessions(studentId, sessionCount);
    if (sessions.length === 0) return 0;

    const totalFocus = sessions.reduce((sum, s) => sum + Number(s.focus_ratio), 0);
    return Math.round((totalFocus / sessions.length) * 10000) / 10000;
  }

  /**
   * Get average active duration in minutes over last N sessions
   */
  public async getAverageActiveDuration(
    studentId: string,
    sessionCount: number = 5
  ): Promise<number> {
    const sessions = await this.getRecentSessions(studentId, sessionCount);
    if (sessions.length === 0) return 0;

    const totalActive = sessions.reduce((sum, s) => sum + s.active_duration_seconds, 0);
    return Math.round(totalActive / sessions.length / 60 * 100) / 100;
  }

  // ── Private ───────────────────────────────────────────────────────

  private async incrementSessionCounter(
    sessionId: string,
    eventType: EngagementEventType
  ): Promise<void> {
    const counterMap: Partial<Record<EngagementEventType, string>> = {
      scroll: 'scroll_count',
      click: 'click_count',
      exercise_answer: 'answer_count',
      exercise_correct: 'correct_answer_count',
      hint_request: 'hint_request_count',
      chat_message: 'chat_message_count',
      tab_away: 'tab_away_count',
    };

    const column = counterMap[eventType];
    if (column) {
      await EngagementSessionModel.updateOne(
        { _id: sessionId },
        { $inc: { [column]: 1 } }
      ).exec();
    }
  }
}

// ── Types ───────────────────────────────────────────────────────────────

interface SessionMetrics {
  activeDuration: number;
  idleDuration: number;
  scrollCount: number;
  clickCount: number;
  answerCount: number;
  correctAnswerCount: number;
  hintRequestCount: number;
  chatMessageCount: number;
  tabAwayCount: number;
  tabAwayTotalSeconds: number;
  quizCompleted: boolean;
  exercisesAttempted: number;
  exercisesCompleted: number;
  lessonsViewed: number;
}

export const engagementTrackingService = new EngagementTrackingService();
export default engagementTrackingService;
