import app from '../src/app';
import { connectDatabase } from '../src/config/database';

let connectPromise: Promise<void> | null = null;

async function ensureDatabaseConnected(): Promise<void> {
  if (!connectPromise) {
    connectPromise = connectDatabase().catch((error) => {
      connectPromise = null;
      throw error;
    });
  }

  await connectPromise;
}

export default async function handler(req: any, res: any) {
  await ensureDatabaseConnected();
  return app(req, res);
}
