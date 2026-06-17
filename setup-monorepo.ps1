$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-File {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content
  )

  $directory = Split-Path -Parent $Path
  if ($directory) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }

  Set-Content -Path $Path -Value $Content -Encoding UTF8
}

Write-File 'package.json' @'
{
  "name": "mathai",
  "version": "0.1.0",
  "private": true,
  "description": "MathAI - Nền tảng học toán online sử dụng AI",
  "workspaces": [
    "packages/backend",
    "packages/frontend"
  ],
  "scripts": {
    "dev:backend": "npm run dev --workspace=packages/backend",
    "dev:frontend": "npm run dev --workspace=packages/frontend",
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "build:backend": "npm run build --workspace=packages/backend",
    "build:frontend": "npm run build --workspace=packages/frontend",
    "build": "npm run build:backend && npm run build:frontend"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
'@

Write-File '.gitignore' @'
node_modules/
dist/
.next/
.env
.env.local
*.log
.DS_Store
coverage/
'@

Write-File '.env.example' @'
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=mathai

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d

# OpenAI
OPENAI_API_KEY=your-openai-api-key

# Backend
BACKEND_PORT=3001
BACKEND_URL=http://localhost:3001

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001/api
'@

Write-File 'README.md' @'
# MathAI - Nền tảng học toán online sử dụng AI

MathAI là nền tảng học toán online ứng dụng trí tuệ nhân tạo nhằm cá nhân hóa trải nghiệm học tập, hỗ trợ đánh giá năng lực, xây dựng lộ trình học và đồng hành cùng học sinh trong quá trình luyện tập.

## Tech stack

- Frontend: Next.js 14+, TypeScript, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Database: MySQL 8.0+, Knex.js
- AI: OpenAI API
- Auth: JWT, bcryptjs
- Validation: Zod
- Monorepo: npm workspaces

## Hướng dẫn cài đặt

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Thiết lập biến môi trường

- Sao chép file `.env.example` thành `.env`
- Sao chép `packages/backend/.env.example` thành `packages/backend/.env`
- Sao chép `packages/frontend/.env.example` thành `packages/frontend/.env.local`
- Cập nhật các giá trị theo môi trường local

### 3. Chạy MySQL

Đảm bảo MySQL 8.0+ đang hoạt động và đã tạo database `mathai`.

### 4. Import schema

Import file `database/schema.sql` vào MySQL:

```bash
mysql -u root -p mathai < database/schema.sql
```

## Hướng dẫn chạy môi trường dev

```bash
npm run dev
```

Ứng dụng sẽ chạy tại:

- Frontend: `http://localhost:3444`
- Backend: `http://localhost:3001`

## Cấu trúc thư mục tóm tắt

```text
mathai/
├── database/
├── docs/
├── packages/
│   ├── backend/
│   └── frontend/
├── package.json
├── .env.example
└── README.md
```

## Ghi chú

- Schema cơ sở dữ liệu hiện được giữ nguyên trong `database/schema.sql`
- Các route backend đang ở mức skeleton để triển khai dần theo module
- Frontend được khởi tạo theo Next.js App Router
'@

Write-File 'packages/backend/package.json' @'
{
  "name": "@mathai/backend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "knex": "^3.1.0",
    "mysql2": "^3.9.7",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "openai": "^4.52.0",
    "zod": "^3.23.8",
    "helmet": "^7.1.0",
    "morgan": "^1.10.0"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "tsx": "^4.11.0",
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/bcryptjs": "^2.4.6",
    "@types/morgan": "^1.9.9",
    "@types/node": "^20.12.12"
  }
}
'@

Write-File 'packages/backend/tsconfig.json' @'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
'@

Write-File 'packages/backend/.env.example' @'
BACKEND_PORT=3001
CORS_ORIGIN=http://localhost:3444
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=mathai
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d
OPENAI_API_KEY=your-openai-api-key
'@

Write-File 'packages/backend/src/index.ts' @'
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import { routes } from './routes';
import { config } from './config';

dotenv.config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', routes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`🚀 MathAI Backend running on http://localhost:${PORT}`);
});

export default app;
'@

Write-File 'packages/backend/src/config/index.ts' @'
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.BACKEND_PORT || '3001', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3444',
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mathai',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
};
'@

Write-File 'packages/backend/src/config/database.ts' @'
import knex from 'knex';
import { config } from './index';

export const db = knex({
  client: 'mysql2',
  connection: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
  },
  pool: {
    min: 2,
    max: 10,
  },
});

export default db;
'@

Write-File 'packages/backend/src/config/openai.ts' @'
import OpenAI from 'openai';
import { config } from './index';

export const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

export default openai;
'@

Write-File 'packages/backend/src/middleware/errorHandler.ts' @'
import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';

  console.error(`[ERROR] ${statusCode} - ${message}`);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
};
'@

Write-File 'packages/backend/src/middleware/auth.ts' @'
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from './errorHandler';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
  };
}

export const authenticate = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Token không được cung cấp', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret) as {
      id: number;
      email: string;
      role: string;
    };

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError('Token không hợp lệ hoặc đã hết hạn', 401));
    }
  }
};
'@

Write-File 'packages/backend/src/middleware/validate.ts' @'
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { AppError } from './errorHandler';

export const validate = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error: any) {
      const messages =
        error.errors?.map((e: any) => e.message).join(', ') || 'Dữ liệu không hợp lệ';
      next(new AppError(messages, 400));
    }
  };
};
'@

Write-File 'packages/backend/src/middleware/cors.ts' @'
import { CorsOptions } from 'cors';
import { config } from '../config';

export const corsOptions: CorsOptions = {
  origin: config.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
'@

Write-File 'packages/backend/src/routes/index.ts' @'
import { Router } from 'express';
import authRoutes from './auth.routes';
import studentRoutes from './student.routes';
import assessmentRoutes from './assessment.routes';
import curriculumRoutes from './curriculum.routes';
import lessonRoutes from './lesson.routes';
import solverRoutes from './solver.routes';
import chatRoutes from './chat.routes';
import dashboardRoutes from './dashboard.routes';

export const routes = Router();

routes.use('/auth', authRoutes);
routes.use('/students', studentRoutes);
routes.use('/assessments', assessmentRoutes);
routes.use('/curricula', curriculumRoutes);
routes.use('/lessons', lessonRoutes);
routes.use('/solver', solverRoutes);
routes.use('/chat', chatRoutes);
routes.use('/dashboard', dashboardRoutes);
'@

Write-File 'packages/backend/src/routes/auth.routes.ts' @'
import { Router } from 'express';

const router = Router();

// POST /api/auth/register - Đăng ký tài khoản
router.post('/register', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement register' });
});

// POST /api/auth/login - Đăng nhập
router.post('/login', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement login' });
});

// POST /api/auth/refresh - Refresh token
router.post('/refresh', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement refresh token' });
});

export default router;
'@

Write-File 'packages/backend/src/routes/student.routes.ts' @'
import { Router } from 'express';

const router = Router();

// GET /api/students/profile - Lấy hồ sơ học sinh
router.get('/profile', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement get student profile' });
});

// PUT /api/students/profile - Cập nhật hồ sơ học sinh
router.put('/profile', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement update student profile' });
});

// GET /api/students/theme - Lấy giao diện yêu thích
router.get('/theme', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement get student theme' });
});

// PUT /api/students/theme - Cập nhật giao diện yêu thích
router.put('/theme', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement update student theme' });
});

export default router;
'@

Write-File 'packages/backend/src/routes/assessment.routes.ts' @'
import { Router } from 'express';

const router = Router();

// POST /api/assessments/generate - Tạo bài đánh giá đầu vào
router.post('/generate', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement generate assessment' });
});

// GET /api/assessments/:id - Lấy chi tiết bài đánh giá
router.get('/:id', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement get assessment detail' });
});

// POST /api/assessments/:id/submit - Nộp bài đánh giá
router.post('/:id/submit', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement submit assessment' });
});

// GET /api/assessments/:id/result - Lấy kết quả bài đánh giá
router.get('/:id/result', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement get assessment result' });
});

export default router;
'@

Write-File 'packages/backend/src/routes/curriculum.routes.ts' @'
import { Router } from 'express';

const router = Router();

// POST /api/curricula/generate - Tạo lộ trình học
router.post('/generate', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement generate curriculum' });
});

// GET /api/curricula - Danh sách lộ trình học
router.get('/', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement get curricula' });
});

// GET /api/curricula/:id - Chi tiết lộ trình học
router.get('/:id', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement get curriculum detail' });
});

// GET /api/curricula/:id/modules - Danh sách module trong lộ trình
router.get('/:id/modules', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement get curriculum modules' });
});

export default router;
'@

Write-File 'packages/backend/src/routes/lesson.routes.ts' @'
import { Router } from 'express';

const router = Router();

// GET /api/lessons - Danh sách bài học
router.get('/', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement get lessons' });
});

// GET /api/lessons/today-recommendation - Gợi ý học hôm nay
router.get('/today-recommendation', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement today recommendation' });
});

// GET /api/lessons/:id - Chi tiết bài học
router.get('/:id', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement get lesson detail' });
});

// POST /api/lessons/:id/complete - Đánh dấu hoàn thành bài học
router.post('/:id/complete', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement complete lesson' });
});

export default router;
'@

Write-File 'packages/backend/src/routes/solver.routes.ts' @'
import { Router } from 'express';

const router = Router();

// POST /api/solver/solve - Giải bài toán
router.post('/solve', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement solve problem' });
});

// GET /api/solver/history - Lịch sử giải bài
router.get('/history', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement solver history' });
});

export default router;
'@

Write-File 'packages/backend/src/routes/chat.routes.ts' @'
import { Router } from 'express';

const router = Router();

// POST /api/chat/conversations - Tạo hội thoại mới
router.post('/conversations', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement create conversation' });
});

// GET /api/chat/conversations - Danh sách hội thoại
router.get('/conversations', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement get conversations' });
});

// POST /api/chat/conversations/:id/messages - Gửi tin nhắn
router.post('/conversations/:id/messages', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement send message' });
});

// GET /api/chat/conversations/:id/messages - Lấy tin nhắn hội thoại
router.get('/conversations/:id/messages', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement get conversation messages' });
});

export default router;
'@

Write-File 'packages/backend/src/routes/dashboard.routes.ts' @'
import { Router } from 'express';

const router = Router();

// GET /api/dashboard/progress - Tiến độ học tập
router.get('/progress', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement dashboard progress' });
});

// GET /api/dashboard/stats - Thống kê học tập
router.get('/stats', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement dashboard stats' });
});

// GET /api/dashboard/mastery - Mức độ thành thạo
router.get('/mastery', async (_req, res) => {
  res.json({ success: true, message: 'TODO: Implement dashboard mastery' });
});

export default router;
'@

Write-File 'packages/backend/src/utils/response.ts' @'
export const successResponse = (data: any, message: string = 'Thành công') => ({
  success: true,
  message,
  data,
});

export const paginatedResponse = (
  data: any[],
  total: number,
  page: number,
  limit: number,
  message: string = 'Thành công'
) => ({
  success: true,
  message,
  data,
  pagination: {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  },
});
'@

Write-File 'packages/backend/src/types/index.ts' @'
export interface User {
  id: number;
  email: string;
  phone?: string;
  role: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface StudentProfile {
  id: number;
  user_id: number;
  full_name: string;
  date_of_birth: Date;
  address: string;
  school_name: string;
  grade_level: number;
  academic_self_rating?: string;
  math_avg_score?: number;
  preferred_teacher_gender?: string;
  favorite_color?: string;
  hobbies?: string;
  personality_summary?: string;
  learning_goal?: string;
}

export interface Assessment {
  id: number;
  student_id: number;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface Curriculum {
  id: number;
  student_id: number;
  title: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Lesson {
  id: number;
  curriculum_id: number;
  title: string;
  summary?: string;
  order_index: number;
  created_at: Date;
  updated_at: Date;
}

// Có thể mở rộng thêm các type khác cho Chat, Dashboard, Solver trong các bước tiếp theo.
'@

Write-File 'packages/backend/src/controllers/.gitkeep' ''
Write-File 'packages/backend/src/services/.gitkeep' ''
Write-File 'packages/backend/src/models/.gitkeep' ''
Write-File 'packages/backend/src/validators/.gitkeep' ''

Write-File 'packages/frontend/package.json' @'
{
  "name": "@mathai/frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3444",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.2.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "@types/node": "^20.12.12",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "tailwindcss": "^3.4.4",
    "postcss": "^8.4.38",
    "autoprefixer": "^10.4.19"
  }
}
'@

Write-File 'packages/frontend/tsconfig.json' @'
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
'@

Write-File 'packages/frontend/next.config.js' @'
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
'@

Write-File 'packages/frontend/tailwind.config.ts' @'
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
    },
  },
  plugins: [],
};

export default config;
'@

Write-File 'packages/frontend/postcss.config.js' @'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
'@

Write-File 'packages/frontend/.env.example' @'
NEXT_PUBLIC_API_URL=http://localhost:3001/api
'@

Write-File 'packages/frontend/next-env.d.ts' @'
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// This file should not be edited.
'@

Write-File 'packages/frontend/src/app/globals.css' @'
@tailwind base;
@tailwind components;
@tailwind utilities;
'@

Write-File 'packages/frontend/src/app/layout.tsx' @'
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'MathAI - Học Toán Online với AI',
  description: 'Nền tảng học toán online cá nhân hóa bằng trí tuệ nhân tạo',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}
'@

Write-File 'packages/frontend/src/app/page.tsx' @'
const features = [
  {
    title: 'Đánh giá năng lực đầu vào',
    description: 'Xác định năng lực hiện tại để bắt đầu từ đúng điểm phù hợp với từng học sinh.',
  },
  {
    title: 'Lộ trình học cá nhân hóa',
    description: 'Xây dựng kế hoạch học tập theo trình độ, mục tiêu và tốc độ tiến bộ thực tế.',
  },
  {
    title: 'Giải bài tập có hướng dẫn',
    description: 'AI hỗ trợ giải thích từng bước thay vì chỉ cung cấp đáp án cuối cùng.',
  },
  {
    title: 'Theo dõi tiến độ học tập',
    description: 'Dashboard trực quan giúp theo dõi kết quả, mức độ thành thạo và thói quen học tập.',
  },
  {
    title: 'Trợ lý học tập AI',
    description: 'Hỏi đáp nhanh những vướng mắc trong quá trình học và luyện tập toán.',
  },
  {
    title: 'Bài học theo mục tiêu',
    description: 'Ưu tiên nội dung học theo mục tiêu ngắn hạn và dài hạn của từng học sinh.',
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white text-gray-900">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-primary-600">MathAI</h1>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Đăng nhập
            </a>
            <a
              href="/register"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
            >
              Bắt đầu học
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-3xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-primary-600">
            Nền tảng học toán online sử dụng AI
          </p>
          <h2 className="mb-6 text-4xl font-bold leading-tight md:text-5xl">
            Học toán thông minh hơn với trải nghiệm cá nhân hóa cho từng học sinh
          </h2>
          <p className="mb-8 text-lg leading-8 text-gray-600">
            MathAI kết hợp đánh giá năng lực, xây dựng lộ trình học, luyện tập theo mục tiêu và hỗ
            trợ giải bài toán bằng AI trong một hệ sinh thái học tập thống nhất.
          </p>
          <div className="flex flex-wrap gap-4">
            <a
              href="/register"
              className="rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
            >
              Bắt đầu học
            </a>
            <a
              href="/login"
              className="rounded-xl border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 transition hover:bg-white"
            >
              Đăng nhập
            </a>
          </div>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 max-w-2xl">
            <h3 className="text-3xl font-bold text-gray-900">Tính năng chính</h3>
            <p className="mt-3 text-gray-600">
              Bộ khung khởi tạo cho nền tảng MathAI, sẵn sàng mở rộng thành các module nghiệp vụ chi
              tiết trong các bước tiếp theo.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title} className="rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h4 className="mb-3 text-xl font-semibold text-gray-900">{feature.title}</h4>
                <p className="text-gray-600">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-gray-500">
          © 2026 MathAI. Nền tảng học toán online sử dụng AI.
        </div>
      </footer>
    </main>
  );
}
'@

Write-File 'packages/frontend/src/app/(auth)/login/page.tsx' @'
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Đăng nhập</h1>
        <p className="mb-6 text-sm text-gray-500">
          Truy cập tài khoản MathAI để tiếp tục hành trình học tập.
        </p>

        <form className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-700">
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white transition hover:bg-primary-700"
          >
            Đăng nhập
          </button>
        </form>
      </div>
    </main>
  );
}
'@

Write-File 'packages/frontend/src/app/(auth)/register/page.tsx' @'
export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Đăng ký</h1>
        <p className="mb-6 text-sm text-gray-500">
          Tạo tài khoản cơ bản để bắt đầu sử dụng nền tảng MathAI.
        </p>

        <form className="space-y-4">
          <div>
            <label htmlFor="fullName" className="mb-2 block text-sm font-medium text-gray-700">
              Họ và tên
            </label>
            <input
              id="fullName"
              type="text"
              placeholder="Nguyễn Văn A"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-700">
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              placeholder="Tối thiểu 8 ký tự"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white transition hover:bg-primary-700"
          >
            Tạo tài khoản
          </button>
        </form>
      </div>
    </main>
  );
}
'@

Write-File 'packages/frontend/src/app/(dashboard)/dashboard/page.tsx' @'
export default function DashboardPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="rounded-2xl bg-white px-8 py-10 text-center shadow-sm ring-1 ring-gray-200">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-3 text-gray-600">Dashboard - Đang phát triển</p>
      </div>
    </main>
  );
}
'@

Write-File 'packages/frontend/src/lib/api.ts' @'
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  // Add auth token if available
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Network error' }));
    throw new Error(error.error?.message || 'Có lỗi xảy ra');
  }

  return response.json();
}
'@

Write-File 'packages/frontend/src/types/index.ts' @'
export interface User {
  id: number;
  email: string;
  phone?: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudentProfile {
  id: number;
  user_id: number;
  full_name: string;
  date_of_birth: string;
  address: string;
  school_name: string;
  grade_level: number;
  academic_self_rating?: string;
  math_avg_score?: number;
  preferred_teacher_gender?: string;
  favorite_color?: string;
  hobbies?: string;
  personality_summary?: string;
  learning_goal?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}
'@

Write-File 'packages/frontend/src/components/.gitkeep' ''
Write-File 'packages/frontend/src/hooks/.gitkeep' ''

Write-Host 'setup-monorepo.ps1 ready'
