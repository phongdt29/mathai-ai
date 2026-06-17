import mongoose, { Schema, type ClientSession, type Document } from "mongoose";
import BaseRepository from "./base.model";

export type GradebookSourceType = "teacher_assignment" | "assessment" | "lesson";

export interface IGradebookEntry extends Document {
	student_id: mongoose.Types.ObjectId;
	class_id: mongoose.Types.ObjectId | null;
	teacher_id: mongoose.Types.ObjectId | null;
	source_type: GradebookSourceType;
	source_id: string;
	attempt_id: string | null;
	title: string;
	earned_points: number;
	max_points: number;
	percentage: number;
	status: "graded" | "submitted" | "missing";
	graded_at: Date | null;
	submitted_at: Date | null;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
}

const GradebookEntrySchema = new Schema<IGradebookEntry>(
	{
		student_id: { type: Schema.Types.ObjectId, ref: "StudentProfile", required: true },
		class_id: { type: Schema.Types.ObjectId, ref: "TeacherClass", default: null },
		teacher_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
		source_type: {
			type: String,
			enum: ["teacher_assignment", "assessment", "lesson"],
			required: true,
		},
		source_id: { type: String, required: true },
		attempt_id: { type: String, default: null },
		title: { type: String, required: true, trim: true },
		earned_points: { type: Number, required: true, min: 0 },
		max_points: { type: Number, required: true, min: 0 },
		percentage: { type: Number, required: true, min: 0, max: 100 },
		status: { type: String, enum: ["graded", "submitted", "missing"], default: "graded" },
		graded_at: { type: Date, default: null },
		submitted_at: { type: Date, default: null },
		metadata: { type: Schema.Types.Mixed, default: null },
	},
	{ timestamps: true },
);

GradebookEntrySchema.index({ student_id: 1, source_type: 1, source_id: 1, attempt_id: 1 }, { unique: true });
GradebookEntrySchema.index({ class_id: 1, student_id: 1, updatedAt: -1 });
GradebookEntrySchema.index({ teacher_id: 1, class_id: 1, updatedAt: -1 });
GradebookEntrySchema.index({ source_type: 1, source_id: 1 });

export const GradebookEntryModel = mongoose.model<IGradebookEntry>(
	"GradebookEntry",
	GradebookEntrySchema,
);

export interface UpsertGradebookEntryInput {
	student_id: mongoose.Types.ObjectId;
	class_id?: mongoose.Types.ObjectId | null;
	teacher_id?: mongoose.Types.ObjectId | null;
	source_type: GradebookSourceType;
	source_id: string;
	attempt_id?: string | null;
	title: string;
	earned_points: number;
	max_points: number;
	percentage: number;
	status?: "graded" | "submitted" | "missing";
	graded_at?: Date | null;
	submitted_at?: Date | null;
	metadata?: Record<string, unknown> | null;
}

export class GradebookEntryRepository extends BaseRepository<IGradebookEntry> {
	constructor() {
		super(GradebookEntryModel);
	}

	public async upsertEntry(
		input: UpsertGradebookEntryInput,
		session?: ClientSession,
	): Promise<IGradebookEntry> {
		const filter = {
			student_id: input.student_id,
			source_type: input.source_type,
			source_id: input.source_id,
			attempt_id: input.attempt_id ?? null,
		};

		const entry = await this.model.findOneAndUpdate(
			filter,
			{
				$set: {
					...input,
					attempt_id: input.attempt_id ?? null,
					class_id: input.class_id ?? null,
					teacher_id: input.teacher_id ?? null,
					status: input.status ?? "graded",
					graded_at: input.graded_at ?? null,
					submitted_at: input.submitted_at ?? null,
					metadata: input.metadata ?? null,
				},
			},
			{ new: true, upsert: true, setDefaultsOnInsert: true, session: session ?? undefined },
		).exec();

		if (!entry) {
			throw new Error("Failed to upsert gradebook entry");
		}

		return entry;
	}

	public async findByTeacherClass(
		teacherId: string,
		classId?: string,
	): Promise<IGradebookEntry[]> {
		const filter: Record<string, unknown> = { teacher_id: teacherId };
		if (classId) filter.class_id = classId;
		return this.model.find(filter).sort({ updatedAt: -1 }).exec();
	}

	public async findByStudent(studentId: string): Promise<IGradebookEntry[]> {
		return this.model.find({ student_id: studentId }).sort({ updatedAt: -1 }).exec();
	}
}

export const gradebookEntryRepository = new GradebookEntryRepository();
