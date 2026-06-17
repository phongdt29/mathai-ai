# Repository Guidelines

## Project Structure & Module Organization

MathAI is an npm workspaces monorepo. Active code lives in `packages/backend` and `packages/frontend`; ignore the nested `mathai/` tree unless a task targets it. Backend source is in `packages/backend/src`: `controllers`, `services`, `models`, `routes`, `middleware`, `validators`, `config`, and `utils`. Frontend source is in `packages/frontend/src`: App Router pages in `app`, UI in `components`, helpers in `lib`, and React state in `hooks` and `contexts`. `database/` is SQL reference/deployment material; runtime uses MongoDB/Mongoose. Docs live in `docs/`, deployment assets in `deploy/`.

## Build, Test, and Development Commands

- `npm install`: install root workspace dependencies.
- `npm run dev`: kill ports `3444` and `3001`, then start frontend and backend together.
- `npm run dev:backend`: run Express with `tsx watch` on port `3001`.
- `npm run dev:frontend`: run Next.js on port `3444`.
- `npm run build`: build backend TypeScript and frontend Next.js output.
- `npm run verify`: run backend tests/build plus frontend lint/test/build.
- `npm run seed --workspace=packages/backend`: seed local/dev/staging MongoDB demo data.

## Coding Style & Naming Conventions

Use TypeScript strict mode and match surrounding style. Prefer domain names such as `lesson.service.ts`, `role-profile.model.ts`, `auth.routes.ts`, and `LessonTemplateForm.tsx`. React components are `PascalCase`; hooks are `useX`; Next route files stay named `page.tsx`, `layout.tsx`, or `route.ts`. Frontend imports may use `@/*`. ESLint is frontend-only.

## Testing Guidelines

Backend tests use Node's built-in runner through `tsx`: `npm run test --workspace=packages/backend`. Frontend tests use Bun: `npm run test --workspace=packages/frontend`. Name tests `*.test.ts`, `*.test.tsx`, `*.test.mjs`, or `*.test.cjs`, colocated with the unit or under `packages/frontend/test`. Run focused tests first, then `npm run verify` for cross-workspace changes.

## Commit & Pull Request Guidelines

Follow the existing Conventional Commit style: `feat: add staff role operational access`, `fix(runtime): repair dynamic detail pages`, or `docs: update foundation audit status`. Pull requests should describe the change, list verification commands, link related issues, and include screenshots for visible frontend changes.

## Security & Configuration Tips

Copy `.env.example`, `packages/backend/.env.example`, and `packages/frontend/.env.example` for local setup. Do not commit secrets or production values. Keep demo login and bearer-token flags disabled in production, and never set production `NEXT_PUBLIC_API_URL` to localhost.

## Issue Tracking with br (beads_rust)

**Note:** `br` is non-invasive and never executes git commands. The `.beads/` directory is local-only (gitignored) and should not be committed.

Use `br ready`, `br show <id>`, and `br update <id>` when a task references tracked work.
