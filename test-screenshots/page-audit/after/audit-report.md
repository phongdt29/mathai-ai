# Page audit 2026-05-07T02:54:54.484Z

Frontend: http://localhost:3444
Backend: http://localhost:3001

| Route | Role | Pass | Status | Final URL | Issues | Screenshot |
|---|---|---:|---:|---|---|---|
| /dashboard/lessons | student | FAIL | 200 | http://localhost:3444/dashboard/lessons | network=404 /api/curriculum/active; 404 /api/curriculum/active<br>console=2<br>ui=Network error Network error | test-screenshots/page-audit/after/01-student-dashboard__lessons.png |
| /admin | admin | FAIL | 200 | http://localhost:3444/admin | mojibake=ÂN | test-screenshots/page-audit/after/02-admin-admin.png |
| /admin/users | admin | FAIL | 200 | http://localhost:3444/admin/users | mojibake=ÂN | test-screenshots/page-audit/after/03-admin-admin__users.png |
| /admin/settings | admin | FAIL | 200 | http://localhost:3444/admin/settings | mojibake=ÂN | test-screenshots/page-audit/after/04-admin-admin__settings.png |
| /admin/tutors | admin | FAIL | 200 | http://localhost:3444/admin/tutors | mojibake=ÂN | test-screenshots/page-audit/after/05-admin-admin__tutors.png |
| /admin/classes | admin | FAIL | 200 | http://localhost:3444/admin/classes | mojibake=ÂN | test-screenshots/page-audit/after/06-admin-admin__classes.png |
| /admin/content-library | admin | FAIL | 200 | http://localhost:3444/admin/content-library | mojibake=ÂN | test-screenshots/page-audit/after/07-admin-admin__content-library.png |
| /admin/content-library/curricula/new | admin | FAIL | 200 | http://localhost:3444/admin/content-library/curricula/new | mojibake=ÂN | test-screenshots/page-audit/after/08-admin-admin__content-library__curricula__new.png |
| /admin/content-library/lessons/new | admin | FAIL | 200 | http://localhost:3444/admin/content-library/lessons/new | mojibake=ÂN | test-screenshots/page-audit/after/09-admin-admin__content-library__lessons__new.png |
