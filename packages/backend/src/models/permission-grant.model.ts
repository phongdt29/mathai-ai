import mongoose, { ClientSession, Document, FilterQuery, Schema } from "mongoose";
import BaseRepository from "./base.model";
import type { JsonObject, UserRole } from "../types";

export type PermissionGrantEffect = "allow" | "deny";

export interface IPermissionGrant extends Document {
	userId?: mongoose.Types.ObjectId | null;
	role?: UserRole | null;
	permission: string;
	resourceType: string;
	resourceId?: mongoose.Types.ObjectId | null;
	scope?: string | null;
	actions: string[];
	effect: PermissionGrantEffect;
	expiresAt?: Date | null;
	metadata?: JsonObject | null;
	createdBy?: mongoose.Types.ObjectId | null;
	createdAt: Date;
	updatedAt: Date;
}

const PermissionGrantSchema = new Schema<IPermissionGrant>(
	{
		userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
		role: {
			type: String,
			enum: ["student", "parent", "admin", "teacher"],
			default: null,
		},
		permission: { type: String, required: true, trim: true },
		resourceType: { type: String, required: true, trim: true },
		resourceId: { type: Schema.Types.ObjectId, default: null },
		scope: { type: String, default: null, trim: true },
		actions: [{ type: String, required: true, trim: true }],
		effect: { type: String, enum: ["allow", "deny"], required: true, default: "allow" },
		expiresAt: { type: Date, default: null },
		metadata: { type: Schema.Types.Mixed, default: null },
		createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
	},
	{ timestamps: true },
);

PermissionGrantSchema.index({ userId: 1, permission: 1, resourceType: 1 });
PermissionGrantSchema.index({ role: 1, permission: 1, resourceType: 1 });
PermissionGrantSchema.index({ resourceType: 1, resourceId: 1 });
PermissionGrantSchema.index({ expiresAt: 1 }, { sparse: true });

export const PermissionGrantModel = mongoose.model<IPermissionGrant>(
	"PermissionGrant",
	PermissionGrantSchema,
);

export interface PermissionGrantLookup {
	userId?: string | null;
	role?: UserRole | null;
	permission: string;
	resourceType: string;
	resourceId?: string | null;
	action?: string | null;
	scope?: string | null;
	asOf?: Date;
}

export class PermissionGrantRepository extends BaseRepository<IPermissionGrant> {
	constructor() {
		super(PermissionGrantModel);
	}

	public async findMatchingGrants(
		lookup: PermissionGrantLookup,
		session?: ClientSession,
	): Promise<IPermissionGrant[]> {
		const now = lookup.asOf ?? new Date();
		const orClauses: FilterQuery<IPermissionGrant>[] = [];

		if (lookup.userId) {
			orClauses.push({ userId: lookup.userId });
		}

		if (lookup.role) {
			orClauses.push({ role: lookup.role });
		}

		if (orClauses.length === 0) {
			return [];
		}

		const andClauses: FilterQuery<IPermissionGrant>[] = [
			{ $or: orClauses },
			{ permission: lookup.permission },
			{ resourceType: lookup.resourceType },
			{
				$or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
			},
		];

		if (lookup.action) {
			andClauses.push({ actions: lookup.action });
		}

		if (lookup.resourceId) {
			andClauses.push({ $or: [{ resourceId: null }, { resourceId: lookup.resourceId }] });
		} else {
			andClauses.push({ $or: [{ resourceId: null }, { resourceId: { $exists: false } }] });
		}

		if (lookup.scope) {
			andClauses.push({ $or: [{ scope: null }, { scope: lookup.scope }] });
		}

		return this.model
			.find({ $and: andClauses })
			.session(session ?? null)
			.sort({ effect: 1, createdAt: -1 })
			.exec();
	}
}

export const permissionGrantRepository = new PermissionGrantRepository();
