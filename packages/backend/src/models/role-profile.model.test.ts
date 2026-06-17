import assert from 'node:assert/strict';
import test from 'node:test';

import { ParentProfileModel, RoleProfileModel, StaffProfileModel, TeacherProfileModel } from './role-profile.model';

test('role profile schemas are additive and keep user role enum unchanged', () => {
  const rolePath = RoleProfileModel.schema.path('role') as unknown as { enumValues: string[] };
  assert.deepEqual([...rolePath.enumValues].sort(), ['admin', 'parent', 'student', 'teacher']);

  assert.ok(RoleProfileModel.schema.path('metadata'));
  assert.ok(StaffProfileModel.schema.path('permissions_metadata'));
  assert.ok(TeacherProfileModel.schema.path('metadata'));
  assert.ok(ParentProfileModel.schema.path('metadata'));
});

test('role profile schemas define unique user-scoped indexes', () => {
  const roleIndexes = RoleProfileModel.schema.indexes();
  const staffIndexes = StaffProfileModel.schema.indexes();
  const teacherIndexes = TeacherProfileModel.schema.indexes();
  const parentIndexes = ParentProfileModel.schema.indexes();

  assert.ok(roleIndexes.some(([fields, options]) => fields.user_id === 1 && fields.role === 1 && options?.unique === true));
  assert.ok(staffIndexes.some(([fields, options]) => fields.user_id === 1 && options?.unique === true));
  assert.ok(teacherIndexes.some(([fields, options]) => fields.user_id === 1 && options?.unique === true));
  assert.ok(parentIndexes.some(([fields, options]) => fields.user_id === 1 && options?.unique === true));
});
