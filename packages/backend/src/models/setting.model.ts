import mongoose, { Schema, Document, ClientSession } from 'mongoose';
import BaseRepository from './base.model';

export interface ISystemSetting extends Document {
  setting_key: string;
  setting_value: string;
  createdAt: Date;
  updatedAt: Date;
}

const SystemSettingSchema = new Schema<ISystemSetting>(
  {
    setting_key: { type: String, required: true, unique: true },
    setting_value: { type: String, required: true },
  },
  { timestamps: true }
);

export const SystemSettingModel = mongoose.model<ISystemSetting>('SystemSetting', SystemSettingSchema);

export class SystemSettingRepository extends BaseRepository<ISystemSetting> {
  constructor() {
    super(SystemSettingModel);
  }

  public async get(key: string): Promise<string | null> {
    const row = await this.model.findOne({ setting_key: key });
    return row?.setting_value ?? null;
  }

  public async set(key: string, value: string): Promise<void> {
    await this.model.findOneAndUpdate(
      { setting_key: key },
      { setting_key: key, setting_value: value },
      { upsert: true }
    );
  }

  public async getAIConfig(): Promise<{ endpoint: string; apiKey: string; model: string }> {
    const [endpoint, apiKey, model] = await Promise.all([
      this.get('ai_endpoint'),
      this.get('ai_api_key'),
      this.get('ai_model'),
    ]);
    return {
      endpoint: endpoint || '',
      apiKey: apiKey || '',
      model: model || 'gpt-4o-mini',
    };
  }
}

export const systemSettingRepository = new SystemSettingRepository();
