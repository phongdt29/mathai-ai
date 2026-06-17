# MathAI Codebase Exploration Report

## 📋 Executive Summary

**MathAI** is an AI-powered online math learning platform built with a modern tech stack. It features personalized learning paths, AI-generated assessments, curriculum management, parent monitoring, and an intelligent AI tutor system.

---

## 🏗️ Project Structure (Top 3 Levels)

```
D:\GitHub\mathai\
├── database/                 # MySQL schema (422 lines, 22 tables)
├── docs/                     # Documentation
├── packages/
│   ├── backend/              # Express + TypeScript API server
│   │   ├── src/
│   │   │   ├── config/       # Database, OpenAI, app config
│   │   │   ├── controllers/  # Business logic
│   │   │   ├── middleware/   # Auth, validation, error handling
│   │   │   ├── models/       # Database repositories
│   │   │   ├── routes/       # API endpoints
│   │   │   ├── services/     # Core business logic
│   │   │   ├── types/        # TypeScript type definitions
│   │   │   ├── utils/        # Helper utilities
│   │   │   ├── validators/   # Zod validation schemas
│   │   │   └── index.ts      # Server entry point
│   │   └── dist/             # Compiled output
│   └── frontend/             # Next.js 14 + Tailwind CSS web app
│       └── src/
│           ├── app/          # Next.js App Router
│           │   ├── (auth)/   # Auth pages (login, register, forgot-password)
│           │   ├── (dashboard)/  # Student dashboard
│           │   ├── (admin)/  # Admin pages
│           │   └── (parent)/ # Parent monitoring pages
│           ├── components/   # React components
│           ├── hooks/        # Custom React hooks
│           ├── lib/          # API client, utilities
│           └── types/        # TypeScript types
├── .env                      # Environment variables
├── .opencode/                # OpenCode AI configuration
├── package.json              # Root monorepo config
└── README.md                 # Project documentation
```

---

## 📦 Tech Stack

### Frontend
- **Framework**: Next.js 14.2.3
- **Language**: TypeScript 5.4.5
- **Styling**: Tailwind CSS 3.4.4
- **Runtime**: Node.js 18+

### Backend
- **Runtime**: Node.js 20.12.12+
- **Framework**: Express 4.18.2
- **Language**: TypeScript 5.4.5
- **Database**: MySQL 8.0+ with Knex.js 3.1.0
- **Authentication**: JWT (jsonwebtoken 9.0.2) + bcryptjs 2.4.3
- **API Key**: OpenAI 4.52.0

### Key Libraries
- **Validation**: Zod 3.23.8
- **Rate Limiting**: express-rate-limit 8.3.2
- **Security**: Helmet 7.1.0
- **CORS**: cors 2.8.5
- **Development**: tsx, TypeScript compiler

### Monorepo
- **Workspace Manager**: npm workspaces
- **Dev Tools**: concurrently (running dev servers simultaneously)

---

## 📂 Source Files Inventory

### Backend Services (49 files)

#### Routes (9 files)
- `routes/index.ts` - Route registry
- `routes/auth.routes.ts` - Authentication endpoints
- `routes/student.routes.ts` - Student profile management
- `routes/assessment.routes.ts` - Assessment endpoints
- `routes/curriculum.routes.ts` - Curriculum management
- `routes/lesson.routes.ts` - Lesson endpoints
- `routes/solver.routes.ts` - Problem solver
- `routes/chat.routes.ts` - AI tutor chat
- `routes/dashboard.routes.ts` - Dashboard metrics (TODO)

#### Services (6 files)
- `services/auth.service.ts` - Authentication & student classification (283 lines)
- `services/student.service.ts` - Student profile, theme, tutor selection (191 lines)
- `services/assessment.service.ts` - Assessment generation, grading, analysis (748 lines)
- `services/curriculum.service.ts` - Curriculum & lesson generation (658 lines)
- `services/ai.service.ts` - OpenAI integration
- `models/` - 12 repository classes for database operations

#### Controllers (3 files)
- `controllers/auth.controller.ts`
- `controllers/student.controller.ts`
- `controllers/assessment.controller.ts`
- `controllers/curriculum.controller.ts`

#### Models/Repositories (12 files)
- `models/user.model.ts` - User repository
- `models/student.model.ts` - StudentProfile + StudentThemePreference
- `models/assessment.model.ts` - Assessment, questions, attempts, answers
- `models/curriculum.model.ts` - Curriculum + modules
- `models/lesson.model.ts` - Lessons + exercises
- `models/progress.model.ts` - Student progress + topic mastery + recommendations
- `models/notification.model.ts` - Notifications
- `models/ai-log.model.ts` - AI generation logs
- `models/chat.model.ts` - AI tutor conversations + messages
- `models/solver.model.ts` - Problem solver requests
- `models/base.model.ts` - Base repository class (abstract)

#### Validators (4 files)
- `validators/auth.validator.ts` - Register/login schemas
- `validators/student.validator.ts` - Profile update schemas
- `validators/assessment.validator.ts` - Assessment creation schemas
- `validators/curriculum.validator.ts` - Curriculum schemas

#### Configuration & Utilities
- `config/index.ts` - App configuration
- `config/database.ts` - MySQL connection setup
- `config/openai.ts` - OpenAI client configuration
- `middleware/auth.ts` - JWT authentication middleware
- `middleware/validate.ts` - Zod schema validation middleware
- `middleware/errorHandler.ts` - Error handling middleware
- `middleware/rate-limit.ts` - Rate limiting
- `middleware/cors.ts` - CORS configuration
- `utils/response.ts` - API response formatting
- `utils/errors.ts` - Custom error classes
- `utils/helpers.ts` - Helper functions
- `types/index.ts` - TypeScript type definitions (513 lines)
- `types/express.d.ts` - Express request augmentation

### Frontend Pages (32 files)

#### Authentication (4 pages)
- `(auth)/login/page.tsx` - Login page
- `(auth)/register/page.tsx` - Registration page
- `(auth)/forgot-password/page.tsx` - Password recovery
- `(auth)/layout.tsx` - Auth layout (split branding design)

#### Student Dashboard (8 pages)
- `(dashboard)/dashboard/page.tsx` - Main student dashboard
- `(dashboard)/dashboard/assessment/page.tsx` - Assessment page
- `(dashboard)/dashboard/lessons/page.tsx` - Lessons list
- `(dashboard)/dashboard/lessons/[id]/page.tsx` - Lesson detail
- `(dashboard)/dashboard/curriculum/page.tsx` - Curriculum view
- `(dashboard)/dashboard/progress/page.tsx` - Progress tracking
- `(dashboard)/dashboard/solver/page.tsx` - Problem solver
- `(dashboard)/dashboard/chat/page.tsx` - AI tutor chat
- `(dashboard)/dashboard/settings/page.tsx` - Settings
- `(dashboard)/layout.tsx` - Dashboard layout (sidebar)

#### Admin Pages (8 pages)
- `(admin)/admin/page.tsx` - Admin dashboard
- `(admin)/admin/users/page.tsx` - User management
- `(admin)/admin/activity/page.tsx` - System activity
- `(admin)/admin/ai-logs/page.tsx` - AI generation logs
- `(admin)/admin/tutors/page.tsx` - AI tutor management
- `(admin)/admin/reports/page.tsx` - Reports
- `(admin)/admin/content/page.tsx` - Content management
- `(admin)/admin/settings/page.tsx` - Admin settings
- `(admin)/layout.tsx` - Admin layout (dark sidebar)

#### Parent Monitoring (5 pages) ⭐
- `(parent)/parent/page.tsx` - Parent dashboard (overview)
- `(parent)/parent/children/page.tsx` - Children management
- `(parent)/parent/reports/page.tsx` - Reports & analytics
- `(parent)/parent/notifications/page.tsx` - Notifications
- `(parent)/parent/settings/page.tsx` - Settings
- `(parent)/layout.tsx` - Parent layout (horizontal nav)

#### Root
- `app/page.tsx` - Homepage
- `app/layout.tsx` - Root layout

#### Utilities
- `lib/api.ts` - API client with type-safe requests
- `types/index.ts` - Frontend type definitions

---

## 🎯 Key Features Implemented

### ✅ 1. Student Classification & Profiling

**Location**: `packages/backend/src/services/auth.service.ts:258-278`

**Implementation**:
```typescript
resolveInitialClassification(data: RegisterDTO): string {
  const score = data.math_average_score;
  
  if (typeof score === 'number') {
    if (score < 4) return 'weak';
    if (score < 6) return 'average';
    if (score < 8) return 'good';
    return 'excellent';
  }
  return data.self_assessed_level ?? 'average';
}
```

**Classification Levels**:
- `weak` (score < 4)
- `average` (score 4-5.99)
- `good` (score 6-7.99)
- `excellent` (score ≥ 8)

**Storage**: 
- `
