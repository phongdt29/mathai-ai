# Teacher Business Audit 2026-05-07T08-38-27-988Z

API: http://localhost:3001/api
WEB: http://localhost:3444
Summary: PASS 64 / FAIL 0 / WARN 1 / SKIP 17

## Workflow summary
| Workflow | Pass | Fail | Warn | Skip |
|---|---:|---:|---:|---:|
| Auth/Profile/RBAC/Scope | PASS 43 | FAIL 0 | WARN 1 | SKIP 4 |
| Dashboard/Classes/Students | PASS 6 | FAIL 0 | WARN 0 | SKIP 2 |
| Proposals workflow | PASS 4 | FAIL 0 | WARN 0 | SKIP 1 |
| Runtime health | PASS 1 | FAIL 0 | WARN 0 | SKIP 0 |
| Gradebook workflow | PASS 1 | FAIL 0 | WARN 0 | SKIP 0 |
| Assignment workflow | PASS 1 | FAIL 0 | WARN 0 | SKIP 1 |
| Content-library workflow | PASS 8 | FAIL 0 | WARN 0 | SKIP 0 |
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
| PASS | Auth/Profile/RBAC/Scope | Backend API health /auth/me unauthorized | /auth/me | 401 |
| PASS | Auth/Profile/RBAC/Scope | Auth login admin | /auth/login | 200 |
| PASS | Auth/Profile/RBAC/Scope | Auth token present admin |  |  |
| PASS | Auth/Profile/RBAC/Scope | Auth /auth/me admin | /auth/me | 200 |
| PASS | Auth/Profile/RBAC/Scope | Auth login teacher | /auth/login | 200 |
| PASS | Auth/Profile/RBAC/Scope | Auth token present teacher |  |  |
| PASS | Auth/Profile/RBAC/Scope | Auth /auth/me teacher | /auth/me | 200 |
| PASS | Auth/Profile/RBAC/Scope | Auth login student | /auth/login | 200 |
| PASS | Auth/Profile/RBAC/Scope | Auth token present student |  |  |
| PASS | Auth/Profile/RBAC/Scope | Auth /auth/me student | /auth/me | 200 |
| PASS | Auth/Profile/RBAC/Scope | Auth login parent | /auth/login | 200 |
| PASS | Auth/Profile/RBAC/Scope | Auth token present parent |  |  |
| PASS | Auth/Profile/RBAC/Scope | Auth /auth/me parent | /auth/me | 200 |
| PASS | Auth/Profile/RBAC/Scope | RBAC teacher forbidden admin stats | /admin/stats | 403 |
| PASS | Auth/Profile/RBAC/Scope | RBAC teacher forbidden parent children | /parent/children | 403 |
| PASS | Auth/Profile/RBAC/Scope | RBAC teacher forbidden student dashboard | /dashboard/stats | 403 |
| PASS | Auth/Profile/RBAC/Scope | RBAC student forbidden teacher dashboard | /teacher/dashboard | 403 |
| PASS | Auth/Profile/RBAC/Scope | RBAC parent forbidden teacher classes | /teacher/classes | 403 |
| PASS | Auth/Profile/RBAC/Scope | RBAC unauth teacher dashboard rejected | /teacher/dashboard | 401 |
| PASS | Dashboard/Classes/Students | Teacher dashboard | /teacher/dashboard | 200 |
| PASS | Dashboard/Classes/Students | Teacher classes list | /teacher/classes | 200 |
| PASS | Dashboard/Classes/Students | Teacher students list | /teacher/students | 200 |
| PASS | Auth/Profile/RBAC/Scope | Teacher assignments list | /teacher/assignments | 200 |
| PASS | Dashboard/Classes/Students | Teacher analytics | /teacher/analytics | 200 |
| PASS | Proposals workflow | Teacher proposals list | /teacher/proposals | 200 |
| PASS | Proposals workflow | Teacher proposals pending filter | /teacher/proposals?status=pending | 200 |
| PASS | Auth/Profile/RBAC/Scope | Teacher scope denies unknown class detail | /teacher/classes/507f1f77bcf86cd799439098 | 403 |
| PASS | Auth/Profile/RBAC/Scope | Teacher scope denies unknown class students | /teacher/classes/507f1f77bcf86cd799439098/students | 403 |
| PASS | Auth/Profile/RBAC/Scope | Teacher assignments unknown class filter denied | /teacher/assignments?class_id=507f1f77bcf86cd799439098 | 404 |
| PASS | Runtime health | Teacher class detail own class | /teacher/classes/69fc002c9f998e8ddff6b32a | 200 |
| PASS | Dashboard/Classes/Students | Teacher class students own class | /teacher/classes/69fc002c9f998e8ddff6b32a/students | 200 |
| PASS | Gradebook workflow | Teacher class gradebook own class before grading | /teacher/classes/69fc002c9f998e8ddff6b32a/gradebook | 200 |
| PASS | Dashboard/Classes/Students | Teacher gradebook summary all classes | /teacher/gradebook | 200 |
| PASS | Auth/Profile/RBAC/Scope | Teacher create assignment marker | /teacher/assignments | 201 |
| PASS | Auth/Profile/RBAC/Scope | Detail assignment marker via class_id list | /teacher/assignments?class_id=69fc002c9f998e8ddff6b32a | 200 |
| PASS | Auth/Profile/RBAC/Scope | Detail assignment marker present in filtered list |  | 69fc4f8c7fbeaddc1886c06a |
| WARN | Auth/Profile/RBAC/Scope | Detail assignment direct endpoint contract check | /teacher/assignments/69fc4f8c7fbeaddc1886c06a | Direct detail endpoint chưa được expose; detail xác minh qua filtered list |
| PASS | Auth/Profile/RBAC/Scope | Teacher update assignment marker | /teacher/assignments/69fc4f8c7fbeaddc1886c06a | 200 |
| PASS | Auth/Profile/RBAC/Scope | Teacher assignment submissions before grading | /teacher/assignments/69fc4f8c7fbeaddc1886c06a/submissions | 200 |
| PASS | Auth/Profile/RBAC/Scope | Teacher assignment submissions after seed | /teacher/assignments/69fc4f8c7fbeaddc1886c06a/submissions | 200 |
| SKIP | Assignment workflow | Teacher grade submission marker |  | Không có student/submission để chấm trong class seed |
| PASS | Auth/Profile/RBAC/Scope | Teacher assignment submissions unknown assignment denied | /teacher/assignments/507f1f77bcf86cd799439097/submissions | 403 |
| PASS | Auth/Profile/RBAC/Scope | Teacher delete assignment cleanup marker | /teacher/assignments/69fc4f8c7fbeaddc1886c06a | 200 |
| PASS | Proposals workflow | Teacher create class proposal marker | /teacher/classes | 201 |
| PASS | Proposals workflow | Teacher create add-student proposal marker | /teacher/classes/69fc002c9f998e8ddff6b32a/students | 201 |
| PASS | Auth/Profile/RBAC/Scope | Teacher gradebook unknown class denied | /teacher/classes/507f1f77bcf86cd799439098/gradebook | 403 |
| PASS | Auth/Profile/RBAC/Scope | Teacher gradebook unknown student denied/empty | /teacher/gradebook?student_id=507f1f77bcf86cd799439099 | 403 |
| PASS | Content-library workflow | Content library teacher curriculum templates list | /content-library/curriculum-templates?limit=20 | 200 |
| PASS | Content-library workflow | Content library teacher lesson templates list | /content-library/lesson-templates?limit=20 | 200 |
| PASS | Content-library workflow | Content library teacher own draft curriculum list | /content-library/curriculum-templates?own=true&status=draft&limit=20 | 200 |
| PASS | Content-library workflow | Content library teacher own draft lesson list | /content-library/lesson-templates?own=true&status=draft&limit=20 | 200 |
| PASS | Content-library workflow | Content library seeded curriculum detail teacher | /content-library/curriculum-templates/69fc0a0fea7bd7fefb462d5e | 200 |
| PASS | Content-library workflow | Content library seeded lesson detail teacher | /content-library/lesson-templates/69fc0a0fea7bd7fefb462d60 | 200 |
| PASS | Auth/Profile/RBAC/Scope | Content library seeded assignment detail teacher/admin scoped | /content-library/assignments/69fc0a0fea7bd7fefb462d63 | 200 |
| PASS | Content-library workflow | Content library teacher update lesson template permission/rule | /content-library/lesson-templates/69fc0a0fea7bd7fefb462d60 | Đúng rule: published/non-owner template bị chặn sửa trực tiếp |
| PASS | Content-library workflow | Content library teacher request publish lesson dependency | /content-library/lesson-templates/69fc0a0fea7bd7fefb462d60/request-publish | Proposal/request publish tạo thành công |
| PASS | Auth/Profile/RBAC/Scope | Content assignment create marker teacher | /content-library/assignments | 201 |
| PASS | Auth/Profile/RBAC/Scope | Content assignments list teacher | /content-library/assignments?limit=20 | 200 |
| PASS | Auth/Profile/RBAC/Scope | Content assignment detail marker teacher | /content-library/assignments/69fc4f937fbeaddc1886c0b0 | 200 |
| PASS | Auth/Profile/RBAC/Scope | Content assignment update marker teacher | /content-library/assignments/69fc4f937fbeaddc1886c0b0 | 200 |
| PASS | Auth/Profile/RBAC/Scope | Content assignment pause marker teacher | /content-library/assignments/69fc4f937fbeaddc1886c0b0/pause | 200 |
| PASS | Auth/Profile/RBAC/Scope | Content assignment activate marker teacher | /content-library/assignments/69fc4f937fbeaddc1886c0b0/activate | 200 |
| PASS | Auth/Profile/RBAC/Scope | Content assignment archive cleanup marker teacher | /content-library/assignments/69fc4f937fbeaddc1886c0b0 | 200 |
| PASS | Auth/Profile/RBAC/Scope | Content library student forbidden assignments | /content-library/assignments | 403 |
| PASS | Auth/Profile/RBAC/Scope | Content library teacher unknown target assignment denied | /content-library/assignments | 404 |
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
| PASS | Assignment workflow | Cleanup direct DB gradebook/submission markers |  |  |

## Artifacts