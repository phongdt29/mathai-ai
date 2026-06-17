import mongoose from 'mongoose';
import { config } from './index';

// Global Mongoose settings for clean serialization
mongoose.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc: any, ret: any) => {
    delete ret.__v;
    return ret;
  },
});
mongoose.set('toObject', {
  virtuals: true,
  versionKey: false,
});

export async function connectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  try {
    await mongoose.connect(config.db.uri, {
      dbName: config.db.database,
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

export { mongoose };
export default mongoose;
