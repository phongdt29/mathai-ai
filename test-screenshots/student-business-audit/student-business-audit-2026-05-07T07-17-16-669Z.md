# Student Business Audit 2026-05-07T07-17-16-669Z

API: http://localhost:3001/api
WEB: http://localhost:3444

Summary: PASS 61 / FAIL 0 / WARN 0 / SKIP 0

## Workflow summary
| Workflow | Pass | Fail | Warn | Skip |
|---|---:|---:|---:|---:|
| Runtime | PASS 1 | FAIL 0 | WARN 0 | SKIP 0 |
| Auth/Profile | PASS 8 | FAIL 0 | WARN 0 | SKIP 0 |
| Dashboard/Progress/Curriculum | PASS 8 | FAIL 0 | WARN 0 | SKIP 0 |
| Lesson learning flow | PASS 6 | FAIL 0 | WARN 0 | SKIP 0 |
| Assessment/quiz flow | PASS 14 | FAIL 0 | WARN 0 | SKIP 0 |
| Solver/Chat AI | PASS 11 | FAIL 0 | WARN 0 | SKIP 0 |
| UI/Puppeteer học viên | PASS 13 | FAIL 0 | WARN 0 | SKIP 0 |

## Checks
| Status | Workflow | Check | Endpoint/Artifact | Note |
|---|---|---|---|---|
| PASS | Runtime | Backend health unauth /auth/me | /auth/me | 401 |
| PASS | Auth/Profile | Login student demo | /auth/login | 200 |
| PASS | Auth/Profile | Auth token present |  |  |
| PASS | Auth/Profile | /auth/me | /auth/me | 200 |
| PASS | Auth/Profile | Student profile | /students/profile | 200 |
| PASS | Auth/Profile | Student theme | /students/theme | 200 |
| PASS | Auth/Profile | Student tutors | /students/tutors | 200 |
| PASS | Auth/Profile | Student personalization | /students/personalization | 200 |
| PASS | Auth/Profile | Student theme safe idempotent update | /students/theme | 200 |
| PASS | Dashboard/Progress/Curriculum | Dashboard summary stats | /dashboard/stats | 200 |
| PASS | Dashboard/Progress/Curriculum | Dashboard progress metrics | /dashboard/progress | 200 |
| PASS | Dashboard/Progress/Curriculum | Topic mastery | /dashboard/mastery | 200 |
| PASS | Dashboard/Progress/Curriculum | Points ledger detail | /dashboard/points | 200 |
| PASS | Dashboard/Progress/Curriculum | Points summary | /dashboard/points/summary | 200 |
| PASS | Dashboard/Progress/Curriculum | Active curriculum alias singular | /curriculum/active | 200 |
| PASS | Dashboard/Progress/Curriculum | Active curriculum alias plural | /curricula/active | 200 |
| PASS | Dashboard/Progress/Curriculum | Curriculum list | /curriculum | 200 |
| PASS | Lesson learning flow | Lessons list | /lessons?limit=50 | 200 |
| PASS | Lesson learning flow | Today recommendation | /lessons/today-recommendation | 200 |
| PASS | Lesson learning flow | Lesson detail | /lessons/69fbf565ea7bd7fefb462d30 | 200 |
| PASS | Lesson learning flow | Exercise attempt history | /lessons/69fbf565ea7bd7fefb462d30/exercise-attempts/history | 200 |
| PASS | Lesson learning flow | Submit/check lesson quiz result marker idempotent | /lessons/69fbf565ea7bd7fefb462d30/quiz-results | 200 |
| PASS | Lesson learning flow | Submit exercise attempt marker answers | /lessons/69fbf565ea7bd7fefb462d30/exercise-attempts/submit | 200 |
| PASS | Assessment/quiz flow | Assessment list/current | /assessments | 200 |
| PASS | Assessment/quiz flow | Latest assessment result | /assessments/latest-result | 200 |
| PASS | Assessment/quiz flow | Assessment detail | /assessments/69f1d25659e012504d76986e | 200 |
| PASS | Assessment/quiz flow | Start assessment attempt when safe | /assessments/69f1d25659e012504d76986e/start | 201 |
| PASS | Assessment/quiz flow | Save answer question 1 | /assessments/69f1d25659e012504d76986e/attempts/69fc3c947fbeaddc1886bd9a/answers | 200 |
| PASS | Assessment/quiz flow | Save answer question 2 | /assessments/69f1d25659e012504d76986e/attempts/69fc3c947fbeaddc1886bd9a/answers | 200 |
| PASS | Assessment/quiz flow | Save answer question 3 | /assessments/69f1d25659e012504d76986e/attempts/69fc3c947fbeaddc1886bd9a/answers | 200 |
| PASS | Assessment/quiz flow | Save answer question 4 | /assessments/69f1d25659e012504d76986e/attempts/69fc3c947fbeaddc1886bd9a/answers | 200 |
| PASS | Assessment/quiz flow | Save answer question 5 | /assessments/69f1d25659e012504d76986e/attempts/69fc3c947fbeaddc1886bd9a/answers | 200 |
| PASS | Assessment/quiz flow | Save answer question 6 | /assessments/69f1d25659e012504d76986e/attempts/69fc3c947fbeaddc1886bd9a/answers | 200 |
| PASS | Assessment/quiz flow | Save answer question 7 | /assessments/69f1d25659e012504d76986e/attempts/69fc3c947fbeaddc1886bd9a/answers | 200 |
| PASS | Assessment/quiz flow | Save answer question 8 | /assessments/69f1d25659e012504d76986e/attempts/69fc3c947fbeaddc1886bd9a/answers | 200 |
| PASS | Assessment/quiz flow | Submit assessment attempt marker | /assessments/69f1d25659e012504d76986e/attempts/69fc3c947fbeaddc1886bd9a/submit | 200 |
| PASS | Assessment/quiz flow | Assessment result after submit/check | /assessments/69f1d25659e012504d76986e/result | 200 |
| PASS | Solver/Chat AI | Solver on-scope math hint | /solver/solve | Dev solver fallback đang hoạt động |
| PASS | Solver/Chat AI | Solver on-scope full solution | /solver/solve | Dev solver fallback đang hoạt động |
| PASS | Solver/Chat AI | Solver off-scope guard blocked | /solver/solve | 400 |
| PASS | Solver/Chat AI | Solver history | /solver/history?limit=10 | 200 |
| PASS | Solver/Chat AI | Solver examples fail-safe | /solver/examples?grade_level=8&count=2 | 200 |
| PASS | Solver/Chat AI | Chat teachers | /chat/teachers | 200 |
| PASS | Solver/Chat AI | Chat conversations list | /chat/conversations | 200 |
| PASS | Solver/Chat AI | Chat create conversation marker | /chat/conversations | 200 |
| PASS | Solver/Chat AI | Chat send math message streaming/fail-safe | /chat/conversations/69fc3cb77fbeaddc1886be31/messages | 200 |
| PASS | Solver/Chat AI | Chat conversation messages | /chat/conversations/69fc3cb77fbeaddc1886be31/messages | 200 |
| PASS | Solver/Chat AI | Chat delete marker cleanup | /chat/conversations/69fc3cb77fbeaddc1886be31 | 200 |
| PASS | UI/Puppeteer học viên | Puppeteer available |  |  |
| PASS | UI/Puppeteer học viên | Route /dashboard | test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard.png | 200 |
| PASS | UI/Puppeteer học viên | Route /dashboard/lessons | test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-lessons.png | 200 |
| PASS | UI/Puppeteer học viên | Route /dashboard/lessons/69fbf565ea7bd7fefb462d30 | test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-lessons-69fbf565ea7bd7fefb462d30.png | 200 |
| PASS | UI/Puppeteer học viên | Route /dashboard/lessons/69fbf565ea7bd7fefb462d30/content/1 | test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-lessons-69fbf565ea7bd7fefb462d30-content-1.png | 200 |
| PASS | UI/Puppeteer học viên | Route /dashboard/lessons/69fbf565ea7bd7fefb462d30/content/check | test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-lessons-69fbf565ea7bd7fefb462d30-content-check.png | 200 |
| PASS | UI/Puppeteer học viên | Route /dashboard/progress | test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-progress.png | 200 |
| PASS | UI/Puppeteer học viên | Route /dashboard/points | test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-points.png | 200 |
| PASS | UI/Puppeteer học viên | Route /dashboard/solver | test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-solver.png | 200 |
| PASS | UI/Puppeteer học viên | Route /dashboard/chat | test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-chat.png | 200 |
| PASS | UI/Puppeteer học viên | Route /dashboard/curriculum | test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-curriculum.png | 200 |
| PASS | UI/Puppeteer học viên | Route /dashboard/settings | test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-settings.png | 200 |
| PASS | UI/Puppeteer học viên | Route /dashboard/assessment | test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-assessment.png | 200 |

## Artifacts
- test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard.png
- test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-lessons.png
- test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-lessons-69fbf565ea7bd7fefb462d30.png
- test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-lessons-69fbf565ea7bd7fefb462d30-content-1.png
- test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-lessons-69fbf565ea7bd7fefb462d30-content-check.png
- test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-progress.png
- test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-points.png
- test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-solver.png
- test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-chat.png
- test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-curriculum.png
- test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-settings.png
- test-screenshots/student-business-audit/2026-05-07T07-17-16-669Z-student-dashboard-assessment.png