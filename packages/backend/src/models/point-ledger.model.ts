import mongoose, {
	type ClientSession,
	type Document,
	type FilterQuery,
	Schema,
} from "mongoose";
import { ValidationError } from "../utils/errors";
import BaseRepository from "./base.model";

export type PointLedgerSourceType =
	| "assessment"
	| "lesson"
	| "teacher_assignment"
	| "bonus"
	| "penalty"
	| "manual_adjustment";

export interface IPointLedger extends Document {
	student_id: mongoose.Types.ObjectId;
	source_type: PointLedgerSourceType;
	source_id: string;
	attempt_id: string | null;
	earned_points: number;
	max_points: number;
	reward_points: number;
	competency_score: number;
	reason: string | null;
	metadata: Record<string, unknown> | null;
	created_by: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface PointLedgerCreateInput {
	student_id: mongoose.Types.ObjectId;
	source_type: PointLedgerSourceType;
	source_id: string;
	attempt_id: string | null;
	earned_points: number;
	max_points: number;
	reward_points: number;
	competency_score: number;
	reason: string | null;
	metadata: Record<string, unknown> | null;
	created_by: string | null;
}

export interface PointLedgerAttemptFilter {
	student_id: string | mongoose.Types.ObjectId;
	source_type: Extract<
		PointLedgerSourceType,
		"assessment" | "lesson" | "teacher_assignment"
	>;
	source_id: string;
	attempt_id: string;
}

const PointLedgerSchema = new Schema<IPointLedger>(
	{
		student_id: {
			type: Schema.Types.ObjectId,
			ref: "StudentProfile",
			required: true,
		},
		source_type: {
			type: String,
			enum: [
				"assessment",
				"lesson",
				"teacher_assignment",
				"bonus",
				"penalty",
				"manual_adjustment",
			],
			required: true,
		},
		source_id: { type: String, required: true },
		attempt_id: { type: String, default: null },
		earned_points: { type: Number, required: true, min: 0 },
		max_points: { type: Number, required: true, min: 0 },
		reward_points: { type: Number, required: true, default: 0 },
		competency_score: { type: Number, required: true, min: 0, max: 100 },
		reason: { type: String, default: null },
		metadata: { type: Schema.Types.Mixed, default: null },
		created_by: { type: String, default: null },
	},
	{ timestamps: true },
);

PointLedgerSchema.index({ student_id: 1, createdAt: -1 });
PointLedgerSchema.index({ student_id: 1, source_type: 1 });
PointLedgerSchema.index({ source_type: 1, source_id: 1 });
PointLedgerSchema.index(
	{ student_id: 1, source_type: 1, source_id: 1, attempt_id: 1 },
	{
		unique: true,
		partialFilterExpression: {
			attempt_id: { $exists: true, $ne: null },
			source_type: { $in: ["assessment", "lesson", "teacher_assignment"] },
		},
	},
);

export const PointLedgerModel = mongoose.model<IPointLedger>(
	"PointLedger",
	PointLedgerSchema,
);

export class PointLedgerRepository extends BaseRepository<IPointLedger> {
	constructor() {
		super(PointLedgerModel);
	}

	public async findByStudentId(
		studentId: string,
		session?: ClientSession,
	): Promise<IPointLedger[]> {
		const query = this.model
			.find({ student_id: studentId })
			.sort({ createdAt: -1 });
		if (session) query.session(session);
		return query.exec();
	}

	public async upsertAttemptLedger(
		filter: PointLedgerAttemptFilter,
		insert: PointLedgerCreateInput,
		session?: ClientSession,
	): Promise<IPointLedger> {
		const normalizedSourceId = String(filter.source_id ?? "").trim();
		const normalizedAttemptId = String(filter.attempt_id ?? "").trim();
		if (!normalizedSourceId) {
			throw new ValidationError("Source id is required");
		}
		if (!normalizedAttemptId) {
			throw new ValidationError("Attempt id is required");
		}
		const queryFilter: FilterQuery<IPointLedger> = {
			student_id: filter.student_id,
			source_type: filter.source_type,
			source_id: normalizedSourceId,
			attempt_id: normalizedAttemptId,
		};
		const normalizedInsert: PointLedgerCreateInput = {
			...insert,
			source_type: filter.source_type,
			source_id: normalizedSourceId,
			attempt_id: normalizedAttemptId,
			created_by: insert.created_by === null ? null : String(insert.created_by),
		};

		return this.findOneAndUpdateLedger(
			queryFilter,
			{ $setOnInsert: normalizedInsert },
			session,
		);
	}

	public async updateTeacherAssignmentLedger(
		filter: PointLedgerAttemptFilter,
		update: PointLedgerCreateInput,
		session?: ClientSession,
	): Promise<IPointLedger> {
		const normalizedSourceId = String(filter.source_id ?? "").trim();
		const normalizedAttemptId = String(filter.attempt_id ?? "").trim();
		if (!normalizedSourceId) {
			throw new ValidationError("Source id is required");
		}
		if (!normalizedAttemptId) {
			throw new ValidationError("Attempt id is required");
		}

		const queryFilter: FilterQuery<IPointLedger> = {
			student_id: filter.student_id,
			source_type: "teacher_assignment",
			source_id: normalizedSourceId,
			attempt_id: normalizedAttemptId,
		};
		const normalizedUpdate: PointLedgerCreateInput = {
			...update,
			source_type: "teacher_assignment",
			source_id: normalizedSourceId,
			attempt_id: normalizedAttemptId,
			created_by: update.created_by === null ? null : String(update.created_by),
		};

		return this.findOneAndUpdateLedger(
			queryFilter,
			{
				$setOnInsert: {
					student_id: normalizedUpdate.student_id,
					source_type: normalizedUpdate.source_type,
					source_id: normalizedUpdate.source_id,
					attempt_id: normalizedUpdate.attempt_id,
				},
				$set: {
					earned_points: normalizedUpdate.earned_points,
					max_points: normalizedUpdate.max_points,
					reward_points: normalizedUpdate.reward_points,
					competency_score: normalizedUpdate.competency_score,
					reason: normalizedUpdate.reason,
					metadata: normalizedUpdate.metadata,
					created_by: normalizedUpdate.created_by,
				},
			},
			session,
		);
	}

	private async findOneAndUpdateLedger(
		filter: FilterQuery<IPointLedger>,
		update: Record<string, unknown>,
		session?: ClientSession,
	): Promise<IPointLedger> {
		const query = this.model.findOneAndUpdate(filter, update, {
			new: true,
			setDefaultsOnInsert: true,
			upsert: true,
			session: session ?? undefined,
		});

		const ledger = await query.exec();
		if (!ledger) {
			throw new Error("Failed to upsert point ledger entry");
		}

		return ledger;
	}

	public async upsertAssessmentLedger(
		filter: PointLedgerAttemptFilter,
		insert: PointLedgerCreateInput,
		session?: ClientSession,
	): Promise<IPointLedger> {
		return this.upsertAttemptLedger(filter, insert, session);
	}

	public async upsertLessonLedger(
		filter: PointLedgerAttemptFilter,
		insert: PointLedgerCreateInput,
		session?: ClientSession,
	): Promise<IPointLedger> {
		return this.upsertAttemptLedger(filter, insert, session);
	}

	public async upsertTeacherAssignmentLedger(
		filter: PointLedgerAttemptFilter,
		insert: PointLedgerCreateInput,
		session?: ClientSession,
	): Promise<IPointLedger> {
		return this.updateTeacherAssignmentLedger(filter, insert, session);
	}
}

export const pointLedgerRepository = new PointLedgerRepository();
