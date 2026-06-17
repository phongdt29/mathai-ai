# MathAI - Complete Directory Tree

## Root Level Structure
```
D:\GitHub\mathai
├── .env                              Environment variables (production)
├── .env.example                      Environment template
├── .gitignore                        Git ignore rules
├── .opencode/                        OpenCode AI framework configuration
│   ├── agent/                        AI agent definitions (8 files)
│   ├── command/                      Custom OpenCode commands (16 files)
│   ├── skill/                        Reusable AI skills (100+ files)
│   ├── tool/                         Custom tools
│   ├── context/                      Context injection
│   ├── dcp-prompts/                  Default/override prompts
│   ├── memory/                       Project memory & documentation
│   ├── plans/                        Task planning documents
│   ├── plugin/                       OpenCode plugins (sessions, memory, stitch)
│   ├── opencode.json                 OpenCode configuration
│   ├── AGENTS.md                     Agent rules and alignment
│   └── package.json                  OpenCode dependencies
├── .playwright-mcp/                  Playwright testing artifacts
├── database/
│   ├── schema.sql                    Complete MySQL schema (422 lines, 22 tables)
│   └── migrations/
│       ├── 001_add_parent_children.sql
│       ├── 002_add_system_settings.sql
│       ├── 003_add_audit_logs.sql
│       ├── 004_add_backup_records.sql
│       ├── 005_alter_existing_tables.sql
│       ├── 006_add_ai_providers.sql
│       └── 007_add_initial_classification_setting.sql
├── docs/
│   ├── bao_cao_chi_tiết_dự_an_math_ai.md     Project report (Vietnamese)
│   ├── implementation-plan.md                 12k line implementation guide
│   └── plans/
│       └── backend-implementation-progress.md Progress tracking
├── mathai/                           Reference monorepo (fully implemented)
│   ├── database/
│   │   ├── schema.sql
│   │   └── migrations/               8 migration files
│   ├── packages/
│   │   ├── backend/                  Complete backend reference
│   │   └── frontend/                 Complete frontend reference
│   ├── deploy/                       Deployment scripts
│   ├── docs/                         Additional documentation
│   ├── scripts/                      Build & deploy scripts
│   ├── tests/e2e/                    End-to-end test configuration
│   └── package.json
├── packages/
│   ├── backend/                      Express API Server
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   ├── index.ts          App configuration loader
│   │   │   │   ├── database.ts       Knex/MySQL setup
│   │   │   │   └── openai.ts         OpenAI client config
│   │   │   ├── controllers/
│   │   │   │   ├── assessment.controller.ts       Assessment endpoints
│   │   │   │   ├── auth.controller.ts             Auth endpoints
│   │   │   │   ├── curriculum.controller.ts       Curriculum endpoints
│   │   │   │   ├── student.controller.ts          Student endpoints
│   │   │   │   ├── dashboard.controller.ts        Dashboard endpoints
│   │   │   │   └── [more controllers]
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts           JWT verification
│   │   │   │   ├── authorize.ts      Role-based access
│   │   │   │   ├── cors.ts           CORS configuration
│   │   │   │   ├── errorHandler.ts   Global error handling
│   │   │   │   ├── rate-limit.ts     Rate limiting
│   │   │   │   └── validate.ts       Request validation
│   │   │   ├── models/               Data access layer (Knex)
│   │   │   │   ├── base.model.ts     Generic CRUD repository
│   │   │   │   ├── user.model.ts     User queries
│   │   │   │   ├── student.model.ts  Student profile queries
│   │   │   │   ├── assessment.model.ts
│   │   │   │   ├── curriculum.model.ts
│   │   │   │   ├── lesson.model.ts
│   │   │   │   ├── chat.model.ts
│   │   │   │   ├── ai-tutor.model.ts
│   │   │   │   ├── progress.model.ts
│   │   │   │   ├── solver.model.ts
│   │   │   │   ├── notification.model.ts
│   │   │   │   └── ai-log.model.ts
│   │   │   ├── routes/               API endpoint definitions
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── assessment.routes.ts
│   │   │   │   ├── curriculum.routes.ts
│   │   │   │   ├── student.routes.ts
│   │   │   │   ├── dashboard.routes.ts
│   │   │   │   ├── lesson.routes.ts
│   │   │   │   ├── chat.routes.ts
│   │   │   │   └── [more routes]
│   │   │   ├── services/             Business logic layer
│   │   │   │   ├── auth.service.ts   Auth logic (JWT, hashing)
│   │   │   │   ├── student.service.ts Profile management
│   │   │   │   ├── assessment.service.ts Assessment generation & grading
│   │   │   │   ├── curriculum.service.ts Curriculum generation & sequencing
│   │   │   │   └── ai.service.ts     OpenAI API integration
│   │   │   ├── types/
│   │   │   │   ├── index.ts          513 lines of type definitions
│   │   │   │   └── express.d.ts      Express type extensions
│   │   │   ├── validators/           Zod validation schemas
│   │   │   │   ├── [schema files]
│   │   │   ├── utils/                Helper utilities
│   │   │   │   ├── errors.ts         Custom error classes
│   │   │   │   └── [helpers]
│   │   │   └── index.ts              Server entry point (924 bytes)
│   │   ├── dist/                     Compiled JavaScript
│   │   ├── package.json              Backend dependencies
│   │   ├── tsconfig.json             TypeScript config
│   │   ├── vitest.config.ts          Test configuration
│   │   └── .env.example
│   └── frontend/                     Next.js 14 Web App
│       ├── src/
│       │   ├── app/                  Next.js App Router (26 pages)
│       │   │   ├── (auth)/           Auth layout group
│       │   │   │   ├── layout.tsx    Split-screen layout (branding + form)
│       │   │   │   ├── login/
│       │   │   │   │   └── page.tsx  Login with 4 demo accounts
│       │   │   │   ├── register/
│       │   │   │   │   └── page.tsx  Student registration
│       │   │   │   └── forgot-password/
│       │   │   │       └── page.tsx  Password reset flow
│       │   │   ├── (dashboard)/      Student dashboard layout group
│       │   │   │   ├── layout.tsx    Sidebar layout
│       │   │   │   ├── dashboard/
│       │   │   │   │   ├── page.tsx  Main dashboard (stats, recent)
│       │   │   │   │   ├── lessons/page.tsx
│       │   │   │   │   ├── assessment/page.tsx
│       │   │   │   │   ├── curriculum/page.tsx
│       │   │   │   │   ├── progress/page.tsx
│       │   │   │   │   ├── chat/page.tsx
│       │   │   │   │   ├── solver/page.tsx
│       │   │   │   │   └── settings/page.tsx
│       │   │   ├── (admin)/          Admin layout group
│       │   │   │   ├── layout.tsx    Dark sidebar layout
│       │   │   │   ├── page.tsx      Admin dashboard
│       │   │   │   ├── users/page.tsx
│       │   │   │   ├── assessments/page.tsx
│       │   │   │   ├── curricula/page.tsx
│       │   │   │   ├── lessons/page.tsx
│       │   │   │   ├── analytics/page.tsx
│       │   │   │   ├── settings/page.tsx
│       │   │   │   └── logs/page.tsx
│       │   │   ├── (parent)/         Parent monitoring layout group
│       │   │   │   ├── layout.tsx    Horizontal nav layout
│       │   │   │   ├── page.tsx      Children overview (cards)
│       │   │   │   ├── [childId]/page.tsx
│       │   │   │   ├── reports/page.tsx
│       │   │   │   ├── alerts/page.tsx
│       │   │   │   └── settings/page.tsx
│       │   │   ├── globals.css       Tailwind directives
│       │   │   └── layout.tsx        Root layout
│       │   ├── components/           React components (UI)
│       │   │   ├── [component files]
│       │   ├── hooks/                Custom React hooks
│       │   │   ├── [hook files]
│       │   ├── lib/
│       │   │   ├── api.ts            API client (fetch wrapper)
│       │   │   └── [utilities]
│       │   └── types/                TypeScript type definitions
│       │       ├── [type files]
│       ├── next.config.js
│       ├── tailwind.config.ts        Tailwind configuration
│       ├── postcss.config.js
│       ├── tsconfig.jso
