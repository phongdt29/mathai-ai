import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Engagement ──────────────────────────────────────────────────────────

export interface IEngagementSession extends Document {
	student_id: mongoose.Types.ObjectId;
	lesson_id: mongoose.Types.ObjectId | null;
	curriculum_id: mongoose.Types.ObjectId | null;
	started_at: Date;
	ended_at: Date | null;
	total_duration_seconds: number;
	active_duration_seconds: number;
	idle_duration_seconds: number;
	focus_ratio: number;
	scroll_count: number;
	click_count: number;
	answer_count: number;
	correct_answer_count: number;
	hint_request_count: number;
	chat_message_count: number;
	tab_away_count: number;
	tab_away_total_seconds: number;
	quiz_completed: boolean;
	quiz_score: number | null;
	lessons_viewed: number;
	exercises_attempted: number;
	exercises_completed: number;
	status: string;
	createdAt: Date;
	updatedAt: Date;
}

const EngagementSessionSchema = new Schema<IEngagementSession>(
	{
		student_id: {
			type: Schema.Types.ObjectId,
			ref: "StudentProfile",
			required: true,
		},
		lesson_id: { type: Schema.Types.ObjectId, ref: "Lesson", default: null },
		curriculum_id: {
			type: Schema.Types.ObjectId,
			ref: "Curriculum",
			default: null,
		},
		started_at: { type: Date, required: true },
		ended_at: { type: Date, default: null },
		total_duration_seconds: { type: Number, default: 0 },
		active_duration_seconds: { type: Number, default: 0 },
		idle_duration_seconds: { type: Number, default: 0 },
		focus_ratio: { type: Number, default: 0 },
		scroll_count: { type: Number, default: 0 },
		click_count: { type: Number, default: 0 },
		answer_count: { type: Number, default: 0 },
		correct_answer_count: { type: Number, default: 0 },
		hint_request_count: { type: Number, default: 0 },
		chat_message_count: { type: Number, default: 0 },
		tab_away_count: { type: Number, default: 0 },
		tab_away_total_seconds: { type: Number, default: 0 },
		quiz_completed: { type: Boolean, default: false },
		quiz_score: { type: Number, default: null },
		lessons_viewed: { type: Number, default: 0 },
		exercises_attempted: { type: Number, default: 0 },
		exercises_completed: { type: Number, default: 0 },
		status: { type: String, default: "active" },
	},
	{ timestamps: true },
);

EngagementSessionSchema.index({ student_id: 1, status: 1 });
EngagementSessionSchema.index({ student_id: 1, started_at: -1 });

export const EngagementSessionModel = mongoose.model<IEngagementSession>(
	"EngagementSession",
	EngagementSessionSchema,
);

export interface IEngagementEvent extends Document {
	session_id: mongoose.Types.ObjectId;
	student_id: mongoose.Types.ObjectId;
	event_type: string;
	payload: any;
	lesson_id: mongoose.Types.ObjectId | null;
	exercise_id: mongoose.Types.ObjectId | null;
	createdAt: Date;
	updatedAt: Date;
}

const EngagementEventSchema = new Schema<IEngagementEvent>(
	{
		session_id: {
			type: Schema.Types.ObjectId,
			ref: "EngagementSession",
			required: true,
		},
		student_id: {
			type: Schema.Types.ObjectId,
			ref: "StudentProfile",
			required: true,
		},
		event_type: { type: String, required: true },
		payload: { type: Schema.Types.Mixed, default: null },
		lesson_id: { type: Schema.Types.ObjectId, ref: "Lesson", default: null },
		exercise_id: {
			type: Schema.Types.ObjectId,
			ref: "LessonExercise",
			default: null,
		},
	},
	{ timestamps: true },
);

EngagementEventSchema.index({ session_id: 1, createdAt: 1 });

export const EngagementEventModel = mongoose.model<IEngagementEvent>(
	"EngagementEvent",
	EngagementEventSchema,
);

// ── Attendance ──────────────────────────────────────────────────────────

export interface IAttendanceRecord extends Document {
	student_id: mongoose.Types.ObjectId;
	lesson_id: mongoose.Types.ObjectId | null;
	curriculum_id: mongoose.Types.ObjectId | null;
	session_id: mongoose.Types.ObjectId | null;
	scheduled_date: string;
	scheduled_start_time: string | null;
	actual_start_time: Date | null;
	actual_end_time: Date | null;
	status: string;
	expected_duration_minutes: number | null;
	active_duration_seconds: number | null;
	focus_ratio: number | null;
	quiz_completed: boolean;
	status_reason: string | null;
	createdAt: Date;
	updatedAt: Date;
}

const AttendanceRecordSchema = new Schema<IAttendanceRecord>(
	{
		student_id: {
			type: Schema.Types.ObjectId,
			ref: "StudentProfile",
			required: true,
		},
		lesson_id: { type: Schema.Types.ObjectId, ref: "Lesson", default: null },
		curriculum_id: {
			type: Schema.Types.ObjectId,
			ref: "Curriculum",
			default: null,
		},
		session_id: {
			type: Schema.Types.ObjectId,
			ref: "EngagementSession",
			default: null,
		},
		scheduled_date: { type: String, required: true },
		scheduled_start_time: { type: String, default: null },
		actual_start_time: { type: Date, default: null },
		actual_end_time: { type: Date, default: null },
		status: { type: String, default: "absent" },
		expected_duration_minutes: { type: Number, default: null },
		active_duration_seconds: { type: Number, default: null },
		focus_ratio: { type: Number, default: null },
		quiz_completed: { type: Boolean, default: false },
		status_reason: { type: String, default: null },
	},
	{ timestamps: true },
);

AttendanceRecordSchema.index({ student_id: 1, scheduled_date: -1 });

export const AttendanceRecordModel = mongoose.model<IAttendanceRecord>(
	"AttendanceRecord",
	AttendanceRecordSchema,
);

// ── Risk Scores ─────────────────────────────────────────────────────────

export interface ILearningRiskScore extends Document {
	student_id: mongoose.Types.ObjectId;
	score_date: string;
	absenteeism_rate: number;
	incomplete_session_rate: number;
	low_engagement_rate: number;
	quiz_decline_rate: number;
	missed_recommendation_rate: number;
	risk_score: number;
	risk_level: string;
	details: any;
	createdAt: Date;
	updatedAt: Date;
}

const LearningRiskScoreSchema = new Schema<ILearningRiskScore>(
	{
		student_id: {
			type: Schema.Types.ObjectId,
			ref: "StudentProfile",
			required: true,
		},
		score_date: { type: String, required: true },
		absenteeism_rate: { type: Number, default: 0 },
		incomplete_session_rate: { type: Number, default: 0 },
		low_engagement_rate: { type: Number, default: 0 },
		quiz_decline_rate: { type: Number, default: 0 },
		missed_recommendation_rate: { type: Number, default: 0 },
		risk_score: { type: Number, default: 0 },
		risk_level: { type: String, default: "low" },
		details: { type: Schema.Types.Mixed, default: null },
	},
	{ timestamps: true },
);

LearningRiskScoreSchema.index({ student_id: 1, score_date: -1 });

export const LearningRiskScoreModel = mongoose.model<ILearningRiskScore>(
	"LearningRiskScore",
	LearningRiskScoreSchema,
);

// ── Parent Notifications ────────────────────────────────────────────────

export interface IParentNotification extends Document {
	parent_user_id: mongoose.Types.ObjectId;
	student_id: mongoose.Types.ObjectId;
	type: string;
	title: string;
	content: string | null;
	payload: any;
	severity: string;
	is_read: boolean;
	read_at: Date | null;
	channel: string | null;
	delivered_at: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

const ParentNotificationSchema = new Schema<IParentNotification>(
	{
		parent_user_id: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		student_id: {
			type: Schema.Types.ObjectId,
			ref: "StudentProfile",
			required: true,
		},
		type: { type: String, required: true },
		title: { type: String, required: true },
		content: { type: String, default: null },
		payload: { type: Schema.Types.Mixed, default: null },
		severity: { type: String, default: "info" },
		is_read: { type: Boolean, default: false },
		read_at: { type: Date, default: null },
		channel: { type: String, default: null },
		delivered_at: { type: Date, default: null },
	},
	{ timestamps: true },
);

ParentNotificationSchema.index({
	parent_user_id: 1,
	is_read: 1,
	createdAt: -1,
});
ParentNotificationSchema.index(
	{ parent_user_id: 1, type: 1, "payload.period_key": 1 },
	{
		unique: true,
		partialFilterExpression: {
			type: "weekly_summary",
			"payload.period_key": { $exists: true },
		},
	},
);

export const ParentNotificationModel = mongoose.model<IParentNotification>(
	"ParentNotification",
	ParentNotificationSchema,
);

export interface IParentNotificationPreference extends Document {
	parent_user_id: mongoose.Types.ObjectId;
	notify_session_start: boolean;
	notify_session_complete: boolean;
	notify_absent: boolean;
	notify_daily_summary: boolean;
	notify_quiz_result: boolean;
	notify_absence: boolean;
	notify_low_engagement: boolean;
	notify_quiz_failure: boolean;
	notify_streak_break: boolean;
	notify_risk_alert: boolean;
	notify_weekly_summary: boolean;
	notify_achievement: boolean;
	preferred_channel: string;
	quiet_hours_start: string | null;
	quiet_hours_end: string | null;
	createdAt: Date;
	updatedAt: Date;
}

const ParentNotificationPreferenceSchema =
	new Schema<IParentNotificationPreference>(
		{
			parent_user_id: {
				type: Schema.Types.ObjectId,
				ref: "User",
				required: true,
			},
			notify_session_start: { type: Boolean, default: true },
			notify_session_complete: { type: Boolean, default: true },
			notify_absent: { type: Boolean, default: true },
			notify_daily_summary: { type: Boolean, default: false },
			notify_quiz_result: { type: Boolean, default: true },
			// Legacy preference keys kept for backward compatibility with existing data.
			notify_absence: { type: Boolean, default: true },
			notify_low_engagement: { type: Boolean, default: true },
			notify_quiz_failure: { type: Boolean, default: true },
			notify_streak_break: { type: Boolean, default: true },
			notify_risk_alert: { type: Boolean, default: true },
			notify_weekly_summary: { type: Boolean, default: true },
			notify_achievement: { type: Boolean, default: true },
			preferred_channel: { type: String, default: "in_app" },
			quiet_hours_start: { type: String, default: null },
			quiet_hours_end: { type: String, default: null },
		},
		{ timestamps: true },
	);

ParentNotificationPreferenceSchema.index(
	{ parent_user_id: 1 },
	{ unique: true },
);

export const ParentNotificationPreferenceModel =
	mongoose.model<IParentNotificationPreference>(
		"ParentNotificationPreference",
		ParentNotificationPreferenceSchema,
	);

// ── Repositories ────────────────────────────────────────────────────────

export class EngagementSessionRepository extends BaseRepository<IEngagementSession> {
	constructor() {
		super(EngagementSessionModel);
	}

	public async findActiveByStudent(
		studentId: string,
		session?: ClientSession,
	): Promise<IEngagementSession | null> {
		const query = this.model
			.findOne({ student_id: studentId, status: "active" })
			.sort({ started_at: -1 });
		if (session) query.session(session);
		return query.exec();
	}

	public async findRecentByStudent(
		studentId: string,
		limit: number = 10,
		session?: ClientSession,
	): Promise<IEngagementSession[]> {
		const query = this.model
			.find({
				student_id: studentId,
				status: { $in: ["completed", "abandoned"] },
			})
			.sort({ started_at: -1 })
			.limit(limit);
		if (session) query.session(session);
		return query.exec();
	}

	public async findByStudentInDateRange(
		studentId: string,
		startDate: string,
		endDate: string,
		session?: ClientSession,
	): Promise<IEngagementSession[]> {
		const query = this.model
			.find({
				student_id: studentId,
				started_at: { $gte: new Date(startDate), $lte: new Date(endDate) },
			})
			.sort({ started_at: -1 });
		if (session) query.session(session);
		return query.exec();
	}
}

export class EngagementEventRepository extends BaseRepository<IEngagementEvent> {
	constructor() {
		super(EngagementEventModel);
	}

	public async findBySession(
		sessionId: string,
		session?: ClientSession,
	): Promise<IEngagementEvent[]> {
		const query = this.model
			.find({ session_id: sessionId })
			.sort({ createdAt: 1 });
		if (session) query.session(session);
		return query.exec();
	}
}

export class AttendanceRecordRepository extends BaseRepository<IAttendanceRecord> {
	constructor() {
		super(AttendanceRecordModel);
	}

	public async findByStudent(
		studentId: string,
		limit: number = 30,
		session?: ClientSession,
	): Promise<IAttendanceRecord[]> {
		const query = this.model
			.find({ student_id: studentId })
			.sort({ scheduled_date: -1 })
			.limit(limit);
		if (session) query.session(session);
		return query.exec();
	}

	public async findByStudentAndLesson(
		studentId: string,
		lessonId: string,
		session?: ClientSession,
	): Promise<IAttendanceRecord | null> {
		const query = this.model.findOne({
			student_id: studentId,
			lesson_id: lessonId,
		});
		if (session) query.session(session);
		return query.exec();
	}

	public async countByStatus(
		studentId: string,
		days: number = 30,
	): Promise<{ present: number; partial: number; absent: number }> {
		const since = new Date();
		since.setDate(since.getDate() - days);
		const sinceStr = since.toISOString().split("T")[0];

		const rows = await this.model.aggregate([
			{
				$match: {
					student_id: new mongoose.Types.ObjectId(studentId),
					scheduled_date: { $gte: sinceStr },
				},
			},
			{ $group: { _id: "$status", count: { $sum: 1 } } },
		]);

		const result = { present: 0, partial: 0, absent: 0 };
		for (const row of rows) {
			if (row._id === "present") result.present = row.count;
			else if (row._id === "partial") result.partial = row.count;
			else if (row._id === "absent") result.absent = row.count;
		}
		return result;
	}
}

export class LearningRiskScoreRepository extends BaseRepository<ILearningRiskScore> {
	constructor() {
		super(LearningRiskScoreModel);
	}

	public async getLatest(
		studentId: string,
		session?: ClientSession,
	): Promise<ILearningRiskScore | null> {
		const query = this.model
			.findOne({ student_id: studentId })
			.sort({ score_date: -1 });
		if (session) query.session(session);
		return query.exec();
	}

	public async getHistory(
		studentId: string,
		days: number = 30,
		session?: ClientSession,
	): Promise<ILearningRiskScore[]> {
		const since = new Date();
		since.setDate(since.getDate() - days);
		const sinceStr = since.toISOString().split("T")[0];

		const query = this.model
			.find({ student_id: studentId, score_date: { $gte: sinceStr } })
			.sort({ score_date: 1 });
		if (session) query.session(session);
		return query.exec();
	}
}

export class ParentNotificationRepository extends BaseRepository<IParentNotification> {
	constructor() {
		super(ParentNotificationModel);
	}

	public async findByParent(
		parentUserId: string,
		limit: number = 20,
		session?: ClientSession,
	): Promise<IParentNotification[]> {
		const query = this.model
			.find({ parent_user_id: parentUserId })
			.sort({ createdAt: -1 })
			.limit(limit);
		if (session) query.session(session);
		return query.exec();
	}

	public async findUnreadByParent(
		parentUserId: string,
		session?: ClientSession,
	): Promise<IParentNotification[]> {
		const query = this.model
			.find({ parent_user_id: parentUserId, is_read: false })
			.sort({ createdAt: -1 });
		if (session) query.session(session);
		return query.exec();
	}

	public async findByStudentForParent(
		parentUserId: string,
		studentId: string,
		limit: number = 20,
		session?: ClientSession,
	): Promise<IParentNotification[]> {
		const query = this.model
			.find({ parent_user_id: parentUserId, student_id: studentId })
			.sort({ createdAt: -1 })
			.limit(limit);
		if (session) query.session(session);
		return query.exec();
	}

	public async markAsRead(id: string, session?: ClientSession): Promise<void> {
		const query = this.model.findByIdAndUpdate(id, {
			is_read: true,
			read_at: new Date(),
		});
		if (session) query.session(session);
		await query.exec();
	}

	public async markAllAsRead(
		parentUserId: string,
		session?: ClientSession,
	): Promise<void> {
		const query = this.model.updateMany(
			{ parent_user_id: parentUserId, is_read: false },
			{ is_read: true, read_at: new Date() },
		);
		if (session) query.session(session);
		await query.exec();
	}
}

export class ParentNotificationPreferenceRepository extends BaseRepository<IParentNotificationPreference> {
	constructor() {
		super(ParentNotificationPreferenceModel);
	}

	public async findByParent(
		parentUserId: string,
		session?: ClientSession,
	): Promise<IParentNotificationPreference | null> {
		const query = this.model.findOne({ parent_user_id: parentUserId });
		if (session) query.session(session);
		return query.exec();
	}
}

// ── Exports ─────────────────────────────────────────────────────────────

export const engagementSessionRepo = new EngagementSessionRepository();
export const engagementEventRepo = new EngagementEventRepository();
export const attendanceRecordRepo = new AttendanceRecordRepository();
export const learningRiskScoreRepo = new LearningRiskScoreRepository();
export const parentNotificationRepo = new ParentNotificationRepository();
export const parentNotificationPrefRepo =
	new ParentNotificationPreferenceRepository();
