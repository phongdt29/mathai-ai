# Student Business Audit 2026-05-07T07-11-08-952Z

API: http://localhost:3001/api
WEB: http://localhost:3444

Summary: PASS 49 / FAIL 1 / WARN 0 / SKIP 0

## Workflow summary
| Workflow | Pass | Fail | Warn | Skip |
|---|---:|---:|---:|---:|
| Runtime | PASS 1 | FAIL 0 | WARN 0 | SKIP 0 |
| Auth/Profile | PASS 8 | FAIL 0 | WARN 0 | SKIP 0 |
| Dashboard/Progress/Curriculum | PASS 8 | FAIL 0 | WARN 0 | SKIP 0 |
| Lesson learning flow | PASS 6 | FAIL 0 | WARN 0 | SKIP 0 |
| Assessment/quiz flow | PASS 14 | FAIL 0 | WARN 0 | SKIP 0 |
| Solver/Chat AI | PASS 11 | FAIL 0 | WARN 0 | SKIP 0 |
| UI/Puppeteer học viên | PASS 1 | FAIL 0 | WARN 0 | SKIP 0 |
| Fatal | PASS 0 | FAIL 1 | WARN 0 | SKIP 0 |

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
| PASS | Assessment/quiz flow | Assessment detail | /assessments/69f1d5a159e012504d769896 | 200 |
| PASS | Assessment/quiz flow | Start assessment attempt when safe | /assessments/69f1d5a159e012504d769896/start | 201 |
| PASS | Assessment/quiz flow | Save answer question 1 | /assessments/69f1d5a159e012504d769896/attempts/69fc3b2b7fbeaddc1886ba97/answers | 200 |
| PASS | Assessment/quiz flow | Save answer question 2 | /assessments/69f1d5a159e012504d769896/attempts/69fc3b2b7fbeaddc1886ba97/answers | 200 |
| PASS | Assessment/quiz flow | Save answer question 3 | /assessments/69f1d5a159e012504d769896/attempts/69fc3b2b7fbeaddc1886ba97/answers | 200 |
| PASS | Assessment/quiz flow | Save answer question 4 | /assessments/69f1d5a159e012504d769896/attempts/69fc3b2b7fbeaddc1886ba97/answers | 200 |
| PASS | Assessment/quiz flow | Save answer question 5 | /assessments/69f1d5a159e012504d769896/attempts/69fc3b2b7fbeaddc1886ba97/answers | 200 |
| PASS | Assessment/quiz flow | Save answer question 6 | /assessments/69f1d5a159e012504d769896/attempts/69fc3b2b7fbeaddc1886ba97/answers | 200 |
| PASS | Assessment/quiz flow | Save answer question 7 | /assessments/69f1d5a159e012504d769896/attempts/69fc3b2b7fbeaddc1886ba97/answers | 200 |
| PASS | Assessment/quiz flow | Save answer question 8 | /assessments/69f1d5a159e012504d769896/attempts/69fc3b2b7fbeaddc1886ba97/answers | 200 |
| PASS | Assessment/quiz flow | Submit assessment attempt marker | /assessments/69f1d5a159e012504d769896/attempts/69fc3b2b7fbeaddc1886ba97/submit | 200 |
| PASS | Assessment/quiz flow | Assessment result after submit/check | /assessments/69f1d5a159e012504d769896/result | 200 |
| PASS | Solver/Chat AI | Solver on-scope math hint | /solver/solve | Dev solver fallback đang hoạt động |
| PASS | Solver/Chat AI | Solver on-scope full solution | /solver/solve | Dev solver fallback đang hoạt động |
| PASS | Solver/Chat AI | Solver off-scope guard blocked | /solver/solve | 400 |
| PASS | Solver/Chat AI | Solver history | /solver/history?limit=10 | 200 |
| PASS | Solver/Chat AI | Solver examples fail-safe | /solver/examples?grade_level=8&count=2 | 200 |
| PASS | Solver/Chat AI | Chat teachers | /chat/teachers | 200 |
| PASS | Solver/Chat AI | Chat conversations list | /chat/conversations | 200 |
| PASS | Solver/Chat AI | Chat create conversation marker | /chat/conversations | 200 |
| PASS | Solver/Chat AI | Chat send math message streaming/fail-safe | /chat/conversations/69fc3b507fbeaddc1886bb2a/messages | 200 |
| PASS | Solver/Chat AI | Chat conversation messages | /chat/conversations/69fc3b507fbeaddc1886bb2a/messages | 200 |
| PASS | Solver/Chat AI | Chat delete marker cleanup | /chat/conversations/69fc3b507fbeaddc1886bb2a | 200 |
| PASS | UI/Puppeteer học viên | Puppeteer available |  |  |
| FAIL | Fatal | student business audit fatal |  | TypeError: page.waitForTimeout is not a function
    at snapshotStudentPage (d:\GitHub\mathai\scripts\.tmp-student-business-audit.cjs:320:14)
    at async runUiAudit (d:\GitHub\mathai\scripts\.tmp-student-business-audit.cjs:375:7)
    at async main (d:\GitHub\mathai\scripts\.tmp-student-business-audit.cjs:437:19) |

## Artifacts