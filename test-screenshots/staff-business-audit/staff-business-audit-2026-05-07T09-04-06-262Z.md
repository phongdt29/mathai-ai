# Staff business audit 2026-05-07T09:04:06.262Z

- Backend: http://localhost:3001
- Frontend: http://localhost:3444
- Staff user: staff@mathai.vn (staff)
- Counts: {"PASS":16,"FAIL":11,"SKIP":3,"WARN":1}
- JSON: test-screenshots\staff-business-audit\staff-business-audit-2026-05-07T09-04-06-262Z.json
- Screenshots: none

| Result | Workflow | Method | URL | Status | Expected | Note |
|---|---|---:|---|---:|---|---|
| PASS | Backend health | GET | /health | 200 | 2xx | Runtime backend phải sống trước audit |
| PASS | Login staff@mathai.vn | POST | /api/auth/login | 200 | 2xx | Đăng nhập thành công |
| PASS | Login admin@mathai.vn | POST | /api/auth/login | 200 | 2xx | Đăng nhập thành công |
| PASS | Staff /auth/me | GET | /api/auth/me | 200 | 2xx | Xác minh token và role staff |
| FAIL | Staff list users | GET | /api/admin/users?role=all | 403 | 2xx | Nhân viên được xem danh sách người dùng để chăm sóc/vận hành |
| FAIL | Staff list teachers | GET | /api/admin/teachers | 403 | 2xx | Nhân viên xem giáo viên và thống kê vận hành |
| FAIL | Staff list teacher dropdown | GET | /api/admin/teachers-list | 403 | 2xx | Nhân viên lấy danh sách giáo viên active cho lớp |
| FAIL | Staff list student dropdown | GET | /api/admin/students-list | 403 | 2xx | Nhân viên lấy danh sách học viên cho lớp |
| FAIL | Staff list classes | GET | /api/admin/classes | 403 | 2xx | Nhân viên xem/quản lý lớp/lịch |
| SKIP | Staff get teacher detail |  |  |  |  | Không có giáo viên mẫu |
| SKIP | Staff class detail/attendance workflows |  |  |  |  | Không có lớp mẫu |
| FAIL | Staff dashboard stats | GET | /api/admin/stats | 403 | 2xx | Nhân viên xem tổng quan vận hành |
| FAIL | Staff activity | GET | /api/admin/activity | 403 | 2xx | Nhân viên xem hoạt động gần đây |
| FAIL | Staff content overview | GET | /api/admin/content | 403 | 2xx | Nhân viên xem nội dung/hồ sơ học tập |
| FAIL | Staff reports | GET | /api/admin/reports | 403 | 2xx | Nhân viên xem báo cáo vận hành |
| FAIL | Staff AI logs read | GET | /api/admin/ai-logs?limit=5 | 403 | 2xx | Nhân viên xem log AI mức vận hành |
| FAIL | Staff AI tutors read | GET | /api/admin/ai-tutors | 403 | 2xx | Nhân viên xem tutor nhưng không cấu hình |
| PASS | Admin AI tutors read for sample | GET | /api/admin/ai-tutors | 200 | 2xx | Lấy sample để test staff restriction |
| PASS | Staff cannot toggle user | PUT | /api/admin/users/000000000000000000000001/toggle | 403 | 403 | Nhân viên không được khóa/mở khóa người dùng |
| PASS | Staff cannot create teacher invited user | POST | /api/admin/teachers | 403 | 403 | Nhân viên không được thêm tài khoản giáo viên/người dùng mời |
| SKIP | Staff cannot toggle teacher |  |  |  |  | Không có giáo viên mẫu |
| PASS | Staff cannot approve proposals | PUT | /api/admin/proposals/000000000000000000000001/approve | 403 | 403 | Nhân viên không được duyệt đề xuất cấp admin |
| PASS | Staff cannot create AI content approval | POST | /api/admin/proposals/ai-content | 403 | 403 | Nhân viên không được tạo luồng quản trị AI cấp cao |
| PASS | Staff cannot view AI governance summary | GET | /api/admin/ai-governance/summary | 403 | 403 | Nhân viên bị chặn AI governance |
| PASS | Staff cannot update AI settings | POST | /api/chat/settings | 403 | 403 | Nhân viên không được cấu hình AI lõi |
| PASS | Staff cannot view AI settings | GET | /api/chat/settings | 403 | 403 | Nhân viên không được xem cấu hình AI lõi |
| PASS | Staff cannot toggle AI tutor | PUT | /api/admin/ai-tutors/69e7093f29356dae6ae669a7/toggle | 403 | 403 | Nhân viên không được bật/tắt AI tutor |
| PASS | Staff blocked from student self dashboard | GET | /api/students/profile | 403 | 403 | Staff không bị nhầm thành student |
| PASS | Staff blocked from teacher self dashboard | GET | /api/teacher/dashboard | 403 | 403 | Staff không bị nhầm thành teacher |
| PASS | Staff blocked from parent self dashboard | GET | /api/parent/children | 403 | 403 | Staff không bị nhầm thành parent |
| WARN | Puppeteer staff UI |  |  |  |  | Không chạy được Puppeteer UI: Cannot find module 'puppeteer'
Require stack:
- d:\GitHub\mathai\scripts\.tmp-staff-business-audit.cjs |