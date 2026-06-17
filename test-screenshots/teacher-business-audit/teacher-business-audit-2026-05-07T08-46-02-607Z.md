# Teacher Business Audit 2026-05-07T08-46-02-607Z

API: http://localhost:3001/api
WEB: http://localhost:3444
Summary: PASS 0 / FAIL 36 / WARN 0 / SKIP 19

## Workflow summary
| Workflow | Pass | Fail | Warn | Skip |
|---|---:|---:|---:|---:|
| Auth/Profile/RBAC/Scope | PASS 0 | FAIL 24 | WARN 0 | SKIP 5 |
| Dashboard/Classes/Students | PASS 0 | FAIL 4 | WARN 0 | SKIP 2 |
| Proposals workflow | PASS 0 | FAIL 2 | WARN 0 | SKIP 1 |
| Runtime health | PASS 0 | FAIL 0 | WARN 0 | SKIP 1 |
| Content-library workflow | PASS 0 | FAIL 6 | WARN 0 | SKIP 1 |
| UI/Puppeteer workflow | PASS 0 | FAIL 0 | WARN 0 | SKIP 9 |

## Diagnostics considered
- RBAC middleware hoặc scoped authorization sai vai trò teacher
- Teacher service thiếu kiểm tra own class/student/assignment scope
- Workflow assignment thiếu endpoint detail/submission hoặc dữ liệu seeded không khớp
- Gradebook không được upsert sau gradeSubmission hoặc filter class/student sai
- Content-library teacher permission/proposal/publish rule sai
- Frontend teacher route dùng sai localStorage/auth hoặc API client path
- UI route render lỗi, network 4xx/5xx, console error, loading stuck, mojibake hoặc overflow

## Checks
| Status | Workflow | Check | Endpoint/Artifact | Note |
|---|---|---|---|---|
| FAIL | Auth/Profile/RBAC/Scope | Backend API health /auth/me unauthorized | /auth/me | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:328:3) |
| FAIL | Auth/Profile/RBAC/Scope | Auth login admin | /auth/login | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async login (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:139:15)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:331:18) |
| FAIL | Auth/Profile/RBAC/Scope | Auth token present admin |  | Không tìm thấy token trong response login |
| FAIL | Auth/Profile/RBAC/Scope | Auth login teacher | /auth/login | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async login (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:139:15)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:331:18) |
| FAIL | Auth/Profile/RBAC/Scope | Auth token present teacher |  | Không tìm thấy token trong response login |
| FAIL | Auth/Profile/RBAC/Scope | Auth login student | /auth/login | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async login (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:139:15)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:331:18) |
| FAIL | Auth/Profile/RBAC/Scope | Auth token present student |  | Không tìm thấy token trong response login |
| FAIL | Auth/Profile/RBAC/Scope | Auth login parent | /auth/login | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async login (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:139:15)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:331:18) |
| FAIL | Auth/Profile/RBAC/Scope | Auth token present parent |  | Không tìm thấy token trong response login |
| FAIL | Auth/Profile/RBAC/Scope | RBAC teacher forbidden admin stats | /admin/stats | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:336:3) |
| FAIL | Auth/Profile/RBAC/Scope | RBAC teacher forbidden parent children | /parent/children | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:337:3) |
| FAIL | Auth/Profile/RBAC/Scope | RBAC teacher forbidden student dashboard | /dashboard/stats | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:338:3) |
| FAIL | Auth/Profile/RBAC/Scope | RBAC student forbidden teacher dashboard | /teacher/dashboard | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:339:3) |
| FAIL | Auth/Profile/RBAC/Scope | RBAC parent forbidden teacher classes | /teacher/classes | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:340:3) |
| FAIL | Auth/Profile/RBAC/Scope | RBAC unauth teacher dashboard rejected | /teacher/dashboard | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:341:3) |
| FAIL | Dashboard/Classes/Students | Teacher dashboard | /teacher/dashboard | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:343:23) |
| FAIL | Dashboard/Classes/Students | Teacher classes list | /teacher/classes | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:344:26) |
| FAIL | Dashboard/Classes/Students | Teacher students list | /teacher/students | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:345:27) |
| FAIL | Auth/Profile/RBAC/Scope | Teacher assignments list | /teacher/assignments | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:346:30) |
| FAIL | Dashboard/Classes/Students | Teacher analytics | /teacher/analytics | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:347:3) |
| FAIL | Proposals workflow | Teacher proposals list | /teacher/proposals | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:348:3) |
| FAIL | Proposals workflow | Teacher proposals pending filter | /teacher/proposals?status=pending | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:349:3) |
| FAIL | Auth/Profile/RBAC/Scope | Teacher scope denies unknown class detail | /teacher/classes/507f1f77bcf86cd799439098 | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:350:3) |
| FAIL | Auth/Profile/RBAC/Scope | Teacher scope denies unknown class students | /teacher/classes/507f1f77bcf86cd799439098/students | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:351:3) |
| FAIL | Auth/Profile/RBAC/Scope | Teacher assignments unknown class filter denied | /teacher/assignments?class_id=507f1f77bcf86cd799439098 | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:352:3) |
| SKIP | Runtime health | Teacher class dependent workflows |  | Teacher không có class seed |
| FAIL | Auth/Profile/RBAC/Scope | Teacher gradebook unknown class denied | /teacher/classes/507f1f77bcf86cd799439098/gradebook | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:414:3) |
| FAIL | Auth/Profile/RBAC/Scope | Teacher gradebook unknown student denied/empty | /teacher/gradebook?student_id=507f1f77bcf86cd799439099 | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:415:3) |
| FAIL | Content-library workflow | Content library teacher curriculum templates list | /content-library/curriculum-templates?limit=20 | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:417:21) |
| FAIL | Content-library workflow | Content library teacher lesson templates list | /content-library/lesson-templates?limit=20 | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:418:19) |
| FAIL | Content-library workflow | Content library teacher own draft curriculum list | /content-library/curriculum-templates?own=true&status=draft&limit=20 | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:419:3) |
| FAIL | Content-library workflow | Content library teacher own draft lesson list | /content-library/lesson-templates?own=true&status=draft&limit=20 | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:420:3) |
| FAIL | Content-library workflow | Content library seeded curriculum detail teacher | /content-library/curriculum-templates/69fc0a0fea7bd7fefb462d5e | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:421:3) |
| FAIL | Content-library workflow | Content library seeded lesson detail teacher | /content-library/lesson-templates/69fc0a0fea7bd7fefb462d60 | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:422:3) |
| FAIL | Auth/Profile/RBAC/Scope | Content library seeded assignment detail teacher/admin scoped | /content-library/assignments/69fc0a0fea7bd7fefb462d63 | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:423:3) |
| SKIP | Content-library workflow | Content library lesson detail/update/publish |  | Không có lesson template |
| SKIP | Auth/Profile/RBAC/Scope | Content assignment marker workflow |  | Thiếu class hoặc lesson template |
| FAIL | Auth/Profile/RBAC/Scope | Content library student forbidden assignments | /content-library/assignments | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:453:3) |
| FAIL | Auth/Profile/RBAC/Scope | Content library teacher unknown target assignment denied | /content-library/assignments | TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async request (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:103:20)
    at async apiCheck (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:115:20)
    at async main (d:\GitHub\mathai\scripts\.tmp-teacher-business-audit.cjs:454:3) |
| SKIP | UI/Puppeteer workflow | UI snapshot teacher /teacher |  | Puppeteer không có trong node_modules |
| SKIP | Dashboard/Classes/Students | UI snapshot teacher /teacher/classes |  | Puppeteer không có trong node_modules |
| SKIP | Dashboard/Classes/Students | UI snapshot teacher /teacher/students |  | Puppeteer không có trong node_modules |
| SKIP | Auth/Profile/RBAC/Scope | UI snapshot teacher /teacher/assignments |  | Puppeteer không có trong node_modules |
| SKIP | UI/Puppeteer workflow | UI snapshot teacher /teacher/content-library |  | Puppeteer không có trong node_modules |
| SKIP | UI/Puppeteer workflow | UI snapshot teacher /teacher/content-library/curricula/new |  | Puppeteer không có trong node_modules |
| SKIP | UI/Puppeteer workflow | UI snapshot teacher /teacher/content-library/curricula/69fc0a0fea7bd7fefb462d5e |  | Puppeteer không có trong node_modules |
| SKIP | UI/Puppeteer workflow | UI snapshot teacher /teacher/content-library/lessons/new |  | Puppeteer không có trong node_modules |
| SKIP | UI/Puppeteer workflow | UI snapshot teacher /teacher/content-library/lessons/69fc0a0fea7bd7fefb462d60 |  | Puppeteer không có trong node_modules |
| SKIP | UI/Puppeteer workflow | UI snapshot teacher /teacher/content-library/lessons/69fc0a0fea7bd7fefb462d60/edit |  | Puppeteer không có trong node_modules |
| SKIP | UI/Puppeteer workflow | UI snapshot teacher /teacher/content-library/lessons/69fc0a0fea7bd7fefb462d60/stats |  | Puppeteer không có trong node_modules |
| SKIP | Auth/Profile/RBAC/Scope | UI snapshot teacher /teacher/content-library/assignments/69fc0a0fea7bd7fefb462d63 |  | Puppeteer không có trong node_modules |
| SKIP | Auth/Profile/RBAC/Scope | UI snapshot teacher /teacher/content-library/assignments/69fc0a0fea7bd7fefb462d63/edit |  | Puppeteer không có trong node_modules |
| SKIP | Auth/Profile/RBAC/Scope | UI snapshot teacher /teacher/content-library/assignments/69fc0a0fea7bd7fefb462d63/stats |  | Puppeteer không có trong node_modules |
| SKIP | Proposals workflow | UI snapshot teacher /teacher/proposals |  | Puppeteer không có trong node_modules |
| SKIP | UI/Puppeteer workflow | UI snapshot teacher /teacher/settings |  | Puppeteer không có trong node_modules |

## Artifacts