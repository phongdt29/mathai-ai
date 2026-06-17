# Dynamic page audit 2026-05-07T03:06:39.625Z

Frontend: http://localhost:3444
Backend: http://localhost:3001
Phase: before

| Route | Role | Pass | Status | Source | Issues | Screenshot |
|---|---|---:|---:|---|---|---|
| /admin/classes/69fc002c9f998e8ddff6b32a | admin | FAIL | 200 | user-provided class id verified by /api/admin/classes/:id | pageerror=1 | test-screenshots/page-audit-dynamic/before/01-admin-admin__classes__69fc002c9f998e8ddff6b32a.png |
| /admin/content-library/curricula/new | admin | PASS | 200 | static new route |  | test-screenshots/page-audit-dynamic/before/02-admin-admin__content-library__curricula__new.png |
| /admin/content-library/curricula/:id | admin | SKIP |  | empty /api/content-library/curriculum-templates | skip=Không có ID thật từ API/list page để audit detail route. |  |
| /admin/content-library/lessons/new | admin | PASS | 200 | static new route |  | test-screenshots/page-audit-dynamic/before/04-admin-admin__content-library__lessons__new.png |
| /admin/content-library/lessons/:id | admin | SKIP |  | empty /api/content-library/lesson-templates | skip=Không có ID thật từ API/list page để audit detail route. |  |
| /admin/content-library/lessons/:id/edit | admin | SKIP |  | empty /api/content-library/lesson-templates | skip=Không có ID thật từ API/list page để audit detail route. |  |
| /admin/content-library/lessons/:id/stats | admin | SKIP |  | empty /api/content-library/lesson-templates | skip=Không có ID thật từ API/list page để audit detail route. |  |
| /admin/assignments/:id | admin | SKIP |  | empty /api/content-library/assignments | skip=Không có ID thật từ API/list page để audit detail route. |  |
| /admin/assignments/:id/edit | admin | SKIP |  | empty /api/content-library/assignments | skip=Không có ID thật từ API/list page để audit detail route. |  |
| /admin/assignments/:id/stats | admin | SKIP |  | empty /api/content-library/assignments | skip=Không có ID thật từ API/list page để audit detail route. |  |
| /teacher/content-library/curricula/new | teacher | PASS | 200 | static new route |  | test-screenshots/page-audit-dynamic/before/11-teacher-teacher__content-library__curricula__new.png |
| /teacher/content-library/curricula/:id | teacher | SKIP |  | empty teacher /api/content-library/curriculum-templates | skip=Không có ID thật từ API/list page để audit detail route. |  |
| /teacher/content-library/lessons/new | teacher | PASS | 200 | static new route |  | test-screenshots/page-audit-dynamic/before/13-teacher-teacher__content-library__lessons__new.png |
| /teacher/content-library/lessons/:id | teacher | SKIP |  | empty teacher /api/content-library/lesson-templates | skip=Không có ID thật từ API/list page để audit detail route. |  |
| /teacher/content-library/lessons/:id/edit | teacher | SKIP |  | empty teacher /api/content-library/lesson-templates | skip=Không có ID thật từ API/list page để audit detail route. |  |
| /teacher/content-library/lessons/:id/stats | teacher | SKIP |  | empty teacher /api/content-library/lesson-templates | skip=Không có ID thật từ API/list page để audit detail route. |  |
| /teacher/content-library/assignments/:id | teacher | SKIP |  | empty teacher assignment APIs | skip=Không có ID thật từ API/list page để audit detail route. |  |
| /teacher/content-library/assignments/:id/edit | teacher | SKIP |  | empty teacher assignment APIs | skip=Không có ID thật từ API/list page để audit detail route. |  |
| /teacher/content-library/assignments/:id/stats | teacher | SKIP |  | empty teacher assignment APIs | skip=Không có ID thật từ API/list page để audit detail route. |  |
| /dashboard/lessons/69fbf565ea7bd7fefb462d30 | student | PASS | 200 | first id from /api/lessons |  | test-screenshots/page-audit-dynamic/before/20-student-dashboard__lessons__69fbf565ea7bd7fefb462d30.png |
| /dashboard/lessons/69fbf565ea7bd7fefb462d30/content/1 | student | PASS | 200 | same student lesson id, first content item |  | test-screenshots/page-audit-dynamic/before/21-student-dashboard__lessons__69fbf565ea7bd7fefb462d30__content__1.png |
| /dashboard/lessons/69fbf565ea7bd7fefb462d30/content/check | student | PASS | 200 | same student lesson id |  | test-screenshots/page-audit-dynamic/before/22-student-dashboard__lessons__69fbf565ea7bd7fefb462d30__content__check.png |
