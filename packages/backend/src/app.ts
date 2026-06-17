import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { errorHandler } from './middleware/errorHandler';
import { routes } from './routes';
import { config } from './config';
import { buildOpenApiSpec } from './docs/openapi';
import {
  buildLivenessHealth,
  buildReadinessHealth,
} from './services/health.service';
import webhookRoutes from './routes/webhook.routes';
import { globalApiRateLimit } from './middleware/rate-limit';
import { initSentry } from './config/sentry';
import { metricsCollector, metricsHandler } from './middleware/metrics';

// Initialize Sentry early (before Express app setup)
// Validates: Requirements 13.5, 13.15
initSentry();

const app = express();

const isProduction = process.env.NODE_ENV === 'production';
const APP_VERSION = process.env.npm_package_version ?? '0.1.0';

// Behind reverse proxy (nginx/LB): cần trust proxy để rate limit theo IP thật
// Cấu hình qua env TRUST_PROXY (số hop hoặc true/false)
if (config.trustProxy !== false) {
  app.set('trust proxy', config.trustProxy);
}

// Metrics collector middleware — must be early to capture all requests
// Validates: Requirements 13.4
app.use(metricsCollector);

// Security headers — Helmet with production hardening
// Requirements: 13.11
app.use(
  helmet({
    hsts: isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    frameguard: { action: 'deny' },
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: [
              "'self'",
              '*.vnpayment.vn',
              '*.momo.vn',
            ],
            frameSrc: [
              "'self'",
              '*.vnpayment.vn',
              '*.momo.vn',
            ],
            formAction: [
              "'self'",
              '*.vnpayment.vn',
              '*.momo.vn',
            ],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
          },
        }
      : false,
  }),
);

// CORS_ORIGIN hỗ trợ nhiều origin phân tách bằng dấu phẩy
app.use(
  cors({
    origin: config.corsOrigins.length === 1 ? config.corsOrigins[0] : [...config.corsOrigins],
    credentials: true,
  }),
);
app.use(morgan('dev'));

// Prometheus metrics endpoint — mounted OUTSIDE /api routes
// Protected by Bearer METRICS_TOKEN
// Validates: Requirements 13.3
app.get('/metrics', metricsHandler);

// Webhook routes MUST be mounted BEFORE express.json() to preserve raw body for HMAC verification
app.use('/api/webhooks', webhookRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global rate limit for /api/* — 600 req/min/IP
// Requirements: 13.12
app.use('/api', globalApiRateLimit);

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// OpenAPI spec cho đối tác đấu nối — đặt trước router để không bị nuốt
const openApiHandler = (_req: express.Request, res: express.Response) => {
  res.json(buildOpenApiSpec(config.app.baseUrl, APP_VERSION));
};
app.get('/api/openapi.json', openApiHandler);
app.get('/api/v1/openapi.json', openApiHandler);

// Routes — /api/v1 là prefix chuẩn cho tích hợp mới, /api giữ tương thích ngược
app.use('/api/v1', routes);
app.use('/api', routes);

// Health check (kèm version để client kiểm tra tương thích)
app.get('/health', (_req, res) => {
  res.json({ ...buildLivenessHealth(), version: APP_VERSION });
});

// Readiness check — verifies MongoDB ping + EMAIL config
// Requirements: 13.9
app.get('/health/ready', async (_req, res) => {
  const readiness = await buildReadinessHealth();
  res.status(readiness.status === 'ok' ? 200 : 503).json(readiness);
});

// Error handler
app.use(errorHandler);

export default app;
