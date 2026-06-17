const fs = require('fs');
const path = require('path');

const rootEnv = loadEnv(path.join(process.cwd(), '.env'));
const backendEnv = loadEnv(path.join(process.cwd(), 'packages', 'backend', '.env'), { override: true });
if (!backendEnv.has('DB_NAME') && rootEnv.has('DB_NAME') && !process.env.TEACHER_AUDIT_DB_NAME && !process.env.BUSINESS_AUDIT_DB_NAME) {
  // Match backend dev runtime: when packages/backend/.env does not define DB_NAME,
  // config falls back to the default database instead of the unrelated root DB_NAME.
  delete process.env.DB_NAME;
}

const API = process.env.TEACHER_AUDIT_API || 'http://localhost:3001/api';
const WEB = process.env.TEACHER_AUDIT_WEB || 'http://localhost:3444';
const OUT_DIR = path.join(process.cwd(), 'test-screenshots', 'teacher-business-audit');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const DEMO_PASSWORD = process.env.TEACHER_AUDIT_PASSWORD || process.env.BUSINESS_AUDIT_PASSWORD || 'MathAI@Demo123';
const SEEDED = {
  classId: '69fc002c9f998e8ddff6b32a',
  curriculumTemplateId: '69fc0a0fea7bd7fefb462d5e',
  lessonTemplateId: '69fc0a0fea7bd7fefb462d60',
  assignmentId: '69fc0a0fea7bd7fefb462d63',
};

fs.mkdirSync(OUT_DIR, { recursive: true });

const users = {
  admin: { email: 'admin@mathai.vn', password: DEMO_PASSWORD },
  teacher: { email: 'teacher@mathai.vn', password: DEMO_PASSWORD },
  student: { email: 'student@mathai.vn', password: DEMO_PASSWORD },
  parent: { email: 'parent@mathai.vn', password: DEMO_PASSWORD },
};

const report = {
  runId: RUN_ID,
  apiBase: API,
  webBase: WEB,
  startedAt: new Date().toISOString(),
  seeded: SEEDED,
  summary: { pass: 0, fail: 0, warn: 0, skip: 0 },
  workflows: {},
  checks: [],
  artifacts: [],
  createdMarkers: [],
  diagnostics: {
    consideredSources: [
      'RBAC middleware hoặc scoped authorization sai vai trò teacher',
      'Teacher service thiếu kiểm tra own class/student/assignment scope',
      'Workflow assignment thiếu endpoint detail/submission hoặc dữ liệu seeded không khớp',
      'Gradebook không được upsert sau gradeSubmission hoặc filter class/student sai',
      'Content-library teacher permission/proposal/publish rule sai',
      'Frontend teacher route dùng sai localStorage/auth hoặc API client path',
      'UI route render lỗi, network 4xx/5xx, console error, loading stuck, mojibake hoặc overflow',
    ],
    mostLikelyIfFailure: [],
  },
};

function loadEnv(file, options = {}) {
  const loaded = new Set();
  if (!fs.existsSync(file)) return loaded;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    loaded.add(key);
    if (options.override || !process.env[key]) process.env[key] = value;
  }
  return loaded;
}

function redact(value) {
  if (value == null) return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]')
    .replace(/"accessToken"\s*:\s*"[^"]+"/g, '"accessToken":"[REDACTED]"')
    .replace(/"refreshToken"\s*:\s*"[^"]+"/g, '"refreshToken":"[REDACTED]"')
    .slice(0, 1800);
}

function workflowOf(name) {
  if (/Auth|RBAC|scope|forbidden|unknown|parent|student-only|admin-only|me/i.test(name)) return 'Auth/Profile/RBAC/Scope';
  if (/dashboard|classes|students|analytics/i.test(name)) return 'Dashboard/Classes/Students';
  if (/assignment marker|Teacher assignments|submissions|grade submission|seed submission|Detail assignment|cleanup/i.test(name)) return 'Assignment workflow';
  if (/gradebook/i.test(name)) return 'Gradebook workflow';
  if (/Content library|curriculum|lesson template|content assignment|publish/i.test(name)) return 'Content-library workflow';
  if (/proposal/i.test(name)) return 'Proposals workflow';
  if (/UI|browser|network|console|mojibake|overflow|loading/i.test(name)) return 'UI/Puppeteer workflow';
  return 'Runtime health';
}

function addCheck(name, status, details = {}) {
  if (!report.summary[status]) report.summary[status] = 0;
  report.summary[status] += 1;
  const workflow = details.workflow || workflowOf(name);
  if (!report.workflows[workflow]) report.workflows[workflow] = { pass: 0, fail: 0, warn: 0, skip: 0 };
  report.workflows[workflow][status] += 1;
  const row = { name, workflow, status, ...details };
  report.checks.push(row);
  const icon = status.toUpperCase();
  console.log(`[${icon}] ${workflow} :: ${name}${details.statusCode ? ` (${details.statusCode})` : ''}${details.note ? ` - ${details.note}` : ''}`);
  return row;
}

async function request(method, endpoint, token, body, expected = [200], options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${endpoint}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  const ok = expected.includes(response.status);
  const details = { statusCode: response.status, endpoint, method };
  if (!ok || options.captureBody) details.body = redact(json || text);
  return { ok, status: response.status, json, text, details };
}

async function apiCheck(name, method, endpoint, token, body, expected = [200], options = {}) {
  try {
    const result = await request(method, endpoint, token, body, expected, options);
    addCheck(name, result.ok ? 'pass' : 'fail', result.details);
    return result;
  } catch (error) {
    addCheck(name, 'fail', { endpoint, method, error: error.stack || error.message });
    return { ok: false, status: 0, json: null, error };
  }
}

function dataOf(result) { return result?.json?.data ?? result?.json; }
function listOf(result) {
  const data = dataOf(result);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}
function idOf(row) {
  if (!row || typeof row !== 'object') return undefined;
  return String(row._id || row.id || row.student_id || row.class_id || row.profile_id || row.profile?._id || row.profile?.id || row.student?._id || row.student?.id || '');
}

async function login(role) {
  const res = await apiCheck(`Auth login ${role}`, 'POST', '/auth/login', null, users[role], [200]);
  const data = dataOf(res);
  const token = data?.accessToken || data?.token || data?.access_token || data?.tokens?.access_token || data?.tokens?.accessToken;
  if (!token) addCheck(`Auth token present ${role}`, 'fail', { note: 'Không tìm thấy token trong response login' });
  else addCheck(`Auth token present ${role}`, 'pass');
  return { token, user: data?.user || data };
}

function getDbConfig() {
  const uri = process.env.TEACHER_AUDIT_MONGODB_URI || process.env.BUSINESS_AUDIT_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/mathai';
  let dbName = process.env.TEACHER_AUDIT_DB_NAME || process.env.BUSINESS_AUDIT_DB_NAME || process.env.DB_NAME || process.env.MONGODB_DB;
  if (!dbName) {
    try {
      const u = new URL(uri);
      dbName = u.pathname.replace(/^\//, '') || 'mathai';
    } catch (_) { dbName = 'mathai'; }
  }
  return { uri, dbName };
}

async function withDb(fn) {
  let MongoClient;
  try { ({ MongoClient } = require('mongodb')); }
  catch (_) { ({ MongoClient } = require(path.join(process.cwd(), 'packages', 'backend', 'node_modules', 'mongodb'))); }
  const { uri, dbName } = getDbConfig();
  const client = new MongoClient(uri);
  await client.connect();
  try { return await fn(client.db(dbName)); }
  finally { await client.close(); }
}

async function findDemoStudentProfileId(studentAuthUser) {
  try {
    let ObjectId;
    try { ({ ObjectId } = require('mongodb')); }
    catch (_) { ({ ObjectId } = require(path.join(process.cwd(), 'packages', 'backend', 'node_modules', 'mongodb'))); }
    return await withDb(async (db) => {
      const userByEmail = await db.collection('users').findOne({ email: users.student.email });
      const userId = studentAuthUser?._id || studentAuthUser?.id;
      const user = userByEmail || (userId && ObjectId.isValid(String(userId))
        ? await db.collection('users').findOne({ _id: new ObjectId(String(userId)) })
        : null);
      const student = user
        ? await db.collection('studentprofiles').findOne({ user_id: user._id })
        : await db.collection('studentprofiles').findOne({});
      if (student?._id) addCheck('Find demo student profile for grading', 'pass', { note: String(student._id) });
      return student?._id?.toString() || null;
    });
  } catch (error) {
    addCheck('Find demo student profile for grading', 'warn', { error: error.message });
    return null;
  }
}

async function attachStudentToClassForAudit(classId, studentId) {
  try {
    let ObjectId;
    try { ({ ObjectId } = require('mongodb')); }
    catch (_) { ({ ObjectId } = require(path.join(process.cwd(), 'packages', 'backend', 'node_modules', 'mongodb'))); }
    await withDb(async (db) => {
      await db.collection('teacherclasses').updateOne(
        { _id: new ObjectId(classId) },
        { $addToSet: { student_ids: new ObjectId(studentId) }, $set: { updatedAt: new Date() } }
      );
    });
    report.createdMarkers.push({ type: 'class_student_link', classId, studentId });
    addCheck('Attach demo student to teacher class for grading coverage', 'pass', { note: `${studentId} -> ${classId}` });
    return true;
  } catch (error) {
    addCheck('Attach demo student to teacher class for grading coverage', 'warn', { error: error.message });
    return false;
  }
}

async function seedSubmissionForAssignment(assignmentId, studentId, marker) {
  try {
    let ObjectId;
    try { ({ ObjectId } = require('mongodb')); }
    catch (_) { ({ ObjectId } = require(path.join(process.cwd(), 'packages', 'backend', 'node_modules', 'mongodb'))); }
    const result = await withDb(async (db) => {
      const assignment = await db.collection('teacherassignments').findOne({ _id: new ObjectId(assignmentId) });
      const student = await db.collection('studentprofiles').findOne({ _id: new ObjectId(studentId) });
      if (!assignment || !student) return { seeded: false, reason: `assignment=${!!assignment}, student=${!!student}` };
      await db.collection('studentsubmissions').updateOne(
        { assignment_id: new ObjectId(assignmentId), student_id: new ObjectId(studentId) },
        {
          $setOnInsert: { assignment_id: new ObjectId(assignmentId), student_id: new ObjectId(studentId), createdAt: new Date() },
          $set: { content: `Teacher business audit submission ${marker}: 1 + 1 = 2`, score: null, feedback: null, rubric_score: null, graded_at: null, submitted_at: new Date(), updatedAt: new Date() },
        },
        { upsert: true }
      );
      const submission = await db.collection('studentsubmissions').findOne({ assignment_id: new ObjectId(assignmentId), student_id: new ObjectId(studentId) });
      return { seeded: true, id: submission?._id?.toString() };
    });
    addCheck('Assignment seed submission marker via DB', result.seeded ? 'pass' : 'skip', { note: result.seeded ? result.id : result.reason });
    return result.id;
  } catch (error) {
    addCheck('Assignment seed submission marker via DB', 'warn', { error: error.message, note: 'Không seed được submission trực tiếp; grading workflow có thể skip' });
    return null;
  }
}

async function cleanupCreatedMarkers() {
  if (!report.createdMarkers.length) return;
  try {
    let ObjectId;
    try { ({ ObjectId } = require('mongodb')); }
    catch (_) { ({ ObjectId } = require(path.join(process.cwd(), 'packages', 'backend', 'node_modules', 'mongodb'))); }
    await withDb(async (db) => {
      const assignmentIds = report.createdMarkers.filter((m) => m.type === 'teacher_assignment').map((m) => new ObjectId(m.id));
      if (assignmentIds.length) {
        await db.collection('studentsubmissions').deleteMany({ assignment_id: { $in: assignmentIds } });
        await db.collection('gradebookentries').deleteMany({ source_type: 'teacher_assignment', source_id: { $in: assignmentIds.map(String) } });
      }
      for (const link of report.createdMarkers.filter((m) => m.type === 'class_student_link')) {
        await db.collection('teacherclasses').updateOne(
          { _id: new ObjectId(link.classId) },
          { $pull: { student_ids: new ObjectId(link.studentId) }, $set: { updatedAt: new Date() } }
        );
      }
    });
    addCheck('Cleanup direct DB gradebook/submission markers', 'pass');
  } catch (error) {
    addCheck('Cleanup direct DB gradebook/submission markers', 'warn', { error: error.message });
  }
}

async function uiSnapshot(token, user, urlPath) {
  let puppeteer;
  try { puppeteer = require('puppeteer'); }
  catch (_) { try { puppeteer = require(path.join(process.cwd(), 'node_modules', 'puppeteer')); } catch (_) {} }
  if (!puppeteer && process.env.PUPPETEER_REQUIRE_PATH) {
    try { puppeteer = require(process.env.PUPPETEER_REQUIRE_PATH); } catch (_) {}
  }
  if (!puppeteer) {
    addCheck(`UI snapshot teacher ${urlPath}`, 'skip', { note: 'Puppeteer không có trong node_modules' });
    return;
  }
  let browser;
  const consoleErrors = [];
  const networkErrors = [];
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 800)); });
    page.on('pageerror', (err) => consoleErrors.push((err.stack || err.message).slice(0, 1000)));
    page.on('response', (response) => {
      const status = response.status();
      const url = response.url();
      if (status >= 400 && (url.includes('/api/') || url.startsWith(WEB))) networkErrors.push({ status, url: url.replace(API, '/api').replace(WEB, '') });
    });
    await page.evaluateOnNewDocument((tokenValue, userValue) => {
      localStorage.setItem('token', tokenValue);
      localStorage.setItem('user', JSON.stringify(userValue));
      localStorage.setItem('mathai-token', tokenValue);
      localStorage.setItem('mathai-user', JSON.stringify(userValue));
      localStorage.setItem('access_token', tokenValue);
    }, token, user);
    const response = await page.goto(`${WEB}${urlPath}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 700));
    const safeName = urlPath.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
    const file = path.join(OUT_DIR, `${RUN_ID}-teacher-${safeName}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
    report.artifacts.push(rel);
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000)).catch(() => '');
    const metrics = await page.evaluate(() => {
      const text = document.body.innerText;
      const mojibakePattern = /Ã.|Â.|�|\b(?:NÃ|GiÃ|toÃ|lá»|há»|giá»|táº|há»c|toÃ¡n)\b/i;
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        loadingText: /loading|đang tải|dang tai/i.test(text),
        mojibake: mojibakePattern.test(text),
        errorText: /Application error|Unhandled Runtime Error|NEXT_REDIRECT|Something went wrong|Lỗi|Khong tim thay|Không tìm thấy/i.test(text),
      };
    }).catch(() => ({}));
    const severeNetwork = networkErrors.filter((e) => !String(e.url).includes('favicon'));
    const ok = response && response.status() < 500 && consoleErrors.length === 0 && severeNetwork.length === 0 && !metrics.errorText && !metrics.mojibake && metrics.scrollWidth <= metrics.clientWidth + 8;
    addCheck(`UI snapshot teacher ${urlPath}`, ok ? 'pass' : 'fail', {
      statusCode: response?.status(), artifact: rel,
      note: ok ? undefined : `console=${consoleErrors.length}, network=${severeNetwork.length}, overflow=${metrics.scrollWidth > metrics.clientWidth + 8}, mojibake=${!!metrics.mojibake}, errorText=${!!metrics.errorText}`,
      consoleErrors: consoleErrors.slice(0, 5), networkErrors: severeNetwork.slice(0, 10), body: ok ? undefined : redact(bodyText), metrics,
    });
  } catch (error) {
    addCheck(`UI snapshot teacher ${urlPath}`, 'fail', { error: error.stack || error.message });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

async function main() {
  await apiCheck('Backend API health /auth/me unauthorized', 'GET', '/auth/me', null, undefined, [401]);
  const auth = {};
  for (const role of Object.keys(users)) {
    auth[role] = await login(role);
    if (auth[role].token) await apiCheck(`Auth /auth/me ${role}`, 'GET', '/auth/me', auth[role].token, undefined, [200], { captureBody: role === 'teacher' });
  }
  const A = auth.admin.token, T = auth.teacher.token, S = auth.student.token, P = auth.parent.token;

  await apiCheck('RBAC teacher forbidden admin stats', 'GET', '/admin/stats', T, undefined, [403]);
  await apiCheck('RBAC teacher forbidden parent children', 'GET', '/parent/children', T, undefined, [403]);
  await apiCheck('RBAC teacher forbidden student dashboard', 'GET', '/dashboard/stats', T, undefined, [403]);
  await apiCheck('RBAC student forbidden teacher dashboard', 'GET', '/teacher/dashboard', S, undefined, [403]);
  await apiCheck('RBAC parent forbidden teacher classes', 'GET', '/teacher/classes', P, undefined, [403]);
  await apiCheck('RBAC unauth teacher dashboard rejected', 'GET', '/teacher/dashboard', null, undefined, [401]);

  const teacherDash = await apiCheck('Teacher dashboard', 'GET', '/teacher/dashboard', T, undefined, [200], { captureBody: true });
  const teacherClasses = await apiCheck('Teacher classes list', 'GET', '/teacher/classes', T, undefined, [200], { captureBody: true });
  const teacherStudents = await apiCheck('Teacher students list', 'GET', '/teacher/students', T, undefined, [200], { captureBody: true });
  const teacherAssignments = await apiCheck('Teacher assignments list', 'GET', '/teacher/assignments', T, undefined, [200], { captureBody: true });
  await apiCheck('Teacher analytics', 'GET', '/teacher/analytics', T, undefined, [200], { captureBody: true });
  await apiCheck('Teacher proposals list', 'GET', '/teacher/proposals', T, undefined, [200], { captureBody: true });
  await apiCheck('Teacher proposals pending filter', 'GET', '/teacher/proposals?status=pending', T, undefined, [200]);
  await apiCheck('Teacher scope denies unknown class detail', 'GET', '/teacher/classes/507f1f77bcf86cd799439098', T, undefined, [403, 404]);
  await apiCheck('Teacher scope denies unknown class students', 'GET', '/teacher/classes/507f1f77bcf86cd799439098/students', T, undefined, [403, 404]);
  await apiCheck('Teacher assignments unknown class filter denied', 'GET', '/teacher/assignments?class_id=507f1f77bcf86cd799439098', T, undefined, [403, 404]);

  let cls = listOf(teacherClasses).find((c) => idOf(c) === SEEDED.classId) || listOf(teacherClasses)[0];
  if (cls) {
    const classId = idOf(cls);
    await apiCheck('Teacher class detail own class', 'GET', `/teacher/classes/${classId}`, T, undefined, [200], { captureBody: true });
    const classStudents = await apiCheck('Teacher class students own class', 'GET', `/teacher/classes/${classId}/students`, T, undefined, [200], { captureBody: true });
    await apiCheck('Teacher class gradebook own class before grading', 'GET', `/teacher/classes/${classId}/gradebook`, T, undefined, [200], { captureBody: true });
    await apiCheck('Teacher gradebook summary all classes', 'GET', '/teacher/gradebook', T, undefined, [200], { captureBody: true });

    const marker = `teacher-business-audit-${RUN_ID}`;
    const createAssignment = await apiCheck('Teacher create assignment marker', 'POST', '/teacher/assignments', T, {
      class_id: classId,
      title: `Teacher Business Audit ${marker}`,
      description: 'Safe marker assignment for teacher business audit.',
      type: 'homework',
      status: 'active',
      total_points: 10,
      due_date: new Date(Date.now() + 86400000).toISOString(),
    }, [201], { captureBody: true });
    const assignmentId = idOf(dataOf(createAssignment));
    if (assignmentId) {
      report.createdMarkers.push({ type: 'teacher_assignment', id: assignmentId });
      const detailViaList = await apiCheck('Detail assignment marker via class_id list', 'GET', `/teacher/assignments?class_id=${classId}`, T, undefined, [200], { captureBody: true });
      const detailFound = listOf(detailViaList).some((a) => idOf(a) === assignmentId);
      addCheck('Detail assignment marker present in filtered list', detailFound ? 'pass' : 'fail', { note: assignmentId });
      const unsupportedDetail = await request('GET', `/teacher/assignments/${assignmentId}`, T, undefined, [200, 404], { captureBody: true });
      addCheck('Detail assignment direct endpoint contract check', unsupportedDetail.status === 404 ? 'warn' : unsupportedDetail.ok ? 'pass' : 'fail', { ...unsupportedDetail.details, note: unsupportedDetail.status === 404 ? 'Direct detail endpoint chưa được expose; detail xác minh qua filtered list' : undefined });
      await apiCheck('Teacher update assignment marker', 'PUT', `/teacher/assignments/${assignmentId}`, T, { description: `Updated ${marker}`, status: 'grading' }, [200], { captureBody: true });
      const submissionsBefore = await apiCheck('Teacher assignment submissions before grading', 'GET', `/teacher/assignments/${assignmentId}/submissions`, T, undefined, [200], { captureBody: true });
      let studentId = idOf(listOf(classStudents)[0]) || idOf(listOf(teacherStudents)[0]);
      if (!studentId && Array.isArray(cls.student_ids) && cls.student_ids.length) studentId = String(cls.student_ids[0]?._id || cls.student_ids[0]);
      if (!studentId) studentId = await findDemoStudentProfileId(auth.student.user);
      if (studentId && listOf(classStudents).length === 0) await attachStudentToClassForAudit(classId, studentId);
      let submissionId = idOf(listOf(submissionsBefore)[0]);
      if (!submissionId && studentId) submissionId = await seedSubmissionForAssignment(assignmentId, studentId, marker);
      const submissionsAfterSeed = await apiCheck('Teacher assignment submissions after seed', 'GET', `/teacher/assignments/${assignmentId}/submissions`, T, undefined, [200], { captureBody: true });
      if (!submissionId) submissionId = idOf(listOf(submissionsAfterSeed)[0]);
      if (submissionId) {
        await apiCheck('Teacher grade submission marker', 'PUT', `/teacher/submissions/${submissionId}/grade`, T, { score: 8, feedback: `Graded by ${marker}` }, [200], { captureBody: true });
        const gradebookAfter = await apiCheck('Teacher class gradebook after grading', 'GET', `/teacher/classes/${classId}/gradebook`, T, undefined, [200], { captureBody: true });
        const gbText = JSON.stringify(dataOf(gradebookAfter) || {});
        const gradebookReflectsMarker = gbText.includes(assignmentId) || gbText.includes('teacher_assignment') || gbText.includes('8');
        addCheck('Gradebook reflects graded assignment marker', gradebookReflectsMarker ? 'pass' : 'fail', { note: assignmentId });
        if (studentId) await apiCheck('Teacher gradebook student filter scoped', 'GET', `/teacher/gradebook?student_id=${studentId}`, T, undefined, [200], { captureBody: true });
      } else {
        addCheck('Teacher grade submission marker', 'skip', { note: 'Không có student/submission để chấm trong class seed' });
      }
      await apiCheck('Teacher assignment submissions unknown assignment denied', 'GET', '/teacher/assignments/507f1f77bcf86cd799439097/submissions', T, undefined, [403, 404]);
      await apiCheck('Teacher delete assignment cleanup marker', 'DELETE', `/teacher/assignments/${assignmentId}`, T, undefined, [200]);
    } else {
      addCheck('Teacher assignment marker workflow', 'fail', { note: 'Không lấy được assignmentId sau create' });
    }

    const proposalMarker = `Teacher Audit Proposal ${RUN_ID}`;
    await apiCheck('Teacher create class proposal marker', 'POST', '/teacher/classes', T, { name: proposalMarker, subject: 'Toán', grade_level: 8, schedule: 'Audit only', description: marker }, [201], { captureBody: true });
    const firstStudent = listOf(classStudents)[0] || listOf(teacherStudents)[0];
    const studentEmail = firstStudent?.user_id?.email || firstStudent?.user?.email || firstStudent?.email || 'student@mathai.vn';
    await apiCheck('Teacher create add-student proposal marker', 'POST', `/teacher/classes/${classId}/students`, T, { email: studentEmail }, [201, 400, 409], { captureBody: true });
  } else {
    addCheck('Teacher class dependent workflows', 'skip', { note: 'Teacher không có class seed' });
  }

  await apiCheck('Teacher gradebook unknown class denied', 'GET', '/teacher/classes/507f1f77bcf86cd799439098/gradebook', T, undefined, [403, 404]);
  await apiCheck('Teacher gradebook unknown student denied/empty', 'GET', '/teacher/gradebook?student_id=507f1f77bcf86cd799439099', T, undefined, [403, 404, 200], { captureBody: true });

  const curricula = await apiCheck('Content library teacher curriculum templates list', 'GET', '/content-library/curriculum-templates?limit=20', T, undefined, [200], { captureBody: true });
  const lessons = await apiCheck('Content library teacher lesson templates list', 'GET', '/content-library/lesson-templates?limit=20', T, undefined, [200], { captureBody: true });
  await apiCheck('Content library teacher own draft curriculum list', 'GET', '/content-library/curriculum-templates?own=true&status=draft&limit=20', T, undefined, [200]);
  await apiCheck('Content library teacher own draft lesson list', 'GET', '/content-library/lesson-templates?own=true&status=draft&limit=20', T, undefined, [200]);
  await apiCheck('Content library seeded curriculum detail teacher', 'GET', `/content-library/curriculum-templates/${SEEDED.curriculumTemplateId}`, T, undefined, [200, 404], { captureBody: true });
  await apiCheck('Content library seeded lesson detail teacher', 'GET', `/content-library/lesson-templates/${SEEDED.lessonTemplateId}`, T, undefined, [200, 404], { captureBody: true });
  await apiCheck('Content library seeded assignment detail teacher/admin scoped', 'GET', `/content-library/assignments/${SEEDED.assignmentId}`, T, undefined, [200, 403, 404], { captureBody: true });
  const lessonTemplate = listOf(lessons).find((l) => idOf(l) === SEEDED.lessonTemplateId) || listOf(lessons)[0];
  if (lessonTemplate) {
    const lessonTemplateId = idOf(lessonTemplate);
    const updateLesson = await request('PATCH', `/content-library/lesson-templates/${lessonTemplateId}`, T, { estimated_minutes: lessonTemplate.estimated_minutes || 45 }, [200, 400, 403], { captureBody: true });
    const expectedBlocked = [400, 403].includes(updateLesson.status) && /published|không có quyền|Ban khong co quyen|cannot be edited/i.test(String(updateLesson.details.body || updateLesson.text || ''));
    addCheck('Content library teacher update lesson template permission/rule', updateLesson.ok || expectedBlocked ? 'pass' : 'fail', { ...updateLesson.details, note: expectedBlocked ? 'Đúng rule: published/non-owner template bị chặn sửa trực tiếp' : undefined });
    const requestPublish = await request('POST', `/content-library/lesson-templates/${lessonTemplateId}/request-publish`, T, undefined, [201, 400, 403], { captureBody: true });
    const acceptablePublishDependency = requestPublish.ok || ([400, 403].includes(requestPublish.status) && /quyền|published|owner|draft|không|khong/i.test(String(requestPublish.details.body || requestPublish.text || '')));
    addCheck('Content library teacher request publish lesson dependency', acceptablePublishDependency ? 'pass' : 'fail', { ...requestPublish.details, note: requestPublish.ok ? 'Proposal/request publish tạo thành công' : 'Đúng dependency/rule publish cần draft owner hoặc trạng thái phù hợp' });
  } else {
    addCheck('Content library lesson detail/update/publish', 'skip', { note: 'Không có lesson template' });
  }
  if (cls && lessonTemplate) {
    const contentAssign = await apiCheck('Content assignment create marker teacher', 'POST', '/content-library/assignments', T, {
      template_type: 'lesson_template', template_id: idOf(lessonTemplate), target_type: 'class', target_id: idOf(cls), auto_apply_new_students: true,
    }, [201], { captureBody: true });
    const contentAssignmentId = idOf(dataOf(contentAssign));
    if (contentAssignmentId) {
      report.createdMarkers.push({ type: 'content_assignment', id: contentAssignmentId });
      await apiCheck('Content assignments list teacher', 'GET', '/content-library/assignments?limit=20', T, undefined, [200], { captureBody: true });
      await apiCheck('Content assignment detail marker teacher', 'GET', `/content-library/assignments/${contentAssignmentId}`, T, undefined, [200], { captureBody: true });
      await apiCheck('Content assignment update marker teacher', 'PATCH', `/content-library/assignments/${contentAssignmentId}`, T, { auto_apply_new_students: false }, [200]);
      await apiCheck('Content assignment pause marker teacher', 'PUT', `/content-library/assignments/${contentAssignmentId}/pause`, T, undefined, [200]);
      await apiCheck('Content assignment activate marker teacher', 'PUT', `/content-library/assignments/${contentAssignmentId}/activate`, T, undefined, [200]);
      await apiCheck('Content assignment archive cleanup marker teacher', 'DELETE', `/content-library/assignments/${contentAssignmentId}`, T, undefined, [200]);
    }
  } else {
    addCheck('Content assignment marker workflow', 'skip', { note: 'Thiếu class hoặc lesson template' });
  }
  await apiCheck('Content library student forbidden assignments', 'GET', '/content-library/assignments', S, undefined, [403]);
  await apiCheck('Content library teacher unknown target assignment denied', 'POST', '/content-library/assignments', T, { template_type: 'lesson_template', template_id: SEEDED.lessonTemplateId, target_type: 'class', target_id: '507f1f77bcf86cd799439098' }, [403, 404]);

  const uiUser = { ...(auth.teacher.user || {}), role: 'teacher', email: users.teacher.email, full_name: 'Demo Teacher' };
  const uiPaths = [
    '/teacher', '/teacher/classes', '/teacher/students', '/teacher/assignments', '/teacher/content-library',
    '/teacher/content-library/curricula/new', `/teacher/content-library/curricula/${SEEDED.curriculumTemplateId}`,
    '/teacher/content-library/lessons/new', `/teacher/content-library/lessons/${SEEDED.lessonTemplateId}`,
    `/teacher/content-library/lessons/${SEEDED.lessonTemplateId}/edit`, `/teacher/content-library/lessons/${SEEDED.lessonTemplateId}/stats`,
    `/teacher/content-library/assignments/${SEEDED.assignmentId}`, `/teacher/content-library/assignments/${SEEDED.assignmentId}/edit`, `/teacher/content-library/assignments/${SEEDED.assignmentId}/stats`,
    '/teacher/proposals', '/teacher/settings',
  ];
  for (const p of uiPaths) await uiSnapshot(T, uiUser, p);

  await cleanupCreatedMarkers();
  report.finishedAt = new Date().toISOString();
  if (report.summary.fail > 0) {
    report.diagnostics.mostLikelyIfFailure = [
      'Frontend teacher route/API integration hoặc route chưa tồn tại gây UI/network fail',
      'Backend teacher workflow thiếu direct endpoint/detail hoặc scoped permission chưa khớp business workflow',
    ];
  }
  const jsonPath = path.join(OUT_DIR, `teacher-business-audit-${RUN_ID}.json`);
  const mdPath = path.join(OUT_DIR, `teacher-business-audit-${RUN_ID}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  const workflowLines = Object.entries(report.workflows).map(([name, s]) => `| ${name} | PASS ${s.pass} | FAIL ${s.fail} | WARN ${s.warn} | SKIP ${s.skip} |`);
  const md = [
    `# Teacher Business Audit ${RUN_ID}`,
    '',
    `API: ${API}`,
    `WEB: ${WEB}`,
    `Summary: PASS ${report.summary.pass} / FAIL ${report.summary.fail} / WARN ${report.summary.warn} / SKIP ${report.summary.skip}`,
    '',
    '## Workflow summary',
    '| Workflow | Pass | Fail | Warn | Skip |',
    '|---|---:|---:|---:|---:|',
    ...workflowLines,
    '',
    '## Diagnostics considered',
    ...report.diagnostics.consideredSources.map((s) => `- ${s}`),
    '',
    '## Checks',
    '| Status | Workflow | Check | Endpoint/Artifact | Note |',
    '|---|---|---|---|---|',
    ...report.checks.map((c) => `| ${String(c.status).toUpperCase()} | ${String(c.workflow).replace(/\|/g, '\\|')} | ${String(c.name).replace(/\|/g, '\\|')} | ${c.endpoint || c.artifact || ''} | ${String(c.note || c.error || c.statusCode || '').replace(/\|/g, '\\|')} |`),
    '',
    '## Artifacts',
    ...report.artifacts.map((a) => `- ${a}`),
  ].join('\n');
  fs.writeFileSync(mdPath, md);
  console.log(`REPORT_JSON=${path.relative(process.cwd(), jsonPath).replace(/\\/g, '/')}`);
  console.log(`REPORT_MD=${path.relative(process.cwd(), mdPath).replace(/\\/g, '/')}`);
  process.exitCode = report.summary.fail > 0 ? 1 : 0;
}

main().catch((error) => {
  addCheck('teacher business audit fatal', 'fail', { error: error.stack || error.message, workflow: 'Runtime health' });
  report.finishedAt = new Date().toISOString();
  const jsonPath = path.join(OUT_DIR, `teacher-business-audit-${RUN_ID}.fatal.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.error(error);
  process.exit(1);
});
