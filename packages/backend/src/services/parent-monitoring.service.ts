import {
	AttendanceRecordModel,
	attendanceRecordRepo,
	engagementSessionRepo,
	learningRiskScoreRepo,
	parentNotificationPrefRepo,
	parentNotificationRepo,
} from "../models/engagement.model";
import {
	LessonModel,
	LessonQuizResultModel,
	LessonQuizResultRepository,
	LessonRepository,
} from "../models/lesson.model";
import { parentChildRepository } from "../models/parent-child.model";
import { StudentProfileRepository } from "../models/student.model";
import { UserRepository } from "../models/user.model";
import {
	AttendanceStatus,
	type JsonValue,
	type LessonQuizResult,
	type NotificationSeverity,
	type ParentDashboardData,
	type ParentNotification,
	type ParentNotificationPreference,
	type ParentNotificationType,
	type RiskLevel,
} from "../types";
import {
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "../utils/errors";
import { learningRiskService } from "./risk.service";

function normalizeParentReportRangeDays(rangeDays: number | undefined): number {
	return typeof rangeDays === "number" &&
		Number.isFinite(rangeDays) &&
		rangeDays > 0
		? Math.min(Math.round(rangeDays), 30)
		: 7;
}

/**
 * ParentMonitoringService
 *
 * Provides parent dashboard data, alert system, and notification management.
 *
 * Parents see:
 * 1. Today's schedule and attendance status
 * 2. Study stats (active time, focus ratio)
 * 3. Recent quiz results
 * 4. Risk score (green/yellow/red)
 * 5. Alerts and intervention suggestions
 */
export class ParentMonitoringService {
	private readonly studentRepo: StudentProfileRepository;
	private readonly userRepo: UserRepository;
	private readonly lessonRepo: LessonRepository;
	private readonly quizResultRepo: LessonQuizResultRepository;
	private readonly parentChildRepository: Pick<
		typeof parentChildRepository,
		| "findChildrenByParent"
		| "findParentsByStudent"
		| "findRelation"
		| "create"
		| "deleteRelation"
	>;

	constructor() {
		this.studentRepo = new StudentProfileRepository();
		this.userRepo = new UserRepository();
		this.lessonRepo = new LessonRepository();
		this.quizResultRepo = new LessonQuizResultRepository();
		this.parentChildRepository = parentChildRepository;
	}

	/**
	 * Get full dashboard data for a parent viewing a specific child.
	 */
	public async getDashboard(
		parentUserId: number,
		studentId: number,
		rangeDays: number = 7,
	): Promise<ParentDashboardData> {
		const boundedRangeDays = normalizeParentReportRangeDays(rangeDays);
		// Verify parent-child relationship
		await this.verifyParentChild(parentUserId as any, studentId as any);

		const [
			profile,
			user,
			attendanceSummary,
			recentSessions,
			recentQuizzes,
			riskScore,
			alerts,
		] = await Promise.all([
			this.studentRepo.findById(studentId as any),
			this.getStudentUser(studentId),
			attendanceRecordRepo.countByStatus(studentId as any, boundedRangeDays),
			engagementSessionRepo.findRecentByStudent(
				studentId as any,
				boundedRangeDays,
			),
			this.getRecentQuizResults(studentId, 5, boundedRangeDays),
			learningRiskScoreRepo.getLatest(studentId as any),
			parentNotificationRepo.findByStudentForParent(
				parentUserId as any,
				studentId as any,
				10,
			),
		]);

		// Compute study stats from recent sessions
		const avgActiveMinutes =
			recentSessions.length > 0
				? Math.round(
						(recentSessions.reduce(
							(sum, s) => sum + s.active_duration_seconds,
							0,
						) /
							recentSessions.length /
							60) *
							100,
					) / 100
				: 0;
		const avgFocusRatio =
			recentSessions.length > 0
				? Math.round(
						(recentSessions.reduce((sum, s) => sum + Number(s.focus_ratio), 0) /
							recentSessions.length) *
							10000,
					) / 10000
				: 0;

		// Today's schedule
		const todaySchedule = await this.getTodaySchedule(studentId as any);

		// Risk
		const risk = riskScore
			? { score: Number(riskScore.risk_score), level: riskScore.risk_level }
			: { score: 0, level: "low" as RiskLevel };

		// Intervention suggestions
		const suggestions = riskScore
			? learningRiskService.generateInterventionSuggestions(riskScore as any)
			: [];

		return {
			student: {
				id: String(studentId),
				name: user?.full_name ?? "N/A",
				grade_level: profile?.grade_level ?? null,
			},
			today_schedule: todaySchedule,
			attendance_summary: {
				...attendanceSummary,
				total:
					attendanceSummary.present +
					attendanceSummary.partial +
					attendanceSummary.absent,
			},
			study_stats: {
				avg_active_minutes_per_session: avgActiveMinutes,
				avg_focus_ratio: avgFocusRatio,
				total_sessions_7d: recentSessions.length,
			},
			recent_quiz_results: recentQuizzes.map((q) => ({
				lesson_title: `Quiz #${q.lesson_id}`,
				score: Number(q.score ?? 0),
				max_score: Number(q.max_score ?? 0),
				date: new Date((q as any).created_at ?? (q as any).createdAt)
					.toISOString()
					.split("T")[0]!,
			})),
			risk: risk as any,
			alerts: alerts.map((a) => ({
				type: a.type as ParentNotificationType,
				severity: a.severity as NotificationSeverity,
				title: a.title,
				content: a.content ?? "",
				created_at: new Date(
					(a as any).created_at ?? (a as any).createdAt,
				).toISOString(),
			})),
			intervention_suggestions: suggestions,
		};
	}

	/**
	 * Get children IDs for a parent.
	 */
	public async getChildren(
		parentUserId: string,
	): Promise<Array<{ student_id: string; full_name: string }>> {
		const relations =
			await this.parentChildRepository.findChildrenByParent(parentUserId);
		const results: Array<{ student_id: string; full_name: string }> = [];
		for (const rel of relations) {
			const profile = await this.studentRepo.findById(
				rel.student_id.toString(),
			);
			if (!profile) continue;
			const user = await this.userRepo.findById(profile.user_id.toString());
			if (user)
				results.push({
					student_id: rel.student_id.toString(),
					full_name: user.full_name,
				});
		}
		return results;
	}

	/**
	 * Link a parent account to a student after verifying private student facts.
	 */
	public async linkChild(
		parentUserId: string,
		input: { student_email: string; date_of_birth: string },
	): Promise<{
		student_id: string;
		full_name: string;
		already_linked: boolean;
	}> {
		const email = input.student_email.trim().toLowerCase();
		const studentUser = await this.userRepo.findByEmail(email);

		if (
			!studentUser ||
			studentUser.role !== "student" ||
			!studentUser.is_active
		) {
			throw new ValidationError(
				"Không thể xác minh học sinh với thông tin đã cung cấp",
			);
		}

		const profile = await this.studentRepo.findByUserId(studentUser.id);
		if (
			!profile ||
			!this.birthDateMatches(
				(profile as any).date_of_birth,
				input.date_of_birth,
			)
		) {
			throw new ValidationError(
				"Không thể xác minh học sinh với thông tin đã cung cấp",
			);
		}

		const studentId = String(profile.id);
		const existingRelation = await this.parentChildRepository.findRelation(
			parentUserId,
			studentId,
		);
		if (existingRelation) {
			return {
				student_id: studentId,
				full_name: studentUser.full_name,
				already_linked: true,
			};
		}

		await this.parentChildRepository.create({
			parent_user_id: parentUserId,
			student_id: studentId,
		} as any);

		return {
			student_id: studentId,
			full_name: studentUser.full_name,
			already_linked: false,
		};
	}

	/**
	 * Remove a verified parent-child relation without changing student data.
	 */
	public async unlinkChild(
		parentUserId: string,
		studentId: string,
	): Promise<{ student_id: string; full_name: string }> {
		const existingRelation = await this.parentChildRepository.findRelation(
			parentUserId,
			studentId,
		);
		if (!existingRelation) {
			throw new ForbiddenError(
				"Không có quyền truy cập thông tin học sinh này",
			);
		}

		const profile = await this.studentRepo.findById(studentId);
		const user = profile
			? await this.userRepo.findById(profile.user_id.toString())
			: null;

		const deleted = await this.parentChildRepository.deleteRelation(
			parentUserId,
			studentId,
		);
		if (!deleted) {
			throw new NotFoundError("Không tìm thấy liên kết phụ huynh-học sinh");
		}

		return {
			student_id: studentId,
			full_name: user?.full_name ?? "Học sinh đã hủy liên kết",
		};
	}

	/**
	 * Build a parent-safe weekly summary across linked children.
	 */
	public async getWeeklyReport(
		parentUserId: string,
		rangeDays: number = 7,
	): Promise<{
		generated_at: string;
		range_days: number;
		totals: {
			students: number;
			sessions: number;
			active_minutes: number;
			alerts: number;
		};
		students: Array<{
			student_id: string;
			student_name: string;
			grade_level: number | null;
			sessions: number;
			active_minutes: number;
			attendance_rate: number | null;
			avg_quiz_score: number | null;
			risk_level: RiskLevel;
			alerts: number;
			intervention_suggestions: string[];
		}>;
		follow_up_actions: string[];
	}> {
		const boundedRangeDays = normalizeParentReportRangeDays(rangeDays);
		const children = await this.getChildren(parentUserId);
		const dashboards = await Promise.all(
			children.map((child) =>
				this.getDashboard(
					parentUserId as any,
					child.student_id as any,
					boundedRangeDays,
				),
			),
		);

		const followUpActions: string[] = [];
		const students = dashboards.map((dashboard) => {
			const totalAttendance = dashboard.attendance_summary.total;
			const attendanceRate =
				totalAttendance > 0
					? Math.round(
							((dashboard.attendance_summary.present +
								dashboard.attendance_summary.partial) /
								totalAttendance) *
								100,
						)
					: null;
			const avgQuizScore =
				dashboard.recent_quiz_results.length > 0
					? Math.round(
							dashboard.recent_quiz_results.reduce((sum, quiz) => {
								const maxScore = Number(quiz.max_score || 0);
								if (maxScore <= 0) return sum;
								return sum + (Number(quiz.score || 0) / maxScore) * 100;
							}, 0) / dashboard.recent_quiz_results.length,
						)
					: null;
			const activeMinutes = Math.round(
				dashboard.study_stats.avg_active_minutes_per_session *
					dashboard.study_stats.total_sessions_7d,
			);

			for (const suggestion of dashboard.intervention_suggestions) {
				if (!followUpActions.includes(suggestion))
					followUpActions.push(suggestion);
			}

			return {
				student_id: String(dashboard.student.id ?? ""),
				student_name: dashboard.student.name,
				grade_level: dashboard.student.grade_level,
				sessions: dashboard.study_stats.total_sessions_7d,
				active_minutes: activeMinutes,
				attendance_rate: attendanceRate,
				avg_quiz_score: avgQuizScore,
				risk_level: dashboard.risk.level,
				alerts: dashboard.alerts.length,
				intervention_suggestions: dashboard.intervention_suggestions,
			};
		});

		return {
			generated_at: new Date().toISOString(),
			range_days: boundedRangeDays,
			totals: {
				students: students.length,
				sessions: students.reduce((sum, student) => sum + student.sessions, 0),
				active_minutes: students.reduce(
					(sum, student) => sum + student.active_minutes,
					0,
				),
				alerts: students.reduce((sum, student) => sum + student.alerts, 0),
			},
			students,
			follow_up_actions: followUpActions,
		};
	}
	// ── Notification Triggers ─────────────────────────────────────────

	/**
	 * Send notification to parent(s) of a student.
	 */
	public async notifyParents(
		studentId: number,
		type: ParentNotificationType,
		title: string,
		content: string,
		severity: NotificationSeverity = "info",
		payload?: JsonValue,
	): Promise<void> {
		const parentIds = await this.getParentUserIds(studentId as any);

		for (const parentUserId of parentIds) {
			// Check preferences
			const prefs = await parentNotificationPrefRepo.findByParent(
				parentUserId as any,
			);
			if (prefs && !this.shouldNotify(prefs as any, type)) continue;

			await parentNotificationRepo.create({
				parent_user_id: parentUserId,
				student_id: studentId,
				type,
				title,
				content,
				payload: payload ?? null,
				severity,
				is_read: false,
				channel: (prefs as any)?.preferred_channel ?? "in_app",
			} as any);
		}
	}

	/**
	 * Check and trigger alerts based on student behavior.
	 * Should be called after each session ends.
	 */
	public async checkAndTriggerAlerts(studentId: number): Promise<void> {
		// 1. Check consecutive absences
		const consecutiveAbsences = await this.getConsecutiveAbsences(
			studentId as any,
		);
		if (consecutiveAbsences >= 2) {
			await this.notifyParents(
				studentId,
				"absent",
				`Vắng ${consecutiveAbsences} buổi liên tiếp`,
				`Học sinh đã vắng ${consecutiveAbsences} buổi liên tiếp. Cần nhắc nhở con vào học.`,
				"warning",
			);
		}

		// 2. Check quiz score decline (3 consecutive drops)
		const recentQuizzes = await this.getRecentQuizResults(studentId as any, 5);
		if (recentQuizzes.length >= 3) {
			const scores = recentQuizzes
				.slice(0, 3)
				.map((q) => Number(q.percentage ?? 0));
			const isDecreasing = scores[0]! < scores[1]! && scores[1]! < scores[2]!;
			if (isDecreasing) {
				await this.notifyParents(
					studentId,
					"risk_alert",
					"Điểm quiz giảm 3 buổi liên tiếp",
					`Điểm quiz đang giảm liên tục: ${scores.reverse().join("% → ")}%. Cần tăng ôn phần cũ.`,
					"warning",
				);
			}
		}

		// 3. Risk score check
		const risk = await learningRiskScoreRepo.getLatest(studentId as any);
		if (risk && risk.risk_level === "high") {
			await this.notifyParents(
				studentId,
				"risk_alert",
				"Cảnh báo: nguy cơ tụt tiến độ cao",
				`Risk score: ${Number(risk.risk_score)}/100. ${learningRiskService.generateInterventionSuggestions(risk as any).join(" ")}`,
				"critical",
			);
		}
	}

	/**
	 * Notify session start (basic notification)
	 */
	public async notifySessionStart(
		studentId: number,
		lessonTitle: string,
	): Promise<void> {
		await this.notifyParents(
			studentId,
			"session_start",
			"Bắt đầu buổi học",
			`Con đã bắt đầu học bài: "${lessonTitle}"`,
			"info",
		);
	}

	/**
	 * Notify session complete
	 */
	public async notifySessionComplete(
		studentId: number,
		lessonTitle: string,
		activeMinutes: number,
		focusRatio: number,
		quizScore?: number,
	): Promise<void> {
		const content = [
			`Con đã hoàn thành bài: "${lessonTitle}"`,
			`Thời gian học thực: ${activeMinutes} phút`,
			`Mức tập trung: ${Math.round(focusRatio * 100)}%`,
			quizScore !== undefined ? `Điểm quiz: ${quizScore}%` : "Chưa có quiz",
		].join("\n");

		await this.notifyParents(
			studentId,
			"session_complete",
			"Hoàn thành buổi học",
			content,
			"info",
			{
				active_minutes: activeMinutes,
				focus_ratio: focusRatio,
				quiz_score: quizScore ?? null,
			},
		);
	}

	// ── Notification Management ───────────────────────────────────────

	public async getNotifications(
		parentUserId: number,
		limit: number = 20,
	): Promise<ParentNotification[]> {
		return parentNotificationRepo.findByParent(
			parentUserId as any,
			limit,
		) as any;
	}

	public async getUnreadNotifications(
		parentUserId: number,
	): Promise<ParentNotification[]> {
		return parentNotificationRepo.findUnreadByParent(
			parentUserId as any,
		) as any;
	}

	public async markNotificationRead(
		parentUserId: number,
		notificationId: number,
	): Promise<void> {
		const notification = await parentNotificationRepo.findById(
			notificationId as any,
		);
		if (!notification) {
			throw new NotFoundError("Không tìm thấy thông báo");
		}
		if (notification.parent_user_id.toString() !== String(parentUserId)) {
			throw new ForbiddenError("Không có quyền truy cập thông báo này");
		}
		await parentNotificationRepo.markAsRead(notificationId as any);
	}

	public async markAllNotificationsRead(parentUserId: number): Promise<void> {
		await parentNotificationRepo.markAllAsRead(parentUserId as any);
	}

	public async getPreferences(
		parentUserId: number,
	): Promise<ParentNotificationPreference | null> {
		return parentNotificationPrefRepo.findByParent(parentUserId as any) as any;
	}

	public async updatePreferences(
		parentUserId: number,
		prefs: Partial<ParentNotificationPreference>,
	): Promise<ParentNotificationPreference> {
		const existing = await parentNotificationPrefRepo.findByParent(
			parentUserId as any,
		);
		if (existing) {
			return parentNotificationPrefRepo.update(
				existing.id,
				prefs as any,
			) as any;
		}
		return parentNotificationPrefRepo.create({
			parent_user_id: parentUserId,
			...prefs,
		} as any) as any;
	}

	// ── Private Helpers ───────────────────────────────────────────────

	private async verifyParentChild(
		parentUserId: string,
		studentId: string,
	): Promise<void> {
		const row = await this.parentChildRepository.findRelation(
			parentUserId as any,
			studentId as any,
		);
		if (!row) {
			throw new ForbiddenError(
				"Không có quyền truy cập thông tin học sinh này",
			);
		}
	}

	private async getParentUserIds(studentId: string): Promise<string[]> {
		const rows = await this.parentChildRepository.findParentsByStudent(
			studentId as any,
		);
		return rows.map((r) => r.parent_user_id.toString());
	}

	private birthDateMatches(
		rawBirthDate: Date | string | null | undefined,
		expectedDate: string,
	): boolean {
		if (!rawBirthDate) return false;
		const actualDate =
			rawBirthDate instanceof Date
				? rawBirthDate.toISOString().slice(0, 10)
				: String(rawBirthDate).slice(0, 10);
		return actualDate === expectedDate;
	}

	private async getStudentUser(
		studentId: number,
	): Promise<{ full_name: string } | null> {
		const profile = await this.studentRepo.findById(studentId as any);
		if (!profile) return null;
		const user = await this.userRepo.findById(profile.user_id as any);
		return user ? { full_name: user.full_name } : null;
	}

	private async getTodaySchedule(
		studentId: string,
	): Promise<ParentDashboardData["today_schedule"]> {
		const today = new Date().toISOString().split("T")[0]!;
		const attendance = (await AttendanceRecordModel.findOne({
			student_id: studentId,
			scheduled_date: today,
		}).exec()) as any;

		if (!attendance) {
			// Check if there's a scheduled lesson
			const lesson = (await LessonModel.findOne({
				student_id: studentId,
				lesson_date: today,
			}).exec()) as any;

			if (lesson) {
				return {
					lesson_title: lesson.lesson_title,
					scheduled_time: null,
					expected_duration_minutes: lesson.estimated_minutes ?? 45,
					status: "scheduled",
				};
			}
			return null;
		}

		const lesson = await this.lessonRepo.findById(attendance.lesson_id);
		return {
			lesson_title: lesson?.lesson_title ?? "N/A",
			scheduled_time: attendance.scheduled_start_time,
			expected_duration_minutes: attendance.expected_duration_minutes,
			status: attendance.status,
		};
	}

	private async getRecentQuizResults(
		studentId: number,
		limit: number,
		rangeDays?: number,
	): Promise<LessonQuizResult[]> {
		const filter: Record<string, unknown> = { student_id: studentId };
		if (rangeDays !== undefined) {
			const since = new Date();
			since.setDate(
				since.getDate() - normalizeParentReportRangeDays(rangeDays),
			);
			filter.submitted_at = { $gte: since };
		}

		return (await LessonQuizResultModel.find(filter)
			.sort({ submitted_at: -1 })
			.limit(limit)
			.exec()) as unknown as LessonQuizResult[];
	}

	private async getConsecutiveAbsences(studentId: number): Promise<number> {
		const records = await attendanceRecordRepo.findByStudent(
			studentId as any,
			10,
		);
		let count = 0;
		for (const record of records) {
			if (record.status === "absent") count++;
			else break;
		}
		return count;
	}

	private shouldNotify(
		prefs: ParentNotificationPreference,
		type: ParentNotificationType,
	): boolean {
		const readBoolean = (
			primaryKey: keyof ParentNotificationPreference,
			fallbackKey?: keyof ParentNotificationPreference,
		): boolean => {
			const primaryValue = prefs[primaryKey];
			if (primaryValue !== undefined && primaryValue !== null)
				return Boolean(primaryValue);
			if (fallbackKey) {
				const fallbackValue = prefs[fallbackKey];
				if (fallbackValue !== undefined && fallbackValue !== null)
					return Boolean(fallbackValue);
			}
			return true;
		};

		switch (type) {
			case "session_start":
				return readBoolean("notify_session_start");
			case "session_complete":
				return readBoolean("notify_session_complete");
			case "absent":
				return readBoolean(
					"notify_absent",
					"notify_absence" as keyof ParentNotificationPreference,
				);
			case "daily_summary":
				return readBoolean("notify_daily_summary");
			case "weekly_summary":
				return readBoolean("notify_weekly_summary");
			case "risk_alert":
				return readBoolean("notify_risk_alert");
			case "achievement":
				return readBoolean("notify_achievement");
			case "quiz_result":
				return readBoolean(
					"notify_quiz_result",
					"notify_quiz_failure" as keyof ParentNotificationPreference,
				);
			default:
				return true;
		}
	}
}

export const parentMonitoringService = new ParentMonitoringService();
export default parentMonitoringService;
