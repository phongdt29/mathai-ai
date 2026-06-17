const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..', '..');

const routeFiles = [
  'src/app/(admin)/admin/content-library/lessons/[id]/edit/page.tsx',
  'src/app/(admin)/admin/content-library/lessons/[id]/stats/page.tsx',
  'src/app/(teacher)/teacher/content-library/lessons/[id]/edit/page.tsx',
  'src/app/(teacher)/teacher/content-library/lessons/[id]/stats/page.tsx',
  'src/app/(admin)/admin/assignments/page.tsx',
  'src/app/(admin)/admin/assignments/[id]/page.tsx',
  'src/app/(admin)/admin/assignments/[id]/edit/page.tsx',
  'src/app/(admin)/admin/assignments/[id]/stats/page.tsx',
  'src/app/(teacher)/teacher/content-library/assignments/page.tsx',
  'src/app/(teacher)/teacher/content-library/assignments/[id]/page.tsx',
  'src/app/(teacher)/teacher/content-library/assignments/[id]/edit/page.tsx',
  'src/app/(teacher)/teacher/content-library/assignments/[id]/stats/page.tsx',
];

const legacyTeacherContentAssignmentRoutes = [
  'src/app/(teacher)/teacher/assignments/[id]/page.tsx',
  'src/app/(teacher)/teacher/assignments/[id]/edit/page.tsx',
  'src/app/(teacher)/teacher/assignments/[id]/stats/page.tsx',
];

test('admin and teacher lesson/test management routes exist', () => {
  for (const relativePath of routeFiles) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `${relativePath} should exist`);
  }
});

test('teacher content-library assignment list uses shared AssignmentList and content-library base path', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/(teacher)/teacher/content-library/assignments/page.tsx'), 'utf8');
  assert.match(source, /import AssignmentList from ['"]@\/components\/AssignmentList['"]/);
  assert.match(source, /basePath=['"]\/teacher\/content-library\/assignments['"]/);

  const assignmentListSource = fs.readFileSync(path.join(root, 'src/components/AssignmentList.tsx'), 'utf8');
  assert.match(assignmentListSource, /"\/teacher\/content-library\/assignments"/);
});

test('teacher content-library assignment details are not mounted under legacy assignments list', () => {
  for (const relativePath of legacyTeacherContentAssignmentRoutes) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), false, `${relativePath} should not exist`);
  }
});

test('content-library assignment cards link to role-specific management routes', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/ContentLibraryList.tsx'), 'utf8');
  assert.match(source, /assignmentRouteBase/);
  assert.match(source, /basePath === ['"]\/teacher\/content-library['"][\s\S]*['"]\/teacher\/content-library\/assignments['"]/);
  assert.match(source, /['"]\/admin\/assignments['"]/);
  assert.match(source, /data-testid={[`'"]content-library-assignment-detail-link/);
  assert.match(source, /href={`\$\{assignmentRouteBase\}\/\$\{id\}`}/);
  assert.match(source, /href={`\$\{assignmentRouteBase\}\/\$\{id\}\/stats`}/);
  assert.match(source, /href={`\$\{assignmentRouteBase\}\/\$\{id\}\/edit`}/);
});

test('shared detail, edit, and stats components expose stable smoke selectors', () => {
  const componentFiles = [
    'src/components/LessonTemplateDetail.tsx',
    'src/components/LessonTemplateEdit.tsx',
    'src/components/LessonTemplateStats.tsx',
    'src/components/AssignmentDetail.tsx',
    'src/components/AssignmentEdit.tsx',
    'src/components/AssignmentStats.tsx',
  ];

  for (const relativePath of componentFiles) {
    const fullPath = path.join(root, relativePath);
    assert.equal(fs.existsSync(fullPath), true, `${relativePath} should exist`);
    const source = fs.readFileSync(fullPath, 'utf8');
    assert.match(source, /data-testid=/, `${relativePath} should expose at least one data-testid`);
  }
});

test('lesson template edit is a persisted update flow', () => {
  const frontendApiSource = fs.readFileSync(path.join(root, 'src/lib/content-library.ts'), 'utf8');
  assert.match(frontendApiSource, /updateLessonTemplate/);
  assert.match(
    frontendApiSource,
    /updateLessonTemplate[\s\S]*(PATCH|PUT|\.patch\(|\.put\()[\s\S]*(content-library\/lesson-templates|lesson-templates)[\s\S]*\$\{id\}/i,
  );

  const routeSource = fs.readFileSync(path.join(repoRoot, 'packages/backend/src/routes/content-library.routes.ts'), 'utf8');
  assert.match(routeSource, /\.(patch|put)\(\s*['"]\/lesson-templates\/:id['"]/i);

  const controllerSource = fs.readFileSync(path.join(repoRoot, 'packages/backend/src/controllers/content-library.controller.ts'), 'utf8');
  assert.match(controllerSource, /updateLessonTemplate/);

  const serviceSource = fs.readFileSync(path.join(repoRoot, 'packages/backend/src/services/content-library.service.ts'), 'utf8');
  assert.match(serviceSource, /updateLessonTemplate/);
  assert.match(
    serviceSource,
    /updateLessonTemplate[\s\S]*if \(existing\.status === ['"]published['"]\)[\s\S]*published templates cannot be edited/i,
  );

  const editSource = fs.readFileSync(path.join(root, 'src/components/LessonTemplateEdit.tsx'), 'utf8');
  assert.match(editSource, /(onSubmit|handleSubmit|submit)/i);
  assert.match(editSource, /contentLibraryApi\.updateLessonTemplate/);
  assert.match(editSource, /Lưu thay đổi/);
  assert.match(editSource, /data-testid=[{]?['"]lesson-edit-save['"]/);
  assert.doesNotMatch(editSource, /Chỉnh sửa chưa khả dụng/);

  const detailSource = fs.readFileSync(path.join(root, 'src/components/LessonTemplateDetail.tsx'), 'utf8');
  assert.match(detailSource, />\s*Chỉnh sửa\s*</);
  assert.doesNotMatch(detailSource, />\s*Chỉnh sửa chưa khả dụng\s*</);
  assert.doesNotMatch(detailSource, /aria-disabled=[{]?['"]true['"]/);
});

test('published lesson templates are not presented as editable in the UI', () => {
  const detailSource = fs.readFileSync(path.join(root, 'src/components/LessonTemplateDetail.tsx'), 'utf8');
  assert.match(
    detailSource,
    /(canEdit|template\.status !== ['"]published['"])[\s\S]*data-testid=['"]lesson-edit-link['"]|data-testid=['"]lesson-edit-link['"][\s\S]*(canEdit|template\.status !== ['"]published['"])/,
    'detail page should only render the edit Link when the lesson template is not published',
  );
  assert.match(
    detailSource,
    /Đã xuất bản - không thể chỉnh sửa|published templates cannot be edited/i,
    'detail page should show disabled-looking copy for published lesson templates',
  );

  const editSource = fs.readFileSync(path.join(root, 'src/components/LessonTemplateEdit.tsx'), 'utf8');
  assert.match(
    editSource,
    /(template\.status|form\.status) === ['"]published['"]|isPublishedTemplate/,
    'edit page should detect published lesson templates',
  );
  assert.match(
    editSource,
    /Đã xuất bản - không thể chỉnh sửa|published templates cannot be edited/i,
    'edit page should show clear copy that published lesson templates cannot be edited',
  );
  assert.match(
    editSource,
    /disabled={isPublishedTemplate \|\| saving}|disabled={isPublishedTemplate}/,
    'edit page should disable inputs or submit for published lesson templates',
  );
  assert.match(
    editSource,
    /!isPublishedTemplate[\s\S]*data-testid=['"]lesson-edit-save['"]|data-testid=['"]lesson-edit-save['"][\s\S]*!isPublishedTemplate/,
    'edit page should not render an enabled save button for published lesson templates',
  );
});

test('backend rejects archived assignment reactivation before activation update', () => {
  const serviceSource = fs.readFileSync(path.join(repoRoot, 'packages/backend/src/services/content-library.service.ts'), 'utf8');
  const activateAssignmentMatch = serviceSource.match(/public async activateAssignment[\s\S]*?\n\t}/);
  assert.notEqual(activateAssignmentMatch, null, 'activateAssignment method should exist');
  const activateAssignmentSource = activateAssignmentMatch[0];
  assert.match(
    activateAssignmentSource,
    /activateAssignment[\s\S]*if \(assignment\.status === ['"]archived['"]\)[\s\S]*Archived assignments cannot be reactivated/i,
  );

  const archivedGuardIndex = activateAssignmentSource.search(/if \(assignment\.status === ['"]archived['"]\)/);
  const activateUpdateIndex = activateAssignmentSource.search(/status:\s*['"]active['"]/);
  assert.ok(archivedGuardIndex >= 0, 'activateAssignment should check archived status');
  assert.ok(activateUpdateIndex >= 0, 'activateAssignment should set status active');
  assert.ok(archivedGuardIndex < activateUpdateIndex, 'archived guard should run before status active update');
});

test('assignment auto-apply can be edited and persisted', () => {
  const frontendApiSource = fs.readFileSync(path.join(root, 'src/lib/content-library.ts'), 'utf8');
  assert.match(frontendApiSource, /updateAssignment/);
  assert.match(
    frontendApiSource,
    /updateAssignment[\s\S]*(PATCH|PUT|\.patch\(|\.put\()[\s\S]*(content-library\/assignments|assignments)[\s\S]*\$\{id\}/i,
  );

  const routeSource = fs.readFileSync(path.join(repoRoot, 'packages/backend/src/routes/content-library.routes.ts'), 'utf8');
  assert.match(routeSource, /\.(patch|put)\(\s*['"]\/assignments\/:id['"]/i);

  const controllerSource = fs.readFileSync(path.join(repoRoot, 'packages/backend/src/controllers/content-library.controller.ts'), 'utf8');
  assert.match(controllerSource, /updateAssignment/);

  const serviceSource = fs.readFileSync(path.join(repoRoot, 'packages/backend/src/services/content-library.service.ts'), 'utf8');
  assert.match(serviceSource, /updateAssignment/);

  const editSource = fs.readFileSync(path.join(root, 'src/components/AssignmentEdit.tsx'), 'utf8');
  assert.match(editSource, /contentLibraryApi\.updateAssignment/);
  assert.match(editSource, /updateAssignment[\s\S]*auto_apply_new_students|auto_apply_new_students[\s\S]*updateAssignment/);
  assert.match(editSource, /id="assignment-auto-apply"/);

  const autoApplyCheckboxMatch = editSource.match(/<input\b(?=[\s\S]*?id="assignment-auto-apply")[\s\S]*?>/);
  assert.notEqual(autoApplyCheckboxMatch, null, 'assignment-auto-apply checkbox input should exist');
  assert.doesNotMatch(autoApplyCheckboxMatch[0], /\b(disabled|readOnly)\b/);

  assert.doesNotMatch(editSource, /auto-apply[\s\S]{0,200}chỉ đọc/i);
  assert.doesNotMatch(editSource, /chỉ (được )?lưu khi tạo/i);
  assert.doesNotMatch(editSource, /only saved at creation/i);
});

test('assignment edit prevents archived assignments from being reactivated', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/AssignmentEdit.tsx'), 'utf8');
  assert.match(source, /isArchivedAssignment/);
  assert.match(source, /Bài tập lưu trữ không thể được kích hoạt lại/i);
  assert.match(source, /value={option\.value}[\s\S]*disabled={isArchivedAssignment && option\.value === "active"}/);
  assert.match(source, /if \(assignment\?\.status === "archived" && status === "active"\)/);
});

test('teacher status filters remain scoped to own templates in backend content-library service', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'packages/backend/src/services/content-library.service.ts'), 'utf8');
  assert.match(source, /query\.status !== ['"]published['"]/);
  assert.match(source, /filter\.created_by = actor\.id/);
  assert.match(source, /Teacher non-published status filters must stay scoped to owned templates/);
});
