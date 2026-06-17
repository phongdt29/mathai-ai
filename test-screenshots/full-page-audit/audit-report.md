# Full page audit 2026-05-07T05:50:39.691Z

Frontend: http://localhost:3444
Backend: http://localhost:3001
Backend health: 200
Frontend health: 200
Summary: total=53, pass=53, fail=0, skip=0

Discovered IDs: {"studentLessonId":"69fbf565ea7bd7fefb462d30","classId":"69fc002c9f998e8ddff6b32a","adminCurriculumId":"69fc0a0fea7bd7fefb462d5e","adminLessonId":"69fc0a0fea7bd7fefb462d60","adminAssignmentId":"69fc0a0fea7bd7fefb462d63","teacherCurriculumId":"69fc0a0fea7bd7fefb462d5e","teacherLessonId":"69fc0a0fea7bd7fefb462d60","teacherAssignmentId":"69fc0a0fea7bd7fefb462d63"}

| Route | Role | Result | Status | Final URL | Source | Issues | Screenshot |
|---|---|---:|---:|---|---|---|---|
| / | public | PASS | 200 | http://localhost:3444/ | static public/auth route |  | test-screenshots/full-page-audit/01-public-home.png |
| /login | public | PASS | 200 | http://localhost:3444/login | static public/auth route |  | test-screenshots/full-page-audit/02-public-login.png |
| /register | public | PASS | 200 | http://localhost:3444/register | static public/auth route |  | test-screenshots/full-page-audit/03-public-register.png |
| /forgot-password | public | PASS | 200 | http://localhost:3444/forgot-password | static public/auth route |  | test-screenshots/full-page-audit/04-public-forgot-password.png |
| /dashboard | student | PASS | 200 | http://localhost:3444/dashboard | static student route |  | test-screenshots/full-page-audit/05-student-dashboard.png |
| /dashboard/lessons | student | PASS | 200 | http://localhost:3444/dashboard/lessons | static student route |  | test-screenshots/full-page-audit/06-student-dashboard__lessons.png |
| /dashboard/progress | student | PASS | 200 | http://localhost:3444/dashboard/progress | static student route |  | test-screenshots/full-page-audit/07-student-dashboard__progress.png |
| /dashboard/points | student | PASS | 200 | http://localhost:3444/dashboard/points | static student route |  | test-screenshots/full-page-audit/08-student-dashboard__points.png |
| /dashboard/solver | student | PASS | 200 | http://localhost:3444/dashboard/solver | static student route |  | test-screenshots/full-page-audit/09-student-dashboard__solver.png |
| /dashboard/chat | student | PASS | 200 | http://localhost:3444/dashboard/chat | static student route |  | test-screenshots/full-page-audit/10-student-dashboard__chat.png |
| /dashboard/curriculum | student | PASS | 200 | http://localhost:3444/dashboard/curriculum | static student route |  | test-screenshots/full-page-audit/11-student-dashboard__curriculum.png |
| /dashboard/settings | student | PASS | 200 | http://localhost:3444/dashboard/settings | static student route |  | test-screenshots/full-page-audit/12-student-dashboard__settings.png |
| /dashboard/lessons/69fbf565ea7bd7fefb462d30 | student | PASS | 200 | http://localhost:3444/dashboard/lessons/69fbf565ea7bd7fefb462d30 | first id from /api/lessons |  | test-screenshots/full-page-audit/13-student-dashboard__lessons__69fbf565ea7bd7fefb462d30.png |
| /dashboard/lessons/69fbf565ea7bd7fefb462d30/content/1 | student | PASS | 200 | http://localhost:3444/dashboard/lessons/69fbf565ea7bd7fefb462d30/content/1 | first id from /api/lessons plus content item 1 |  | test-screenshots/full-page-audit/14-student-dashboard__lessons__69fbf565ea7bd7fefb462d30__content__1.png |
| /dashboard/lessons/69fbf565ea7bd7fefb462d30/content/check | student | PASS | 200 | http://localhost:3444/dashboard/lessons/69fbf565ea7bd7fefb462d30/content/check | first id from /api/lessons plus content/check |  | test-screenshots/full-page-audit/15-student-dashboard__lessons__69fbf565ea7bd7fefb462d30__content__check.png |
| /parent | parent | PASS | 200 | http://localhost:3444/parent | static parent route |  | test-screenshots/full-page-audit/16-parent-parent.png |
| /parent/children | parent | PASS | 200 | http://localhost:3444/parent/children | static parent route |  | test-screenshots/full-page-audit/17-parent-parent__children.png |
| /parent/reports | parent | PASS | 200 | http://localhost:3444/parent/reports | static parent route |  | test-screenshots/full-page-audit/18-parent-parent__reports.png |
| /parent/notifications | parent | PASS | 200 | http://localhost:3444/parent/notifications | static parent route |  | test-screenshots/full-page-audit/19-parent-parent__notifications.png |
| /parent/settings | parent | PASS | 200 | http://localhost:3444/parent/settings | static parent route |  | test-screenshots/full-page-audit/20-parent-parent__settings.png |
| /teacher | teacher | PASS | 200 | http://localhost:3444/teacher | static teacher route |  | test-screenshots/full-page-audit/21-teacher-teacher.png |
| /teacher/classes | teacher | PASS | 200 | http://localhost:3444/teacher/classes | static teacher route |  | test-screenshots/full-page-audit/22-teacher-teacher__classes.png |
| /teacher/students | teacher | PASS | 200 | http://localhost:3444/teacher/students | static teacher route |  | test-screenshots/full-page-audit/23-teacher-teacher__students.png |
| /teacher/content-library | teacher | PASS | 200 | http://localhost:3444/teacher/content-library | static teacher route |  | test-screenshots/full-page-audit/24-teacher-teacher__content-library.png |
| /teacher/content-library/curricula/new | teacher | PASS | 200 | http://localhost:3444/teacher/content-library/curricula/new | static teacher route |  | test-screenshots/full-page-audit/25-teacher-teacher__content-library__curricula__new.png |
| /teacher/content-library/lessons/new | teacher | PASS | 200 | http://localhost:3444/teacher/content-library/lessons/new | static teacher route |  | test-screenshots/full-page-audit/26-teacher-teacher__content-library__lessons__new.png |
| /teacher/assignments | teacher | PASS | 200 | http://localhost:3444/teacher/assignments | static teacher route |  | test-screenshots/full-page-audit/27-teacher-teacher__assignments.png |
| /teacher/proposals | teacher | PASS | 200 | http://localhost:3444/teacher/proposals | static teacher route |  | test-screenshots/full-page-audit/28-teacher-teacher__proposals.png |
| /teacher/settings | teacher | PASS | 200 | http://localhost:3444/teacher/settings | static teacher route |  | test-screenshots/full-page-audit/29-teacher-teacher__settings.png |
| /teacher/content-library/curricula/69fc0a0fea7bd7fefb462d5e | teacher | PASS | 200 | http://localhost:3444/teacher/content-library/curricula/69fc0a0fea7bd7fefb462d5e | first id from teacher /api/content-library/curriculum-templates |  | test-screenshots/full-page-audit/30-teacher-teacher__content-library__curricula__69fc0a0fea7bd7fefb462d5e.png |
| /teacher/content-library/lessons/69fc0a0fea7bd7fefb462d60 | teacher | PASS | 200 | http://localhost:3444/teacher/content-library/lessons/69fc0a0fea7bd7fefb462d60 | first id from teacher /api/content-library/lesson-templates |  | test-screenshots/full-page-audit/31-teacher-teacher__content-library__lessons__69fc0a0fea7bd7fefb462d60.png |
| /teacher/content-library/lessons/69fc0a0fea7bd7fefb462d60/edit | teacher | PASS | 200 | http://localhost:3444/teacher/content-library/lessons/69fc0a0fea7bd7fefb462d60/edit | same lesson template id |  | test-screenshots/full-page-audit/32-teacher-teacher__content-library__lessons__69fc0a0fea7bd7fefb462d60__edit.png |
| /teacher/content-library/lessons/69fc0a0fea7bd7fefb462d60/stats | teacher | PASS | 200 | http://localhost:3444/teacher/content-library/lessons/69fc0a0fea7bd7fefb462d60/stats | same lesson template id |  | test-screenshots/full-page-audit/33-teacher-teacher__content-library__lessons__69fc0a0fea7bd7fefb462d60__stats.png |
| /teacher/content-library/assignments/69fc0a0fea7bd7fefb462d63 | teacher | PASS | 200 | http://localhost:3444/teacher/content-library/assignments/69fc0a0fea7bd7fefb462d63 | first id from teacher assignment APIs |  | test-screenshots/full-page-audit/34-teacher-teacher__content-library__assignments__69fc0a0fea7bd7fefb462d63.png |
| /teacher/content-library/assignments/69fc0a0fea7bd7fefb462d63/edit | teacher | PASS | 200 | http://localhost:3444/teacher/content-library/assignments/69fc0a0fea7bd7fefb462d63/edit | same assignment id |  | test-screenshots/full-page-audit/35-teacher-teacher__content-library__assignments__69fc0a0fea7bd7fefb462d63__edit.png |
| /teacher/content-library/assignments/69fc0a0fea7bd7fefb462d63/stats | teacher | PASS | 200 | http://localhost:3444/teacher/content-library/assignments/69fc0a0fea7bd7fefb462d63/stats | same assignment id |  | test-screenshots/full-page-audit/36-teacher-teacher__content-library__assignments__69fc0a0fea7bd7fefb462d63__stats.png |
| /admin | admin | PASS | 200 | http://localhost:3444/admin | static admin route |  | test-screenshots/full-page-audit/37-admin-admin.png |
| /admin/users | admin | PASS | 200 | http://localhost:3444/admin/users | static admin route |  | test-screenshots/full-page-audit/38-admin-admin__users.png |
| /admin/settings | admin | PASS | 200 | http://localhost:3444/admin/settings | static admin route |  | test-screenshots/full-page-audit/39-admin-admin__settings.png |
| /admin/tutors | admin | PASS | 200 | http://localhost:3444/admin/tutors | static admin route |  | test-screenshots/full-page-audit/40-admin-admin__tutors.png |
| /admin/classes | admin | PASS | 200 | http://localhost:3444/admin/classes | static admin route |  | test-screenshots/full-page-audit/41-admin-admin__classes.png |
| /admin/content-library | admin | PASS | 200 | http://localhost:3444/admin/content-library | static admin route |  | test-screenshots/full-page-audit/42-admin-admin__content-library.png |
| /admin/content-library/curricula/new | admin | PASS | 200 | http://localhost:3444/admin/content-library/curricula/new | static admin route |  | test-screenshots/full-page-audit/43-admin-admin__content-library__curricula__new.png |
| /admin/content-library/lessons/new | admin | PASS | 200 | http://localhost:3444/admin/content-library/lessons/new | static admin route |  | test-screenshots/full-page-audit/44-admin-admin__content-library__lessons__new.png |
| /admin/proposals | admin | PASS | 200 | http://localhost:3444/admin/proposals | static admin route |  | test-screenshots/full-page-audit/45-admin-admin__proposals.png |
| /admin/classes/69fc002c9f998e8ddff6b32a | admin | PASS | 200 | http://localhost:3444/admin/classes/69fc002c9f998e8ddff6b32a | first class id from /api/admin/classes or /api/teacher/classes |  | test-screenshots/full-page-audit/46-admin-admin__classes__69fc002c9f998e8ddff6b32a.png |
| /admin/content-library/curricula/69fc0a0fea7bd7fefb462d5e | admin | PASS | 200 | http://localhost:3444/admin/content-library/curricula/69fc0a0fea7bd7fefb462d5e | first id from admin /api/content-library/curriculum-templates |  | test-screenshots/full-page-audit/47-admin-admin__content-library__curricula__69fc0a0fea7bd7fefb462d5e.png |
| /admin/content-library/lessons/69fc0a0fea7bd7fefb462d60 | admin | PASS | 200 | http://localhost:3444/admin/content-library/lessons/69fc0a0fea7bd7fefb462d60 | first id from admin /api/content-library/lesson-templates |  | test-screenshots/full-page-audit/48-admin-admin__content-library__lessons__69fc0a0fea7bd7fefb462d60.png |
| /admin/content-library/lessons/69fc0a0fea7bd7fefb462d60/edit | admin | PASS | 200 | http://localhost:3444/admin/content-library/lessons/69fc0a0fea7bd7fefb462d60/edit | same lesson template id |  | test-screenshots/full-page-audit/49-admin-admin__content-library__lessons__69fc0a0fea7bd7fefb462d60__edit.png |
| /admin/content-library/lessons/69fc0a0fea7bd7fefb462d60/stats | admin | PASS | 200 | http://localhost:3444/admin/content-library/lessons/69fc0a0fea7bd7fefb462d60/stats | same lesson template id |  | test-screenshots/full-page-audit/50-admin-admin__content-library__lessons__69fc0a0fea7bd7fefb462d60__stats.png |
| /admin/assignments/69fc0a0fea7bd7fefb462d63 | admin | PASS | 200 | http://localhost:3444/admin/assignments/69fc0a0fea7bd7fefb462d63 | first id from admin /api/content-library/assignments |  | test-screenshots/full-page-audit/51-admin-admin__assignments__69fc0a0fea7bd7fefb462d63.png |
| /admin/assignments/69fc0a0fea7bd7fefb462d63/edit | admin | PASS | 200 | http://localhost:3444/admin/assignments/69fc0a0fea7bd7fefb462d63/edit | same assignment id |  | test-screenshots/full-page-audit/52-admin-admin__assignments__69fc0a0fea7bd7fefb462d63__edit.png |
| /admin/assignments/69fc0a0fea7bd7fefb462d63/stats | admin | PASS | 200 | http://localhost:3444/admin/assignments/69fc0a0fea7bd7fefb462d63/stats | same assignment id |  | test-screenshots/full-page-audit/53-admin-admin__assignments__69fc0a0fea7bd7fefb462d63__stats.png |
