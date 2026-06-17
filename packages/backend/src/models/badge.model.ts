import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

// ── Types ───────────────────────────────────────────────────────────────

export type BadgeCategory =
  | "engagement"
  | "mastery"
  | "solver"
  | "social"
  | "special";

export type BadgeRarity = "common" | "uncommon" | "rare" | "legendary";

export type BadgeCriteriaPeriod = "lifetime" | "week" | "month";

// ── Sub-document interfaces ─────────────────────────────────────────────

export interface IBadgeCriteria {
  type: string; // "lesson_streak" | "quiz_score" | "solver_hint_only_count" etc.
  threshold: number;
  period?: BadgeCriteriaPeriod;
}

// ── Main interface ──────────────────────────────────────────────────────

export interface IBadge extends Document {
  badge_id: string; // stable identifier e.g. "lesson_streak_30"
  name: string;
  description: string;
  icon_url: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
  criteria: IBadgeCriteria;
  reward_points: number;
  is_active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schemas ─────────────────────────────────────────────────────────

const BadgeCriteriaSchema = new Schema<IBadgeCriteria>(
  {
    type: { type: String, required: true, trim: true },
    threshold: { type: Number, required: true, min: 0 },
    period: {
      type: String,
      enum: ["lifetime", "week", "month"],
      default: undefined,
    },
  },
  { _id: false },
);

// ── Main schema ─────────────────────────────────────────────────────────

const BadgeSchema = new Schema<IBadge>(
  {
    badge_id: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    icon_url: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: ["engagement", "mastery", "solver", "social", "special"],
    },
    rarity: {
      type: String,
      required: true,
      enum: ["common", "uncommon", "rare", "legendary"],
    },
    criteria: { type: BadgeCriteriaSchema, required: true },
    reward_points: { type: Number, required: true, min: 0, default: 0 },
    is_active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

// ── Indexes ─────────────────────────────────────────────────────────────

BadgeSchema.index({ category: 1, is_active: 1 });

// ── Model ───────────────────────────────────────────────────────────────

export const BadgeModel = mongoose.model<IBadge>("Badge", BadgeSchema);

// ── Repository ──────────────────────────────────────────────────────────

export class BadgeRepository extends BaseRepository<IBadge> {
  constructor() {
    super(BadgeModel);
  }

  /**
   * Find a badge by its stable badge_id.
   */
  public async findByBadgeId(
    badgeId: string,
    session?: ClientSession,
  ): Promise<IBadge | null> {
    const query = this.model.findOne({ badge_id: badgeId });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find all active badges, optionally filtered by category.
   */
  public async findActive(
    category?: BadgeCategory,
    session?: ClientSession,
  ): Promise<IBadge[]> {
    const filter: Record<string, unknown> = { is_active: true };
    if (category) filter.category = category;
    const query = this.model.find(filter).sort({ category: 1, name: 1 });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find badges by criteria type (for evaluating triggers).
   */
  public async findByCriteriaType(
    criteriaType: string,
    session?: ClientSession,
  ): Promise<IBadge[]> {
    const query = this.model.find({
      "criteria.type": criteriaType,
      is_active: true,
    });
    if (session) query.session(session);
    return query.exec();
  }
}

// ── Singleton export ────────────────────────────────────────────────────

export const badgeRepository = new BadgeRepository();
