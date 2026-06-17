import app from './app';
import { config } from './config';
import { connectDatabase } from './config/database';

const PORT = config.port;

async function bootstrap() {
  await connectDatabase();
  app.listen(PORT, () => {
    console.log(`🚀 MathAI Backend running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

