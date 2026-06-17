import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

export interface IParentChild extends Document {
	parent_user_id: mongoose.Types.ObjectId;
	student_id: mongoose.Types.ObjectId;
}

const ParentChildSchema = new Schema(
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
	},
	{ timestamps: true },
);

ParentChildSchema.index({ parent_user_id: 1, student_id: 1 }, { unique: true });
ParentChildSchema.index({ student_id: 1 });

const ParentChildModel = mongoose.model<IParentChild>(
	"ParentChild",
	ParentChildSchema,
);

export class ParentChildRepository extends BaseRepository<IParentChild> {
	constructor() {
		super(ParentChildModel);
	}

	public async findChildrenByParent(
		parentUserId: string,
		session?: ClientSession,
	): Promise<IParentChild[]> {
		return this.model
			.find({ parent_user_id: parentUserId })
			.session(session ?? null)
			.lean<IParentChild[]>()
			.exec();
	}

	public async findParentsByStudent(
		studentId: string,
		session?: ClientSession,
	): Promise<IParentChild[]> {
		return this.model
			.find({ student_id: studentId })
			.session(session ?? null)
			.lean<IParentChild[]>()
			.exec();
	}

	public async findRelation(
		parentUserId: string,
		studentId: string,
		session?: ClientSession,
	): Promise<IParentChild | null> {
		return this.model
			.findOne({ parent_user_id: parentUserId, student_id: studentId })
			.session(session ?? null)
			.lean<IParentChild>()
			.exec();
	}

	public async deleteRelation(
		parentUserId: string,
		studentId: string,
		session?: ClientSession,
	): Promise<boolean> {
		const result = await this.model
			.deleteOne({ parent_user_id: parentUserId, student_id: studentId })
			.session(session ?? null)
			.exec();
		return result.deletedCount === 1;
	}
}

export const parentChildRepository = new ParentChildRepository();
