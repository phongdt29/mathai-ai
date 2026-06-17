# Staff business audit 2026-05-07T09:30:38.524Z

- Backend: http://localhost:3001
- Frontend: http://localhost:3444
- Staff user: staff@mathai.vn (staff)
- Counts: {"PASS":32,"WARN":1}
- JSON: test-screenshots\staff-business-audit\staff-business-audit-2026-05-07T09-30-38-524Z.json
- Screenshots: none

| Result | Workflow | Method | URL | Status | Expected | Note |
|---|---|---:|---|---:|---|---|
| PASS | Backend health | GET | /health | 200 | 2xx | Runtime backend phải sống trước audit |
| PASS | Login staff@mathai.vn | POST | /api/auth/login | 200 | 2xx | Đăng nhập thành công |
| PASS | Login admin@mathai.vn | POST | /api/auth/login | 200 | 2xx | Đăng nhập thành công |
| PASS | Staff /auth/me | GET | /api/auth/me | 200 | 2xx | Xác minh token và role staff |
| PASS | Staff list users | GET | /api/admin/users?role=all | 200 | 2xx | Nhân viên được xem danh sách người dùng để chăm sóc/vận hành |
| PASS | Staff list teachers | GET | /api/admin/teachers | 200 | 2xx | Nhân viên xem giáo viên và thống kê vận hành |
| PASS | Staff list teacher dropdown | GET | /api/admin/teachers-list | 200 | 2xx | Nhân viên lấy danh sách giáo viên active cho lớp |
| PASS | Staff list student dropdown | GET | /api/admin/students-list | 200 | 2xx | Nhân viên lấy danh sách học viên cho lớp |
| PASS | Staff list classes | GET | /api/admin/classes | 200 | 2xx | Nhân viên xem/quản lý lớp/lịch |
| PASS | Staff get teacher detail | GET | /api/admin/teachers/69e8f9ca8e6784e65b6455e2 | 200 | 2xx | Nhân viên xem hồ sơ giáo viên |
| PASS | Staff get class detail | GET | /api/admin/classes/69fc002c9f998e8ddff6b32a | 200 | 2xx | Nhân viên xem lớp |
| PASS | Staff get full class detail | GET | /api/admin/classes/69fc002c9f998e8ddff6b32a/full-detail | 200 | 2xx | Nhân viên xem hồ sơ lớp gồm điểm danh/điểm số |
| PASS | Staff get class attendance | GET | /api/admin/classes/69fc002c9f998e8ddff6b32a/attendance?date=2026-05-07 | 200 | 2xx | Nhân viên xem lịch/điểm danh |
| PASS | Staff dashboard stats | GET | /api/admin/stats | 200 | 2xx | Nhân viên xem tổng quan vận hành |
| PASS | Staff activity | GET | /api/admin/activity | 200 | 2xx | Nhân viên xem hoạt động gần đây |
| PASS | Staff content overview | GET | /api/admin/content | 200 | 2xx | Nhân viên xem nội dung/hồ sơ học tập |
| PASS | Staff reports | GET | /api/admin/reports | 200 | 2xx | Nhân viên xem báo cáo vận hành |
| PASS | Staff AI logs read | GET | /api/admin/ai-logs?limit=5 | 200 | 2xx | Nhân viên xem log AI mức vận hành |
| PASS | Staff AI tutors read | GET | /api/admin/ai-tutors | 200 | 2xx | Nhân viên xem tutor nhưng không cấu hình |
| PASS | Admin AI tutors read for sample | GET | /api/admin/ai-tutors | 200 | 2xx | Lấy sample để test staff restriction |
| PASS | Staff cannot toggle user | PUT | /api/admin/users/69f89cc5d5f250ae9b63af11/toggle | 403 | 403 | Nhân viên không được khóa/mở khóa người dùng |
| PASS | Staff cannot create teacher invited user | POST | /api/admin/teachers | 403 | 403 | Nhân viên không được thêm tài khoản giáo viên/người dùng mời |
| PASS | Staff cannot toggle teacher | PUT | /api/admin/teachers/69e8f9ca8e6784e65b6455e2/toggle | 403 | 403 | Nhân viên không được khóa/mở giáo viên |
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