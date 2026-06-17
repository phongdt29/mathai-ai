import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_AI_TUTORS,
  DEFAULT_DEMO_PASSWORD,
  DEMO_STUDENT_PROFILE,
  DEMO_USERS,
  SAMPLE_CONTENT,
  assertUniqueSeedKeys,
  getDemoEmails,
  getSeedRecommendedDate,
} from './seed';

test('seed fixtures use stable unique keys for idempotent upserts', () => {
  assert.doesNotThrow(() => assertUniqueSeedKeys());
  assert.deepEqual(getDemoEmails(), ['admin@mathai.vn', 'teacher@mathai.vn', 'student@mathai.vn', 'parent@mathai.vn', 'staff@mathai.vn']);
  assert.equal(new Set(DEFAULT_AI_TUTORS.map((tutor) => tutor.code)).size, DEFAULT_AI_TUTORS.length);
});

test('demo student profile contains required onboarding fields from datta.txt', () => {
  assert.equal(DEMO_STUDENT_PROFILE.grade_level, 8);
  assert.equal(DEMO_STUDENT_PROFILE.self_assessed_level, 'kha');
  assert.equal(DEMO_STUDENT_PROFILE.math_average_score, 7.2);
  assert.equal(DEMO_STUDENT_PROFILE.preferred_teacher_gender, 'co');
  assert.ok(DEMO_STUDENT_PROFILE.date_of_birth instanceof Date);
  assert.ok(DEMO_STUDENT_PROFILE.phone.length > 0);
  assert.ok(DEMO_STUDENT_PROFILE.address.length > 0);
  assert.ok(DEMO_STUDENT_PROFILE.school_name.length > 0);
  assert.ok(DEMO_STUDENT_PROFILE.favorite_color.length > 0);
  assert.ok(DEMO_STUDENT_PROFILE.interests.length > 0);
});

test('seed sample lesson provides quiz exercises without requiring an AI provider', () => {
  assert.equal(SAMPLE_CONTENT.curriculumTitle.length > 0, true);
  assert.equal(SAMPLE_CONTENT.exercises.length >= 3, true);
  assert.ok(SAMPLE_CONTENT.exercises.every((exercise) => exercise.question_text && exercise.correct_answer));
});

test('seed demo password is explicit dev-staging password and recommendation date is deterministic per day', () => {
  assert.equal(DEFAULT_DEMO_PASSWORD, 'MathAI@Demo123');
  assert.equal(getSeedRecommendedDate(new Date('2026-05-06T15:34:21.000Z')), '2026-05-06');
});

test('demo users include all login roles used by frontend demo login', () => {
  const roles = new Set(DEMO_USERS.map((user) => user.role));
  assert.deepEqual(roles, new Set(['admin', 'teacher', 'student', 'parent', 'staff']));
});
