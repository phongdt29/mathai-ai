const fs = require('fs');
const path = require('path');

const API = process.env.BUSINESS_AUDIT_API || 'http://localhost:3001/api';
const WEB = process.env.BUSINESS_AUDIT_WEB || 'http://localhost:3444';
const OUT_DIR = path.join(process.cwd(), 'test-screenshots', 'business-audit');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const DEMO_PASSWORD = process.env.BUSINESS_AUDIT_PASSWORD || 'MathAI@Demo123';

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
  summary: { pass: 0, fail: 0, warn: 0, skip: 0 },
  checks: [],
  context: {},
  artifacts: [],
};

function redact(value) {
  if (value == null) return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]')
    .replace(/"accessToken"\s*:\s*"[^"]+"/g, '"accessToken":"[REDACTED]"')
    .replace(/"refreshToken"\s*:\s*"[^"]+"/g, '"refreshToken":"[REDACTED]"')
    .slice(0, 1200);
}

function addCheck(name, status, details = {}) {
  report.summary[status] += 1;
  const row = { name, status, ...details };
  report.checks.push(row);
  const icon = status === 'pass' ? 'PASS' : status === 'warn' ? 'WARN' : status === 'skip' ? 'SKIP' : 'FAIL';
  console.log(`[${icon}] ${name}${details.statusCode ? ` (${details.statusCode})` : ''}${details.note ? ` - ${details.note}` : ''}`);
  return row;
}

async function request(method, endpoint, token, body, expected = [200], options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${endpoint}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
    addCheck(name, 'fail', { endpoint, method, error: error.message });
    return { ok: false, status: 0, json: null, error };
  }
}

function dataOf(result) {
  return result?.json?.data ?? result?.json;
}

function listOf(result) {
  const data = dataOf(result);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.logs)) return data.logs;
  return [];
}

function idOf(row) {
  if (!row || typeof row !== 'object') return undefined;
  return row._id || row.id || row.student_id || row.lesson_id || row.class_id || row.profile_id || row.profile?.id || row.profile?._id || row.student?.id || row.student?._id;
}

async function login(role) {
  const res = await apiCheck(`Auth login ${role}`, 'POST', '/auth/login', null, users[role], [200]);
  const data = dataOf(res);
  const token = data?.accessToken || data?.token || data?.access_token || data?.tokens?.access_token || data?.tokens?.accessToken;
  if (!token) addCheck(`Auth token present ${role}`, 'fail', { note: 'Không tìm thấy token trong response login' });
  else addCheck(`Auth token present ${role}`, 'pass');
  return { token, user: data?.user };
}

async function ensureRiskSignal(adminToken, studentProfile, studentAuth) {
  const marker = `business-audit-risk-${RUN_ID}`;
  const profileData = dataOf(studentProfile);
  let studentId = idOf(profileData) || idOf(studentAuth?.user);

  try {
    const { MongoClient, ObjectId } = require('mongodb');
    const uri = process.env.BUSINESS_AUDIT_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017';
    const dbName = process.env.BUSINESS_AUDIT_DB_NAME || process.env.DB_NAME || process.env.MONGODB_DB || 'mathai';
    const client = new MongoClient(uri);
    await client.connect();
    try {
      const db = client.db(dbName);
      if (!studentId && studentAuth?.user?._id) {
        const profile = await db.collection('studentprofiles').findOne({
          $or: [
            { user_id: new ObjectId(studentAuth.user._id) },
            { user_id: studentAuth.user._id },
            { userId: new ObjectId(studentAuth.user._id) },
            { userId: studentAuth.user._id },
          ],
        }, { projection: { _id: 1 } });
        studentId = profile?._id?.toString();
      }
      if (!studentId) {
        const existingSignals = await apiCheck('Risk signal seed fallback existing pending', 'GET', '/risk-review/signals?status=pending_review&limit=20', adminToken, undefined, [200]);
        const existing = listOf(existingSignals)[0] || null;
        addCheck('Risk signal seed marker', existing ? 'pass' : 'fail', { note: existing ? 'Dùng pending_review signal đã được tạo bởi solver/risk workflow trong audit run' : 'Không tìm thấy student profile id để tạo marker risk signal' });
        return existing;
      }

      const collection = db.collection('fraudsignals');
      const existingProfile = await db.collection('studentprofiles').findOne({ _id: new ObjectId(studentId) }, { projection: { _id: 1 } });
      if (!existingProfile) {
        const existingSignals = await apiCheck('Risk signal seed fallback existing pending', 'GET', '/risk-review/signals?status=pending_review&limit=20', adminToken, undefined, [200]);
        const existing = listOf(existingSignals)[0] || null;
        addCheck('Risk signal seed marker', existing ? 'pass' : 'fail', { note: existing ? 'Dùng pending_review signal đã được tạo bởi solver/risk workflow trong audit run' : `Không tìm thấy student profile ${studentId} trong DB ${dbName}` });
        return existing;
      }

      await collection.updateOne(
        { source_type: 'manual', source_id: marker },
        {
          $setOnInsert: {
            student_id: new ObjectId(studentId),
            actor: { role: 'system' },
            source_type: 'manual',
            source_id: marker,
            signal_type: 'other_risk_signal',
            risk_level: 'informational',
            severity: 'informational',
            confidence: 0.55,
            evidence: { marker, purpose: 'runtime business audit risk review path' },
            explanation: 'Neutral dev/local runtime audit marker for risk signal review workflow; not a misconduct conclusion.',
            status: 'pending_review',
            reviewed_by: null,
            reviewed_at: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          $set: { status: 'pending_review', reviewed_by: null, reviewed_at: null, updatedAt: new Date() },
        },
        { upsert: true }
      );
    } finally {
      await client.close();
    }

    addCheck('Risk signal seed marker', 'pass', { note: marker });
    const seededSignals = await apiCheck('Risk review seeded marker list admin', 'GET', `/risk-review/signals?status=pending_review&source_type=manual&signal_type=other_risk_signal&limit=20`, adminToken, undefined, [200]);
    return listOf(seededSignals).find((signal) => signal.source_id === marker) || listOf(seededSignals)[0] || null;
  } catch (error) {
    const existingSignals = await apiCheck('Risk signal seed fallback existing pending', 'GET', '/risk-review/signals?status=pending_review&limit=20', adminToken, undefined, [200]);
    const existing = listOf(existingSignals)[0] || null;
    addCheck('Risk signal seed marker', existing ? 'pass' : 'fail', { note: existing ? 'Dùng pending_review signal đã được tạo bởi solver/risk workflow trong audit run' : undefined, error: existing ? undefined : (error?.message || String(error)) });
    return existing;
  }
}

async function uiSnapshot(role, token, urlPath) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (error) {
    try { puppeteer = require(path.join(process.cwd(), 'mathai', 'node_modules', 'puppeteer')); } catch (_) {}
  }
  if (!puppeteer) {
    addCheck(`UI snapshot ${role} ${urlPath}`, 'skip', { note: 'Puppeteer không có ở root/nested node_modules' });
    return;
  }
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.checks.push({ name: `browser-console ${role} ${urlPath}`, status: 'warn', message: msg.text().slice(0, 500) });
    });
    await page.evaluateOnNewDocument((tokenValue, userValue) => {
      localStorage.setItem('token', tokenValue);
      localStorage.setItem('user', JSON.stringify(userValue));
      localStorage.setItem('mathai-token', tokenValue);
      localStorage.setItem('mathai-user', JSON.stringify(userValue));
      localStorage.setItem('access_token', tokenValue);
      if (userValue?.role === 'student') localStorage.setItem('mathai-student-grade', '8');
    }, token, { role, email: users[role].email, full_name: `${role} demo` });
    const response = await page.goto(`${WEB}${urlPath}`, { waitUntil: 'networkidle2', timeout: 25000 });
    const file = path.join(OUT_DIR, `${RUN_ID}-${role}-${urlPath.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'}.png`);
    await page.screenshot({ path: file, fullPage: true });
    report.artifacts.push(path.relative(process.cwd(), file).replace(/\\/g, '/'));
    const title = await page.title().catch(() => '');
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000)).catch(() => '');
    const routeOk = response && response.status() < 500 && !/Application error|Unhandled Runtime Error|NEXT_REDIRECT/.test(bodyText);
    addCheck(`UI snapshot ${role} ${urlPath}`, routeOk ? 'pass' : 'fail', { statusCode: response?.status(), artifact: path.relative(process.cwd(), file).replace(/\\/g, '/'), title, body: routeOk ? undefined : redact(bodyText) });
  } catch (error) {
    addCheck(`UI snapshot ${role} ${urlPath}`, 'fail', { error: error.message });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

async function main() {
  await apiCheck('Backend API health via /auth/me unauthorized', 'GET', '/auth/me', null, undefined, [401]);

  const auth = {};
  for (const role of Object.keys(users)) {
    auth[role] = await login(role);
    if (auth[role].token) await apiCheck(`Auth token /auth/me ${role}`, 'GET', '/auth/me', auth[role].token, undefined, [200]);
  }

  const A = auth.admin.token, T = auth.teacher.token, S = auth.student.token, P = auth.parent.token;

  await apiCheck('RBAC student forbidden admin stats', 'GET', '/admin/stats', S, undefined, [403]);
  await apiCheck('RBAC parent forbidden student dashboard', 'GET', '/dashboard/stats', P, undefined, [403]);
  await apiCheck('RBAC teacher forbidden parent children', 'GET', '/parent/children', T, undefined, [403]);
  await apiCheck('RBAC unauth content library rejected', 'GET', '/content-library/curriculum-templates', null, undefined, [401]);

  const studentProfile = await apiCheck('Student profile', 'GET', '/students/profile', S, undefined, [200]);
  const studentDash = await apiCheck('Student dashboard stats', 'GET', '/dashboard/stats', S, undefined, [200]);
  await apiCheck('Student dashboard progress', 'GET', '/dashboard/progress', S, undefined, [200]);
  await apiCheck('Student points summary', 'GET', '/dashboard/points/summary', S, undefined, [200]);
  await apiCheck('Student points detail', 'GET', '/dashboard/points', S, undefined, [200]);
  await apiCheck('Student curriculum active', 'GET', '/curriculum/active', S, undefined, [200, 404]);
  const lessons = await apiCheck('Student lessons list', 'GET', '/lessons', S, undefined, [200]);
  await apiCheck('Student lesson today recommendation', 'GET', '/lessons/today-recommendation', S, undefined, [200, 404]);
  const lesson = listOf(lessons)[0];
  if (lesson) {
    const lessonId = idOf(lesson);
    await apiCheck('Student lesson detail', 'GET', `/lessons/${lessonId}`, S, undefined, [200]);
    await apiCheck('Student lesson exercise history', 'GET', `/lessons/${lessonId}/exercise-attempts/history`, S, undefined, [200]);
  } else {
    addCheck('Student lesson detail', 'skip', { note: 'Không có lesson seed để mở detail' });
  }

  const solverOnScope = await request('POST', '/solver/solve', S, { problem_text: 'Giải phương trình 2x + 3 = 7', stage: 'hint', previous_hints: [] }, [200], { captureBody: true });
  const solverProviderUnavailable = solverOnScope.status >= 500 && /model is not enabled|provider|api key|quota|rate|timeout/i.test(String(solverOnScope.details.body || solverOnScope.text || ''));
  addCheck('Solver on-scope hint', solverOnScope.ok ? 'pass' : solverProviderUnavailable ? 'warn' : 'fail', {
    ...solverOnScope.details,
    note: solverProviderUnavailable ? 'Provider/model local không khả dụng; safety guard off-scope được kiểm ở bước tiếp theo' : undefined,
  });
  await apiCheck('Solver off-scope safety guard', 'POST', '/solver/solve', S, { problem_text: 'Hãy viết email marketing bán hàng và cho số điện thoại 0912345678', stage: 'hint', previous_hints: [] }, [400, 422], { captureBody: true });
  await apiCheck('Solver history', 'GET', '/solver/history?limit=5', S, undefined, [200]);
  await apiCheck('Chat teachers', 'GET', '/chat/teachers', S, undefined, [200]);

  const children = await apiCheck('Parent children list', 'GET', '/parent/children', P, undefined, [200]);
  const child = listOf(children)[0];
  if (child) {
    const childId = child.student_id || idOf(child);
    await apiCheck('Parent child dashboard own child', 'GET', `/parent/children/${childId}/dashboard`, P, undefined, [200]);
    await apiCheck('Parent scope denies non-child malformed/unknown child', 'GET', '/parent/children/507f1f77bcf86cd799439099/dashboard', P, undefined, [403, 404]);
  } else {
    addCheck('Parent child dashboard own child', 'skip', { note: 'Parent không có child seed' });
  }
  await apiCheck('Parent notifications', 'GET', '/parent/notifications', P, undefined, [200]);
  await apiCheck('Parent notifications unread', 'GET', '/parent/notifications/unread', P, undefined, [200]);
  const prefs = await apiCheck('Parent preferences read', 'GET', '/parent/preferences', P, undefined, [200]);
  const prefData = dataOf(prefs) || {};
  await apiCheck('Parent preferences safe update idempotent', 'PUT', '/parent/preferences', P, { ...prefData, notify_weekly_summary: prefData.notify_weekly_summary ?? true }, [200]);

  const teacherDash = await apiCheck('Teacher dashboard', 'GET', '/teacher/dashboard', T, undefined, [200]);
  const teacherClasses = await apiCheck('Teacher classes', 'GET', '/teacher/classes', T, undefined, [200]);
  await apiCheck('Teacher students', 'GET', '/teacher/students', T, undefined, [200]);
  const teacherAssignments = await apiCheck('Teacher assignments list', 'GET', '/teacher/assignments', T, undefined, [200]);
  await apiCheck('Teacher analytics', 'GET', '/teacher/analytics', T, undefined, [200]);
  await apiCheck('Teacher proposals', 'GET', '/teacher/proposals', T, undefined, [200]);
  const cls = listOf(teacherClasses)[0];
  if (cls) {
    const classId = idOf(cls);
    await apiCheck('Teacher class detail own class', 'GET', `/teacher/classes/${classId}`, T, undefined, [200]);
    await apiCheck('Teacher class students own class', 'GET', `/teacher/classes/${classId}/students`, T, undefined, [200]);
    const marker = `business-audit-${RUN_ID}`;
    const createdAssignment = await apiCheck('Teacher create assignment marker', 'POST', '/teacher/assignments', T, {
      class_id: classId,
      title: `Business Audit Assignment ${marker}`,
      description: 'Idempotent runtime business audit assignment; safe test marker.',
      type: 'homework',
      questions: [{ question_text: 'Tính 1 + 1', correct_answer: '2', points: 1 }],
      total_points: 1,
      due_date: new Date(Date.now() + 86400000).toISOString(),
    }, [201], { captureBody: true });
    const assignmentId = idOf(dataOf(createdAssignment));
    if (assignmentId) {
      await apiCheck('Teacher update assignment marker', 'PUT', `/teacher/assignments/${assignmentId}`, T, { description: 'Updated by runtime business audit marker.' }, [200]);
      await apiCheck('Teacher assignment submissions', 'GET', `/teacher/assignments/${assignmentId}/submissions`, T, undefined, [200]);
      await apiCheck('Teacher delete assignment cleanup marker', 'DELETE', `/teacher/assignments/${assignmentId}`, T, undefined, [200]);
    }
  } else {
    addCheck('Teacher class detail own class', 'skip', { note: 'Teacher không có class seed' });
  }
  await apiCheck('Teacher scope denies unknown class', 'GET', '/teacher/classes/507f1f77bcf86cd799439098', T, undefined, [403, 404]);

  await apiCheck('Admin stats', 'GET', '/admin/stats', A, undefined, [200]);
  await apiCheck('Admin users list', 'GET', '/admin/users?role=all&status=all&search=', A, undefined, [200]);
  await apiCheck('Admin settings', 'GET', '/admin/settings', A, undefined, [200, 404]);
  await apiCheck('Admin AI tutors', 'GET', '/admin/ai-tutors', A, undefined, [200]);
  const adminClasses = await apiCheck('Admin classes list', 'GET', '/admin/classes', A, undefined, [200]);
  await apiCheck('Admin proposals list', 'GET', '/admin/proposals', A, undefined, [200]);
  await apiCheck('Admin proposals pending count', 'GET', '/admin/proposals/pending-count', A, undefined, [200]);
  await apiCheck('Admin content overview', 'GET', '/admin/content', A, undefined, [200]);
  await apiCheck('Admin reports', 'GET', '/admin/reports', A, undefined, [200]);
  await apiCheck('Admin activity/audit route', 'GET', '/admin/activity', A, undefined, [200]);
  const adminClass = listOf(adminClasses)[0];
  if (adminClass) {
    const adminClassId = idOf(adminClass);
    await apiCheck('Admin class detail', 'GET', `/admin/classes/${adminClassId}`, A, undefined, [200]);
    await apiCheck('Admin class full detail', 'GET', `/admin/classes/${adminClassId}/full-detail`, A, undefined, [200]);
  }

  const curricula = await apiCheck('Content library curriculum templates list', 'GET', '/content-library/curriculum-templates?limit=20', A, undefined, [200]);
  const lessonsTpl = await apiCheck('Content library lesson templates list', 'GET', '/content-library/lesson-templates?limit=20', A, undefined, [200]);
  await apiCheck('Content library teacher curriculum templates list', 'GET', '/content-library/curriculum-templates?limit=20', T, undefined, [200]);
  await apiCheck('Content library teacher lesson templates list', 'GET', '/content-library/lesson-templates?limit=20', T, undefined, [200]);
  const curriculumTemplate = listOf(curricula)[0];
  if (curriculumTemplate) await apiCheck('Content library curriculum template detail', 'GET', `/content-library/curriculum-templates/${idOf(curriculumTemplate)}`, A, undefined, [200]);
  else addCheck('Content library curriculum template detail', 'skip', { note: 'Không có curriculum template seed' });
  const lessonTemplate = listOf(lessonsTpl)[0];
  if (lessonTemplate) {
    const lessonTemplateId = idOf(lessonTemplate);
    await apiCheck('Content library lesson template detail', 'GET', `/content-library/lesson-templates/${lessonTemplateId}`, A, undefined, [200]);
    const updateLessonTemplate = await request('PATCH', `/content-library/lesson-templates/${lessonTemplateId}`, A, { estimated_minutes: lessonTemplate.estimated_minutes || 45 }, [200], { captureBody: true });
    const publishedEditBlocked = updateLessonTemplate.status === 400 && /Published templates cannot be edited/i.test(String(updateLessonTemplate.details.body || updateLessonTemplate.text || ''));
    addCheck('Content library lesson template update safe', updateLessonTemplate.ok || publishedEditBlocked ? 'pass' : 'fail', {
      ...updateLessonTemplate.details,
      note: publishedEditBlocked ? 'Đúng rule nghiệp vụ: published template không cho sửa trực tiếp' : undefined,
    });
    if (cls) {
      const assignment = await apiCheck('Content assignment create marker', 'POST', '/content-library/assignments', T, {
        template_type: 'lesson_template',
        template_id: lessonTemplateId,
        target_type: 'class',
        target_id: idOf(cls),
        auto_apply_new_students: true,
      }, [201], { captureBody: true });
      const contentAssignmentId = idOf(dataOf(assignment));
      if (contentAssignmentId) {
        await apiCheck('Content assignment detail', 'GET', `/content-library/assignments/${contentAssignmentId}`, T, undefined, [200]);
        await apiCheck('Content assignment update', 'PATCH', `/content-library/assignments/${contentAssignmentId}`, T, { auto_apply_new_students: false }, [200]);
        await apiCheck('Content assignment pause', 'PUT', `/content-library/assignments/${contentAssignmentId}/pause`, T, undefined, [200]);
        await apiCheck('Content assignment activate', 'PUT', `/content-library/assignments/${contentAssignmentId}/activate`, T, undefined, [200]);
        await apiCheck('Content assignment archive cleanup marker', 'DELETE', `/content-library/assignments/${contentAssignmentId}`, T, undefined, [200]);
      }
    }
  } else {
    addCheck('Content library lesson template detail', 'skip', { note: 'Không có lesson template seed' });
  }
  await apiCheck('Content assignments list admin', 'GET', '/content-library/assignments?limit=20', A, undefined, [200]);
  await apiCheck('Content assignment student forbidden', 'GET', '/content-library/assignments', S, undefined, [403]);
  await apiCheck('Content curriculum generate validation fail-safe', 'POST', '/content-library/curriculum-templates/generate', T, { grade_level: 99 }, [400, 422], { captureBody: true });
  await apiCheck('Content lesson generate validation fail-safe', 'POST', '/content-library/lesson-templates/generate', T, { grade_level: 8 }, [400, 422], { captureBody: true });

  await apiCheck('AI governance summary admin', 'GET', '/admin/ai-governance/summary', A, undefined, [200]);
  await apiCheck('AI logs admin', 'GET', '/admin/ai-logs?status=&type=&limit=20', A, undefined, [200]);
  await apiCheck('AI governance forbidden teacher', 'GET', '/admin/ai-governance/summary', T, undefined, [403]);
  await ensureRiskSignal(A, studentProfile, auth.student);
  const signals = await apiCheck('Risk review signals list admin', 'GET', '/risk-review/signals?status=pending_review&limit=20', A, undefined, [200]);
  await apiCheck('Risk review forbidden teacher', 'GET', '/risk-review/signals?limit=20', T, undefined, [403]);
  const signal = listOf(signals)[0];
  if (signal) {
    await apiCheck('Risk signal review decision resolve', 'POST', `/risk-review/signals/${idOf(signal)}/review`, A, { decision: 'resolved', note: `business audit resolve ${RUN_ID}` }, [200], { captureBody: true });
  } else {
    addCheck('Risk signal review', 'fail', { note: 'Đã seed marker nhưng không tìm thấy pending_review signal để review' });
  }

  await uiSnapshot('student', S, '/dashboard');
  await uiSnapshot('student', S, '/dashboard/lessons');
  await uiSnapshot('student', S, '/dashboard/solver');
  await uiSnapshot('parent', P, '/parent');
  await uiSnapshot('teacher', T, '/teacher/content-library');
  await uiSnapshot('admin', A, '/admin/content-library');
  await uiSnapshot('admin', A, '/admin/ai-logs');

  report.finishedAt = new Date().toISOString();
  const jsonPath = path.join(OUT_DIR, `business-audit-${RUN_ID}.json`);
  const mdPath = path.join(OUT_DIR, `business-audit-${RUN_ID}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  const md = [
    `# Runtime Business Audit ${RUN_ID}`,
    '',
    `API: ${API}`,
    `WEB: ${WEB}`,
    '',
    `Summary: PASS ${report.summary.pass} / FAIL ${report.summary.fail} / WARN ${report.summary.warn} / SKIP ${report.summary.skip}`,
    '',
    '| Status | Check | Endpoint/Artifact | Note |',
    '|---|---|---|---|',
    ...report.checks.map((c) => `| ${c.status.toUpperCase()} | ${String(c.name).replace(/\|/g, '\\|')} | ${c.endpoint || c.artifact || ''} | ${String(c.note || c.error || c.statusCode || '').replace(/\|/g, '\\|')} |`),
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
  addCheck('business audit fatal', 'fail', { error: error.stack || error.message });
  report.finishedAt = new Date().toISOString();
  const jsonPath = path.join(OUT_DIR, `business-audit-${RUN_ID}.fatal.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.error(error);
  process.exit(1);
});
