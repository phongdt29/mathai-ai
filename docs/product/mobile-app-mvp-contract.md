# P3-06 Mobile App MVP Contract

## Status

Proposed product contract for a future MathAI mobile MVP. This document defines what the mobile app must prove before prototype review and before release-candidate readiness. It does not create or scaffold a mobile application.

## Product Goal

Deliver a focused mobile experience for students and parents to access MathAI learning status, lesson progress, and report/reward information from a phone without replacing the full web application.

## Primary Users

| User        | MVP intent                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student     | Continue assigned learning, review progress, and see rewards from a mobile device.                                                                |
| Parent      | Monitor linked student progress and weekly/report summaries from a mobile device.                                                                 |
| Teacher     | Optional read-focused validation user for classroom progress. Not required for first MVP unless product explicitly promotes teacher mobile usage. |
| Staff/Admin | Support and QA only. Administrative workflows remain web-first.                                                                                   |

## MVP Screens and Flows

### Shared Screens

1. **Launch/loading screen**
   - Checks local session state.
   - Routes to sign-in, role-aware home, or offline cached state.

2. **Sign-in screen**
   - Accepts supported credentials.
   - Displays safe validation and auth/session errors.
   - Does not expose demo credentials or real environment values.

3. **Session recovery screen/state**
   - Handles expired, revoked, unauthenticated, and network-unreachable session states.
   - Provides clear re-authentication or retry action.

4. **Role-aware home screen**
   - Shows student or parent entry points based on authenticated role.
   - Blocks unsupported roles with a clear message rather than exposing inaccessible navigation.

5. **Profile/settings screen**
   - Shows current user identity, role, linked students where applicable, app version/build placeholder, and logout.
   - Does not include destructive account administration in MVP.

### Student MVP Flow

1. Student signs in.
2. Student lands on mobile dashboard.
3. Dashboard shows next assignment/action, progress summary, and reward/points summary if available.
4. Student opens assigned lesson or exercise detail.
5. Student submits answer/progress where supported by the mobile API readiness contract.
6. Student sees result/feedback and updated progress/reward state.
7. Student can view recent activity and cached last-known state when offline.

Required student screens:

- Student Dashboard
- Assignment/Lesson List
- Lesson or Exercise Detail
- Submission Result/Feedback
- Progress Summary
- Reward/Points Summary if gamification remains visible in MVP

### Parent MVP Flow

1. Parent signs in.
2. Parent lands on parent dashboard.
3. Parent selects a linked student if more than one exists.
4. Parent views weekly progress/report summary.
5. Parent views subject/skill progress details where available.
6. Parent can refresh data, see stale/offline state, and log out.

Required parent screens:

- Parent Dashboard
- Linked Student Selector when applicable
- Student Progress Summary
- Weekly Report Summary
- Report Detail or Breakdown

### Optional Teacher Validation Flow

Teacher mobile support is optional for the first MVP. If included, it must remain read-focused:

- Teacher sign-in
- Class list or classroom summary
- Student progress overview
- No lesson authoring, grading configuration, user management, or destructive actions

## Explicit Non-goals

- Do not scaffold, generate, or commit a mobile app in this phase.
- Do not select a final mobile framework in this phase.
- Do not add runtime dependencies, SDKs, analytics packages, push notification services, or native modules in this phase.
- Do not store real secrets, signing keys, provisioning profiles, keystores, certificates, or production environment values in the repository.
- Do not implement admin/staff mobile workflows beyond QA smoke testing.
- Do not replace the web application for teacher authoring, staff operations, admin user management, data exports, or deployment operations.
- Do not require offline write queues for MVP unless product adds a separate requirement and the API supports idempotent writes.
- Do not implement push notifications, in-app purchases, chat, camera scanning, or native device integrations for the MVP.
- Do not introduce new backend schema changes as part of this contract document.

## Framework Decision Placeholder

Framework decision is intentionally deferred.

Decision to make later:

- Candidate options: React Native/Expo, React Native bare workflow, Flutter, native iOS/Android, or a progressive web app wrapper.
- Required decision inputs: team experience, API readiness, offline needs, build/release constraints, accessibility expectations, testing strategy, long-term maintenance cost, and app store requirements.
- Required output: an ADR or product-engineering decision note before any mobile code scaffold is created.

No mobile framework should be installed, initialized, or committed until this decision is accepted.

## Build and Release Prerequisites

Before prototype distribution:

- Confirm API base URL strategy for local, staging, and production without committing real env values.
- Confirm supported test accounts or seed data process without exposing credentials in docs or source.
- Confirm app name, bundle identifier/application id placeholder, versioning convention, and minimum supported OS versions.
- Confirm crash/error reporting approach, even if manually collected for prototype.
- Confirm accessibility baseline for core screens: readable text sizes, touch target sizing, screen reader labels, and keyboard/external input expectations where applicable.
- Confirm privacy review for any cached student or parent data.

Before release candidate:

- Mobile API readiness contract tests pass for auth/session, role access, pagination, filtering, errors, rate limits, and offline/retry behavior.
- App configuration separates development, staging, and production values without storing secrets in source control.
- Release build process is documented and reproducible on approved developer or CI machines.
- Store metadata, screenshots, privacy labels, and support URLs are drafted if app-store distribution is planned.
- Monitoring, support, and rollback procedures are documented.
- Legal/privacy review signs off on student data handling and parent access behavior.

## Signing and Secrets Handling

- Signing keys, provisioning profiles, certificates, keystores, API tokens, and service account files must never be committed.
- Use platform secure storage for runtime auth/session credentials.
- Use local ignored files, encrypted secret stores, or CI secret managers for signing material once a framework and release pipeline are chosen.
- Document required secret names with placeholder values only, for example `MOBILE_API_BASE_URL`, `IOS_BUNDLE_ID`, or `ANDROID_APPLICATION_ID`. Do not document real values.
- Rotate any credential immediately if it is exposed in a repository, log, screenshot, artifact, or shared document.
- Release builds must verify they are not pointing at localhost, demo login bypasses, bearer-token bypass flags, or non-production API URLs.

## Prototype Acceptance Criteria

A prototype is acceptable when it proves the core experience without claiming production readiness:

- Student can sign in through a safe test environment and view role-aware dashboard content.
- Parent can sign in through a safe test environment and view only linked student data.
- Auth/session errors, expired session, and network failure states are visible and understandable.
- At least one student learning/progress flow is clickable end-to-end using test data.
- Pagination or incremental loading is represented for list screens that can exceed one screen of content.
- Offline or poor-network state is represented with stale-data messaging for cached read-only data.
- No real secrets, signing material, production credentials, or real env values are present in source, docs, screenshots, or build artifacts.
- Unsupported roles see a clear unsupported/mobile-not-available state.
- Prototype limitations are listed in release notes or demo notes.

## Release-candidate Acceptance Criteria

A release candidate is acceptable only when it can be tested as a production-like mobile app:

- All required MVP screens and flows pass QA on target devices or simulators/emulators.
- Auth/session storage uses platform secure storage and handles unauthenticated, expired, revoked, and logout states correctly.
- Student, parent, and optional teacher role boundaries are verified by contract tests and manual QA.
- API pagination, filtering, error, rate-limit, and offline/retry conventions match `docs/product/mobile-api-readiness.md`.
- Release build uses non-secret checked-in configuration plus external secret/signing injection.
- Signing and distribution steps are documented without committing signing material.
- Accessibility baseline passes for core screens.
- Privacy-sensitive cached data can be cleared on logout.
- Crash/error reporting or manual incident collection is ready for testers.
- App version, build number, environment label, and support diagnostics are visible in an appropriate settings or debug surface.
- Product owner accepts explicit non-goals and deferred features.
