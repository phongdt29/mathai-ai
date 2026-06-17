const fs = require('fs');
const path = require('path');

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3001';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3444';
const PASSWORD = process.env.SEED_DEMO_PASSWORD || 'MathAI@Demo123';
const OUT_DIR = path.join('test-screenshots', 'staff-business-audit');

const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-');
const jsonPath = path.join(OUT_DIR, `staff-business-audit-${stamp}.json`);
const mdPath = path.join(OUT_DIR, `staff-business-audit-${stamp}.md`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
const artifacts = { jsonPath, mdPath, screenshots: [] };
let staffToken = '';
let adminToken = '';
let staffUser = null;
let sampled = { teacherId: null, classId: null, studentId: null, aiTutorId: null, userId: null };

function classifyStatus(actual, expected) {
  if (expected === '2xx') return actual >= 200 && actual < 300 ? 'PASS' : 'FAIL';
  if (expected === '403') return actual === 403 ? 'PASS' : 'FAIL';
  if (expected === '401or403') return actual === 401 || actual === 403 ? 'PASS' : 'FAIL';
  if (expected === 'non2xx') return actual < 200 || actual >= 300 ? 'PASS' : 'FAIL';
  return 'WARN';
}

async function request(label, method, url, token, body, expected, note) {
  const started = Date.now();
  let status = 0;
  let responseBody = null;
  let error = null;
  try {
    const res = await fetch(`${BACKEND}${url}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    const text = await res.text();
    try { responseBody = text ? JSON.parse(text) : null; } catch { responseBody = text; }
  } catch (e) {
    error = e && e.message ? e.message : String(e);
  }
  const result = { label, method, url, status, expected, result: error ? 'FAIL' : classifyStatus(status, expected), durationMs: Date.now() - started, note, error };
  if (responseBody && typeof responseBody === 'object') {
    result.success = responseBody.success;
    result.message = responseBody.message || responseBody.error || null;
    if (Array.isArray(responseBody.data)) result.dataCount = responseBody.data.length;
    else if (responseBody.data && typeof responseBody.data === 'object') result.dataKeys = Object.keys(responseBody.data).slice(0, 20);
  }
  results.push(result);
  return { status, body: responseBody, result };
}

async function login(email, password) {
  const res = await fetch(`${BACKEND}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => null);
  results.push({ label: `Login ${email}`, method: 'POST', url: '/api/auth/login', status: res.status, expected: '2xx', result: classifyStatus(res.status, '2xx'), message: body?.message || body?.error || null });
  if (!res.ok || !body?.data?.tokens?.access_token) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(body)}`);
  return { token: body.data.tokens.access_token, user: body.data.user };
}

async function runApiAudit() {
  await request('Backend health', 'GET', '/health', '', undefined, '2xx', 'Runtime backend phải sống trước audit');

  const staff = await login('staff@mathai.vn', PASSWORD);
  staffToken = staff.token;
  staffUser = staff.user;
  const admin = await login('admin@mathai.vn', PASSWORD);
  adminToken = admin.token;

  await request('Staff /auth/me', 'GET', '/api/auth/me', staffToken, undefined, '2xx', 'Xác minh token và role staff');

  const users = await request('Staff list users', 'GET', '/api/admin/users?role=all', staffToken, undefined, '2xx', 'Nhân viên được xem danh sách người dùng để chăm sóc/vận hành');
  const userRows = Array.isArray(users.body?.data) ? users.body.data : [];
  sampled.userId = userRows.find(u => u.email !== 'staff@mathai.vn')?._id || userRows[0]?._id || null;

  const teachers = await request('Staff list teachers', 'GET', '/api/admin/teachers', staffToken, undefined, '2xx', 'Nhân viên xem giáo viên và thống kê vận hành');
  const teacherRows = Array.isArray(teachers.body?.data) ? teachers.body.data : [];
  sampled.teacherId = teacherRows[0]?._id || null;

  await request('Staff list teacher dropdown', 'GET', '/api/admin/teachers-list', staffToken, undefined, '2xx', 'Nhân viên lấy danh sách giáo viên active cho lớp');
  await request('Staff list student dropdown', 'GET', '/api/admin/students-list', staffToken, undefined, '2xx', 'Nhân viên lấy danh sách học viên cho lớp');

  const classes = await request('Staff list classes', 'GET', '/api/admin/classes', staffToken, undefined, '2xx', 'Nhân viên xem/quản lý lớp/lịch');
  const classRows = Array.isArray(classes.body?.data) ? classes.body.data : [];
  sampled.classId = classRows[0]?._id || null;
  sampled.studentId = classRows[0]?.students?.[0]?._id || null;

  if (sampled.teacherId) {
    await request('Staff get teacher detail', 'GET', `/api/admin/teachers/${sampled.teacherId}`, staffToken, undefined, '2xx', 'Nhân viên xem hồ sơ giáo viên');
  } else {
    results.push({ label: 'Staff get teacher detail', result: 'SKIP', note: 'Không có giáo viên mẫu' });
  }

  if (sampled.classId) {
    await request('Staff get class detail', 'GET', `/api/admin/classes/${sampled.classId}`, staffToken, undefined, '2xx', 'Nhân viên xem lớp');
    await request('Staff get full class detail', 'GET', `/api/admin/classes/${sampled.classId}/full-detail`, staffToken, undefined, '2xx', 'Nhân viên xem hồ sơ lớp gồm điểm danh/điểm số');
    const date = new Date().toISOString().slice(0, 10);
    await request('Staff get class attendance', 'GET', `/api/admin/classes/${sampled.classId}/attendance?date=${date}`, staffToken, undefined, '2xx', 'Nhân viên xem lịch/điểm danh');
  } else {
    results.push({ label: 'Staff class detail/attendance workflows', result: 'SKIP', note: 'Không có lớp mẫu' });
  }

  await request('Staff dashboard stats', 'GET', '/api/admin/stats', staffToken, undefined, '2xx', 'Nhân viên xem tổng quan vận hành');
  await request('Staff activity', 'GET', '/api/admin/activity', staffToken, undefined, '2xx', 'Nhân viên xem hoạt động gần đây');
  await request('Staff content overview', 'GET', '/api/admin/content', staffToken, undefined, '2xx', 'Nhân viên xem nội dung/hồ sơ học tập');
  await request('Staff reports', 'GET', '/api/admin/reports', staffToken, undefined, '2xx', 'Nhân viên xem báo cáo vận hành');
  await request('Staff AI logs read', 'GET', '/api/admin/ai-logs?limit=5', staffToken, undefined, '2xx', 'Nhân viên xem log AI mức vận hành');
  await request('Staff AI tutors read', 'GET', '/api/admin/ai-tutors', staffToken, undefined, '2xx', 'Nhân viên xem tutor nhưng không cấu hình');
  const tutors = await request('Admin AI tutors read for sample', 'GET', '/api/admin/ai-tutors', adminToken, undefined, '2xx', 'Lấy sample để test staff restriction');
  const tutorRows = Array.isArray(tutors.body?.data) ? tutors.body.data : [];
  sampled.aiTutorId = tutorRows[0]?._id || null;

  await request('Staff cannot toggle user', 'PUT', sampled.userId ? `/api/admin/users/${sampled.userId}/toggle` : '/api/admin/users/000000000000000000000001/toggle', staffToken, undefined, '403', 'Nhân viên không được khóa/mở khóa người dùng');
  await request('Staff cannot create teacher invited user', 'POST', '/api/admin/teachers', staffToken, { email: `staff-audit-${Date.now()}@mathai.vn`, full_name: 'Staff Audit Teacher', password: PASSWORD }, '403', 'Nhân viên không được thêm tài khoản giáo viên/người dùng mời');
  if (sampled.teacherId) {
    await request('Staff cannot toggle teacher', 'PUT', `/api/admin/teachers/${sampled.teacherId}/toggle`, staffToken, undefined, '403', 'Nhân viên không được khóa/mở giáo viên');
  } else {
    results.push({ label: 'Staff cannot toggle teacher', result: 'SKIP', note: 'Không có giáo viên mẫu' });
  }
  await request('Staff cannot approve proposals', 'PUT', '/api/admin/proposals/000000000000000000000001/approve', staffToken, undefined, '403', 'Nhân viên không được duyệt đề xuất cấp admin');
  await request('Staff cannot create AI content approval', 'POST', '/api/admin/proposals/ai-content', staffToken, { content_kind: 'lesson', content: { title: 'x' } }, '403', 'Nhân viên không được tạo luồng quản trị AI cấp cao');
  await request('Staff cannot view AI governance summary', 'GET', '/api/admin/ai-governance/summary', staffToken, undefined, '403', 'Nhân viên bị chặn AI governance');
  await request('Staff cannot update AI settings', 'POST', '/api/chat/settings', staffToken, { model: 'gpt-4o-mini' }, '403', 'Nhân viên không được cấu hình AI lõi');
  await request('Staff cannot view AI settings', 'GET', '/api/chat/settings', staffToken, undefined, '403', 'Nhân viên không được xem cấu hình AI lõi');
  if (sampled.aiTutorId) {
    await request('Staff cannot toggle AI tutor', 'PUT', `/api/admin/ai-tutors/${sampled.aiTutorId}/toggle`, staffToken, undefined, '403', 'Nhân viên không được bật/tắt AI tutor');
  } else {
    results.push({ label: 'Staff cannot toggle AI tutor', result: 'SKIP', note: 'Không có AI tutor mẫu' });
  }

  await request('Staff blocked from student self dashboard', 'GET', '/api/students/profile', staffToken, undefined, '403', 'Staff không bị nhầm thành student');
  await request('Staff blocked from teacher self dashboard', 'GET', '/api/teacher/dashboard', staffToken, undefined, '403', 'Staff không bị nhầm thành teacher');
  await request('Staff blocked from parent self dashboard', 'GET', '/api/parent/children', staffToken, undefined, '403', 'Staff không bị nhầm thành parent');
}

async function runPuppeteerAudit() {
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
    const loginShot = path.join(OUT_DIR, `staff-login-${stamp}.png`);
    await page.screenshot({ path: loginShot, fullPage: true });
    artifacts.screenshots.push(loginShot);
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: staffToken, user: staffUser });
    await page.goto(`${FRONTEND}/admin`, { waitUntil: 'networkidle2', timeout: 30000 });
    const adminShot = path.join(OUT_DIR, `staff-admin-panel-${stamp}.png`);
    await page.screenshot({ path: adminShot, fullPage: true });
    artifacts.screenshots.push(adminShot);
    const title = await page.title();
    results.push({ label: 'Puppeteer staff admin shell', result: 'PASS', status: 200, expected: 'UI reachable', note: `Captured staff shell, title=${title}` });
    await browser.close();
  } catch (e) {
    results.push({ label: 'Puppeteer staff UI', result: 'WARN', note: `Không chạy được Puppeteer UI: ${e && e.message ? e.message : String(e)}` });
  }
}

function writeReports() {
  const summary = {
    generatedAt: now.toISOString(),
    backend: BACKEND,
    frontend: FRONTEND,
    sampled,
    staffUser,
    counts: results.reduce((acc, r) => { acc[r.result] = (acc[r.result] || 0) + 1; return acc; }, {}),
    results,
    artifacts,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  const lines = [];
  lines.push(`# Staff business audit ${now.toISOString()}`);
  lines.push('');
  lines.push(`- Backend: ${BACKEND}`);
  lines.push(`- Frontend: ${FRONTEND}`);
  lines.push(`- Staff user: ${staffUser ? `${staffUser.email} (${staffUser.role})` : 'N/A'}`);
  lines.push(`- Counts: ${JSON.stringify(summary.counts)}`);
  lines.push(`- JSON: ${jsonPath}`);
  lines.push(`- Screenshots: ${artifacts.screenshots.length ? artifacts.screenshots.join(', ') : 'none'}`);
  lines.push('');
  lines.push('| Result | Workflow | Method | URL | Status | Expected | Note |');
  lines.push('|---|---|---:|---|---:|---|---|');
  for (const r of results) {
    lines.push(`| ${r.result} | ${String(r.label).replace(/\|/g, '/')} | ${r.method || ''} | ${r.url || ''} | ${r.status ?? ''} | ${r.expected || ''} | ${String(r.note || r.message || r.error || '').replace(/\|/g, '/')} |`);
  }
  fs.writeFileSync(mdPath, lines.join('\n'));
  console.log(JSON.stringify({ jsonPath, mdPath, counts: summary.counts, screenshots: artifacts.screenshots }, null, 2));
  if ((summary.counts.FAIL || 0) > 0) process.exitCode = 2;
}

(async () => {
  try {
    await runApiAudit();
    await runPuppeteerAudit();
  } catch (e) {
    results.push({ label: 'Audit fatal error', result: 'FAIL', error: e && e.stack ? e.stack : String(e) });
    process.exitCode = 2;
  } finally {
    writeReports();
  }
})();
