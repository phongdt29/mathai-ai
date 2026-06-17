# Dynamic page audit 2026-05-07T03:51:55.873Z

Frontend: http://localhost:3444
Backend: http://localhost:3001
Phase: after-fix

| Route | Role | Pass | Status | Source | Issues | Screenshot |
|---|---|---:|---:|---|---|---|
| /admin/classes/69fc002c9f998e8ddff6b32a | admin | PASS | 200 | user-provided class id verified by /api/admin/classes/:id |  | test-screenshots/page-audit-dynamic-seeded/after-fix/01-admin-admin__classes__69fc002c9f998e8ddff6b32a.png |
| /admin/content-library/curricula/new | admin | PASS | 200 | static new route |  | test-screenshots/page-audit-dynamic-seeded/after-fix/02-admin-admin__content-library__curricula__new.png |
| /admin/content-library/curricula/69fc0a0fea7bd7fefb462d5e | admin | PASS | 200 | first id from /api/content-library/curriculum-templates |  | test-screenshots/page-audit-dynamic-seeded/after-fix/03-admin-admin__content-library__curricula__69fc0a0fea7bd7fefb462d5e.png |
| /admin/content-library/lessons/new | admin | PASS | 200 | static new route |  | test-screenshots/page-audit-dynamic-seeded/after-fix/04-admin-admin__content-library__lessons__new.png |
| /admin/content-library/lessons/69fc0a0fea7bd7fefb462d60 | admin | PASS | 200 | first id from /api/content-library/lesson-templates |  | test-screenshots/page-audit-dynamic-seeded/after-fix/05-admin-admin__content-library__lessons__69fc0a0fea7bd7fefb462d60.png |
| /admin/content-library/lessons/69fc0a0fea7bd7fefb462d60/edit | admin | PASS | 200 | same lesson template id |  | test-screenshots/page-audit-dynamic-seeded/after-fix/06-admin-admin__content-library__lessons__69fc0a0fea7bd7fefb462d60__edit.png |
| /admin/content-library/lessons/69fc0a0fea7bd7fefb462d60/stats | admin | PASS | 200 | same lesson template id |  | test-screenshots/page-audit-dynamic-seeded/after-fix/07-admin-admin__content-library__lessons__69fc0a0fea7bd7fefb462d60__stats.png |
| /admin/assignments/69fc0a0fea7bd7fefb462d63 | admin | PASS | 200 | first id from /api/content-library/assignments |  | test-screenshots/page-audit-dynamic-seeded/after-fix/08-admin-admin__assignments__69fc0a0fea7bd7fefb462d63.png |
| /admin/assignments/69fc0a0fea7bd7fefb462d63/edit | admin | PASS | 200 | same assignment id |  | test-screenshots/page-audit-dynamic-seeded/after-fix/09-admin-admin__assignments__69fc0a0fea7bd7fefb462d63__edit.png |
| /admin/assignments/69fc0a0fea7bd7fefb462d63/stats | admin | PASS | 200 | same assignment id |  | test-screenshots/page-audit-dynamic-seeded/after-fix/10-admin-admin__assignments__69fc0a0fea7bd7fefb462d63__stats.png |
| /teacher/content-library/curricula/new | teacher | PASS | 200 | static new route |  | test-screenshots/page-audit-dynamic-seeded/after-fix/11-teacher-teacher__content-library__curricula__new.png |
| /teacher/content-library/curricula/69fc0a0fea7bd7fefb462d5e | teacher | PASS | 200 | first id from teacher /api/content-library/curriculum-templates |  | test-screenshots/page-audit-dynamic-seeded/after-fix/12-teacher-teacher__content-library__curricula__69fc0a0fea7bd7fefb462d5e.png |
| /teacher/content-library/lessons/new | teacher | PASS | 200 | static new route |  | test-screenshots/page-audit-dynamic-seeded/after-fix/13-teacher-teacher__content-library__lessons__new.png |
| /teacher/content-library/lessons/69fc0a0fea7bd7fefb462d60 | teacher | PASS | 200 | first id from teacher /api/content-library/lesson-templates |  | test-screenshots/page-audit-dynamic-seeded/after-fix/14-teacher-teacher__content-library__lessons__69fc0a0fea7bd7fefb462d60.png |
| /teacher/content-library/lessons/69fc0a0fea7bd7fefb462d60/edit | teacher | PASS | 200 | same lesson template id |  | test-screenshots/page-audit-dynamic-seeded/after-fix/15-teacher-teacher__content-library__lessons__69fc0a0fea7bd7fefb462d60__edit.png |
| /teacher/content-library/lessons/69fc0a0fea7bd7fefb462d60/stats | teacher | PASS | 200 | same lesson template id |  | test-screenshots/page-audit-dynamic-seeded/after-fix/16-teacher-teacher__content-library__lessons__69fc0a0fea7bd7fefb462d60__stats.png |
| /teacher/content-library/assignments/69fc0a0fea7bd7fefb462d63 | teacher | PASS | 200 | first id from teacher assignment APIs |  | test-screenshots/page-audit-dynamic-seeded/after-fix/17-teacher-teacher__content-library__assignments__69fc0a0fea7bd7fefb462d63.png |
| /teacher/content-library/assignments/69fc0a0fea7bd7fefb462d63/edit | teacher | PASS | 200 | same assignment id |  | test-screenshots/page-audit-dynamic-seeded/after-fix/18-teacher-teacher__content-library__assignments__69fc0a0fea7bd7fefb462d63__edit.png |
| /teacher/content-library/assignments/69fc0a0fea7bd7fefb462d63/stats | teacher | PASS | 200 | same assignment id |  | test-screenshots/page-audit-dynamic-seeded/after-fix/19-teacher-teacher__content-library__assignments__69fc0a0fea7bd7fefb462d63__stats.png |
| /dashboard/lessons/69fbf565ea7bd7fefb462d30 | student | PASS | 200 | first id from /api/lessons |  | test-screenshots/page-audit-dynamic-seeded/after-fix/20-student-dashboard__lessons__69fbf565ea7bd7fefb462d30.png |
| /dashboard/lessons/69fbf565ea7bd7fefb462d30/content/1 | student | PASS | 200 | same student lesson id, first content item |  | test-screenshots/page-audit-dynamic-seeded/after-fix/21-student-dashboard__lessons__69fbf565ea7bd7fefb462d30__content__1.png |
| /dashboard/lessons/69fbf565ea7bd7fefb462d30/content/check | student | PASS | 200 | same student lesson id |  | test-screenshots/page-audit-dynamic-seeded/after-fix/22-student-dashboard__lessons__69fbf565ea7bd7fefb462d30__content__check.png |
