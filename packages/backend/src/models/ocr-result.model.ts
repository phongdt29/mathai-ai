import mongoose, { type ClientSession, type Document, Schema } from "mongoose";
import BaseRepository from "./base.model";

export interface IOCRResult extends Document {
  student_id: mongoose.Types.ObjectId;
  storage_key: string;
  storage_url: string;
  sha256: string;
  mime_type: string;
  size_bytes: number;
  parsed_text: string | null;
  confidence: number;
  status: string;
  ai_model: string | null;
  ai_tokens_input: number | null;
  ai_tokens_output: number | null;
  duration_ms: number | null;
  expires_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OCRResultSchema = new Schema<IOCRResult>(
  {
    student_id: {
      type: Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true,
    },
    storage_key: { type: String, required: true },
    storage_url: { type: String, required: true },
    sha256: { type: String, required: true },
    mime_type: { type: String, required: true },
    size_bytes: { type: Number, required: true },
    parsed_text: { type: String, default: null },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    status: {
      type: String,
      required: true,
      enum: ["parsed", "manual_required", "failed"],
    },
    ai_model: { type: String, default: null },
    ai_tokens_input: { type: Number, default: null },
    ai_tokens_output: { type: Number, default: null },
    duration_ms: { type: Number, default: null },
    expires_at: { type: Date, required: true },
  },
  { timestamps: true },
);

OCRResultSchema.index({ sha256: 1 });
OCRResultSchema.index({ student_id: 1, createdAt: -1 });
OCRResultSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const OCRResultModel = mongoose.model<IOCRResult>(
  "OCRResult",
  OCRResultSchema,
);

export class OCRResultRepository extends BaseRepository<IOCRResult> {
  constructor() {
    super(OCRResultModel);
  }

  public async findByStudent(
    studentId: string,
    limit: number = 20,
    session?: ClientSession,
  ): Promise<IOCRResult[]> {
    const query = this.model
      .find({ student_id: studentId })
      .sort({ createdAt: -1 })
      .limit(limit);
    if (session) query.session(session);
    return query.exec();
  }

  public async findBySha256(
    sha256: string,
    session?: ClientSession,
  ): Promise<IOCRResult[]> {
    const query = this.model.find({ sha256 });
    if (session) query.session(session);
    return query.exec();
  }

  public async countSuccessfulToday(
    studentId: string,
    session?: ClientSession,
  ): Promise<number> {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const query = this.model.countDocuments({
      student_id: studentId,
      status: { $in: ["parsed", "manual_required"] },
      createdAt: { $gte: twentyFourHoursAgo },
    });
    if (session) query.session(session);
    return query.exec();
  }

  public async findExpired(session?: ClientSession): Promise<IOCRResult[]> {
    const query = this.model.find({ expires_at: { $lt: new Date() } });
    if (session) query.session(session);
    return query.exec();
  }
}

export const ocrResultRepository = new OCRResultRepository();
