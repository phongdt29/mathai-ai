# Page audit 2026-05-07T02:49:21.080Z

Frontend: http://localhost:3444
Backend: http://localhost:3001

| Route | Role | Pass | Status | Final URL | Issues | Screenshot |
|---|---|---:|---:|---|---|---|
| / | public | PASS | 200 | http://localhost:3444/ |  | test-screenshots/page-audit/before/01-public-home.png |
| /login | public | PASS | 200 | http://localhost:3444/login |  | test-screenshots/page-audit/before/02-public-login.png |
| /register | public | PASS | 200 | http://localhost:3444/register |  | test-screenshots/page-audit/before/03-public-register.png |
| /forgot-password | public | PASS | 200 | http://localhost:3444/forgot-password |  | test-screenshots/page-audit/before/04-public-forgot-password.png |
| /dashboard | student | PASS | 200 | http://localhost:3444/dashboard |  | test-screenshots/page-audit/before/05-student-dashboard.png |
| /dashboard/lessons | student | FAIL | 200 | http://localhost:3444/dashboard/lessons | network=404 /api/curriculum/active; 404 /api/curriculum/active<br>console=2<br>ui=Network error Network error | test-screenshots/page-audit/before/06-student-dashboard__lessons.png |
| /dashboard/progress | student | PASS | 200 | http://localhost:3444/dashboard/progress |  | test-screenshots/page-audit/before/07-student-dashboard__progress.png |
| /dashboard/points | student | PASS | 200 | http://localhost:3444/dashboard/points |  | test-screenshots/page-audit/before/08-student-dashboard__points.png |
| /dashboard/solver | student | PASS | 200 | http://localhost:3444/dashboard/solver |  | test-screenshots/page-audit/before/09-student-dashboard__solver.png |
| /parent | parent | PASS | 200 | http://localhost:3444/parent |  | test-screenshots/page-audit/before/10-parent-parent.png |
| /parent/children | parent | PASS | 200 | http://localhost:3444/parent/children |  | test-screenshots/page-audit/before/11-parent-parent__children.png |
| /parent/reports | parent | PASS | 200 | http://localhost:3444/parent/reports |  | test-screenshots/page-audit/before/12-parent-parent__reports.png |
| /parent/notifications | parent | PASS | 200 | http://localhost:3444/parent/notifications |  | test-screenshots/page-audit/before/13-parent-parent__notifications.png |
| /teacher | teacher | PASS | 200 | http://localhost:3444/teacher |  | test-screenshots/page-audit/before/14-teacher-teacher.png |
| /teacher/classes | teacher | PASS | 200 | http://localhost:3444/teacher/classes |  | test-screenshots/page-audit/before/15-teacher-teacher__classes.png |
| /teacher/students | teacher | PASS | 200 | http://localhost:3444/teacher/students |  | test-screenshots/page-audit/before/16-teacher-teacher__students.png |
| /teacher/content-library | teacher | PASS | 200 | http://localhost:3444/teacher/content-library |  | test-screenshots/page-audit/before/17-teacher-teacher__content-library.png |
| /teacher/content-library/curricula/new | teacher | PASS | 200 | http://localhost:3444/teacher/content-library/curricula/new |  | test-screenshots/page-audit/before/18-teacher-teacher__content-library__curricula__new.png |
| /teacher/content-library/lessons/new | teacher | PASS | 200 | http://localhost:3444/teacher/content-library/lessons/new |  | test-screenshots/page-audit/before/19-teacher-teacher__content-library__lessons__new.png |
| /teacher/assignments | teacher | PASS | 200 | http://localhost:3444/teacher/assignments |  | test-screenshots/page-audit/before/20-teacher-teacher__assignments.png |
| /admin | admin | FAIL | 200 | http://localhost:3444/admin | mojibake=â† áº Ä‘ á» Ã½ NgÆ dÃ GiÃ Ãª Lá» há» Ä Ná» ThÆ Ã¢ Ã­ | test-screenshots/page-audit/before/21-admin-admin.png |
| /admin/users | admin | FAIL | 200 | http://localhost:3444/admin/users | mojibake=â† áº Ä‘ á» Ã½ NgÆ dÃ GiÃ Ãª Lá» há» Ä Ná» ThÆ Ã¢ Ã­ | test-screenshots/page-audit/before/22-admin-admin__users.png |
| /admin/settings | admin | FAIL | 200 | http://localhost:3444/admin/settings | mojibake=â† áº Ä‘ á» Ã½ NgÆ dÃ GiÃ Ãª Lá» há» Ä Ná» ThÆ Ã¢ Ã­ | test-screenshots/page-audit/before/23-admin-admin__settings.png |
| /admin/tutors | admin | FAIL | 200 | http://localhost:3444/admin/tutors | mojibake=â† áº Ä‘ á» Ã½ NgÆ dÃ GiÃ Ãª Lá» há» Ä Ná» ThÆ Ã¢ Ã­ | test-screenshots/page-audit/before/24-admin-admin__tutors.png |
| /admin/classes | admin | FAIL | 200 | http://localhost:3444/admin/classes | mojibake=â† áº Ä‘ á» Ã½ NgÆ dÃ GiÃ Ãª Lá» há» Ä Ná» ThÆ Ã¢ Ã­ | test-screenshots/page-audit/before/25-admin-admin__classes.png |
| /admin/content-library | admin | FAIL | 200 | http://localhost:3444/admin/content-library | mojibake=â† áº Ä‘ á» Ã½ NgÆ dÃ GiÃ Ãª Lá» há» Ä Ná» ThÆ Ã¢ Ã­ | test-screenshots/page-audit/before/26-admin-admin__content-library.png |
| /admin/content-library/curricula/new | admin | FAIL | 200 | http://localhost:3444/admin/content-library/curricula/new | mojibake=â† áº Ä‘ á» Ã½ NgÆ dÃ GiÃ Ãª Lá» há» Ä Ná» ThÆ Ã¢ Ã­ | test-screenshots/page-audit/before/27-admin-admin__content-library__curricula__new.png |
| /admin/content-library/lessons/new | admin | FAIL | 200 | http://localhost:3444/admin/content-library/lessons/new | mojibake=â† áº Ä‘ á» Ã½ NgÆ dÃ GiÃ Ãª Lá» há» Ä Ná» ThÆ Ã¢ Ã­ | test-screenshots/page-audit/before/28-admin-admin__content-library__lessons__new.png |
