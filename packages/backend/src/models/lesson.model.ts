import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

export interface ILesson extends Document {
	curriculum_id: mongoose.Types.ObjectId;
	module_id: mongoose.Types.ObjectId;
	student_id: mongoose.Types.ObjectId;
	lesson_title: string;
	lesson_date: Date | null;
	theory_content: string | null;
	lesson_objective: string | null;
	ai_tutor_id: mongoose.Types.ObjectId | null;
	estimated_minutes: number | null;
	order_index: number;
	status: string;
	createdAt: Date;
	updatedAt: Date;
}

const LessonSchema = new Schema<ILesson>(
	{
		curriculum_id: {
			type: Schema.Types.ObjectId,
			ref: "Curriculum",
			required: true,
		},
		module_id: {
			type: Schema.Types.ObjectId,
			ref: "CurriculumModule",
			required: true,
		},
		student_id: {
			type: Schema.Types.ObjectId,
			ref: "StudentProfile",
			required: true,
		},
		lesson_title: { type: String, required: true },
		lesson_date: { type: Date, default: null },
		theory_content: { type: String, default: null },
		lesson_objective: { type: String, default: null },
		ai_tutor_id: { type: Schema.Types.ObjectId, ref: "AITutor", default: null },
		estimated_minutes: { type: Number, default: null },
		order_index: { type: Number, required: true },
		status: { type: String, default: "pending" },
	},
	{ timestamps: true },
);

LessonSchema.index({ module_id: 1, order_index: 1 });
LessonSchema.index({ curriculum_id: 1, order_index: 1 });
LessonSchema.index({ student_id: 1 });

export const LessonModel = mongoose.model<ILesson>("Lesson", LessonSchema);

export interface ILessonExercise extends Document {
	lesson_id: mongoose.Types.ObjectId;
	topic: string | null;
	difficulty_level: string | null;
	question_text: string;
	answer_type: string;
	choices: any;
	correct_answer: string;
	solution_steps: any;
	explanation: string | null;
	order_index: number;
	createdAt: Date;
	updatedAt: Date;
}

const LessonExerciseSchema = new Schema<ILessonExercise>(
	{
		lesson_id: { type: Schema.Types.ObjectId, ref: "Lesson", required: true },
		topic: { type: String, default: null },
		difficulty_level: { type: String, default: null },
		question_text: { type: String, required: true },
		answer_type: { type: String, required: true },
		choices: { type: Schema.Types.Mixed, default: null },
		correct_answer: { type: String, required: true },
		solution_steps: { type: Schema.Types.Mixed, default: null },
		explanation: { type: String, default: null },
		order_index: { type: Number, required: true },
	},
	{ timestamps: true },
);

LessonExerciseSchema.index({ lesson_id: 1, order_index: 1 });

export const LessonExerciseModel = mongoose.model<ILessonExercise>(
	"LessonExercise",
	LessonExerciseSchema,
);

export interface ILessonExerciseAnswer extends Document {
	exercise_id: mongoose.Types.ObjectId;
	lesson_id: mongoose.Types.ObjectId | null;
	student_id: mongoose.Types.ObjectId;
	quiz_result_id: mongoose.Types.ObjectId | null;
	student_answer: string | null;
	selected_choice: string | null;
	is_correct: boolean | null;
	score: number | null;
	ai_comment: string | null;
	exercise_snapshot: any;
	answered_at: Date;
	createdAt: Date;
	updatedAt: Date;
}

const LessonExerciseAnswerSchema = new Schema<ILessonExerciseAnswer>(
	{
		exercise_id: {
			type: Schema.Types.ObjectId,
			ref: "LessonExercise",
			required: true,
		},
		lesson_id: { type: Schema.Types.ObjectId, ref: "Lesson", default: null },
		student_id: {
			type: Schema.Types.ObjectId,
			ref: "StudentProfile",
			required: true,
		},
		quiz_result_id: {
			type: Schema.Types.ObjectId,
			ref: "LessonQuizResult",
			default: null,
		},
		student_answer: { type: String, default: null },
		selected_choice: { type: String, default: null },
		is_correct: { type: Boolean, default: null },
		score: { type: Number, default: null },
		ai_comment: { type: String, default: null },
		exercise_snapshot: { type: Schema.Types.Mixed, default: null },
		answered_at: { type: Date, default: Date.now },
	},
	{ timestamps: true },
);

LessonExerciseAnswerSchema.index({ exercise_id: 1 });
LessonExerciseAnswerSchema.index({
	lesson_id: 1,
	student_id: 1,
	answered_at: -1,
});
LessonExerciseAnswerSchema.index({ quiz_result_id: 1 });
LessonExerciseAnswerSchema.index({ student_id: 1 });

export const LessonExerciseAnswerModel = mongoose.model<ILessonExerciseAnswer>(
	"LessonExerciseAnswer",
	LessonExerciseAnswerSchema,
);

export interface ILessonQuizResult extends Document {
	lesson_id: mongoose.Types.ObjectId;
	student_id: mongoose.Types.ObjectId;
	idempotency_key: string | null;
	total_questions: number;
	correct_answers: number;
	score: number;
	max_score: number;
	percentage: number;
	duration_seconds: number | null;
	ai_feedback: string | null;
	passed: boolean;
	started_at: Date | null;
	submitted_at: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

const LessonQuizResultSchema = new Schema<ILessonQuizResult>(
	{
		lesson_id: { type: Schema.Types.ObjectId, ref: "Lesson", required: true },
		student_id: {
			type: Schema.Types.ObjectId,
			ref: "StudentProfile",
			required: true,
		},
		idempotency_key: { type: String, default: null },
		total_questions: { type: Number, required: true },
		correct_answers: { type: Number, required: true },
		score: { type: Number, required: true },
		max_score: { type: Number, required: true },
		percentage: { type: Number, required: true },
		duration_seconds: { type: Number, default: null },
		ai_feedback: { type: String, default: null },
		passed: { type: Boolean, default: false },
		started_at: { type: Date, default: null },
		submitted_at: { type: Date, default: null },
	},
	{ timestamps: true },
);

LessonQuizResultSchema.index({ lesson_id: 1 });
LessonQuizResultSchema.index({ student_id: 1 });
LessonQuizResultSchema.index(
	{ student_id: 1, lesson_id: 1, idempotency_key: 1 },
	{
		unique: true,
		partialFilterExpression: { idempotency_key: { $exists: true, $ne: null } },
	},
);

export const LessonQuizResultModel = mongoose.model<ILessonQuizResult>(
	"LessonQuizResult",
	LessonQuizResultSchema,
);

export interface ILessonRecommendation extends Document {
	student_id: mongoose.Types.ObjectId;
	lesson_id: mongoose.Types.ObjectId;
	recommendation_type: string;
	reason: string | null;
	priority: number;
	is_completed: boolean;
	recommended_date: string;
	createdAt: Date;
	updatedAt: Date;
}

const LessonRecommendationSchema = new Schema<ILessonRecommendation>(
	{
		student_id: {
			type: Schema.Types.ObjectId,
			ref: "StudentProfile",
			required: true,
		},
		lesson_id: { type: Schema.Types.ObjectId, ref: "Lesson", required: true },
		recommendation_type: { type: String, required: true },
		reason: { type: String, default: null },
		priority: { type: Number, default: 0 },
		is_completed: { type: Boolean, default: false },
		recommended_date: { type: String, required: true },
	},
	{ timestamps: true },
);

LessonRecommendationSchema.index({ student_id: 1, recommended_date: 1 });
LessonRecommendationSchema.index(
	{
		student_id: 1,
		lesson_id: 1,
		recommendation_type: 1,
		recommended_date: 1,
	},
	{ unique: true },
);

export const LessonRecommendationModel = mongoose.model<ILessonRecommendation>(
	"LessonRecommendation",
	LessonRecommendationSchema,
);

export interface LessonWithExercises extends ILesson {
	exercises: ILessonExercise[];
}

export class LessonRepository extends BaseRepository<ILesson> {
	constructor() {
		super(LessonModel);
	}

	public async findByModule(
		moduleId: string,
		session?: ClientSession,
	): Promise<ILesson[]> {
		const query = this.model
			.find({ module_id: moduleId })
			.sort({ order_index: 1 });
		if (session) query.session(session);
		return query.exec();
	}

	public async findByCurriculum(
		curriculumId: string,
		session?: ClientSession,
	): Promise<ILesson[]> {
		const query = this.model
			.find({ curriculum_id: curriculumId })
			.sort({ order_index: 1 });
		if (session) query.session(session);
		return query.exec();
	}

	public async findWithExercises(
		lessonId: string,
		session?: ClientSession,
	): Promise<LessonWithExercises | null> {
		const lesson = await this.findById(lessonId, session);

		if (!lesson) {
			return null;
		}

		const exercises = await lessonExerciseRepository.findByLessonId(
			lessonId,
			session,
		);

		return {
			...lesson.toObject(),
			exercises,
		} as LessonWithExercises;
	}

	public async findTodayRecommendation(
		studentId: string,
		session?: ClientSession,
	): Promise<ILessonRecommendation | null> {
		const today = new Date().toISOString().slice(0, 10);
		const query = LessonRecommendationModel.findOne({
			student_id: studentId,
			recommended_date: today,
			is_completed: false,
		}).sort({ priority: -1 });
		if (session) query.session(session);
		const recommendation = await query.exec();
		return recommendation ?? null;
	}
}

export class LessonExerciseRepository extends BaseRepository<ILessonExercise> {
	constructor() {
		super(LessonExerciseModel);
	}

	public async findByLessonId(
		lessonId: string,
		session?: ClientSession,
	): Promise<ILessonExercise[]> {
		const query = this.model
			.find({ lesson_id: lessonId })
			.sort({ order_index: 1 });
		if (session) query.session(session);
		return query.exec();
	}
}

export class LessonExerciseAnswerRepository extends BaseRepository<ILessonExerciseAnswer> {
	constructor() {
		super(LessonExerciseAnswerModel);
	}

	public async findByStudent(
		studentId: string,
		session?: ClientSession,
	): Promise<ILessonExerciseAnswer[]> {
		const query = this.model
			.find({ student_id: studentId })
			.sort({ answered_at: -1 });
		if (session) query.session(session);
		return query.exec();
	}

	public async findByLessonAndStudent(
		lessonId: string,
		studentId: string,
		session?: ClientSession,
	): Promise<ILessonExerciseAnswer[]> {
		const query = this.model
			.find({ lesson_id: lessonId, student_id: studentId })
			.sort({ answered_at: -1, createdAt: -1 });
		if (session) query.session(session);
		return query.exec();
	}

	public async findByQuizResultIds(
		quizResultIds: string[],
		session?: ClientSession,
	): Promise<ILessonExerciseAnswer[]> {
		const query = this.model
			.find({ quiz_result_id: { $in: quizResultIds } })
			.sort({ answered_at: 1, createdAt: 1 });
		if (session) query.session(session);
		return query.exec();
	}
}

export class LessonQuizResultRepository extends BaseRepository<ILessonQuizResult> {
	constructor() {
		super(LessonQuizResultModel);
	}

	public async findByStudent(
		studentId: string,
		session?: ClientSession,
	): Promise<ILessonQuizResult[]> {
		const query = this.model
			.find({ student_id: studentId })
			.sort({ submitted_at: -1 });
		if (session) query.session(session);
		return query.exec();
	}

	public async findByLessonAndStudent(
		lessonId: string,
		studentId: string,
		session?: ClientSession,
	): Promise<ILessonQuizResult[]> {
		const query = this.model
			.find({ lesson_id: lessonId, student_id: studentId })
			.sort({ submitted_at: -1, createdAt: -1 });
		if (session) query.session(session);
		return query.exec();
	}

	public async findByIdempotencyKey(
		studentId: string,
		lessonId: string,
		idempotencyKey: string,
		session?: ClientSession,
	): Promise<ILessonQuizResult | null> {
		const query = this.model.findOne({
			student_id: studentId,
			lesson_id: lessonId,
			idempotency_key: idempotencyKey,
		});
		if (session) query.session(session);
		return query.exec();
	}

	public async createQuizResult(
		data: Partial<ILessonQuizResult>,
		session?: ClientSession,
	): Promise<ILessonQuizResult> {
		return this.create(data, session);
	}
}

export const lessonRepository = new LessonRepository();
export const lessonExerciseRepository = new LessonExerciseRepository();
export const lessonExerciseAnswerRepository =
	new LessonExerciseAnswerRepository();
export const lessonQuizResultRepository = new LessonQuizResultRepository();
