import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateRubricScore, validateRubricContract } from './rubric-grading';

test('validateRubricContract requires criteria total to equal rubric total', () => {
  const rubric = {
    total_points: 4,
    criteria: [
      { key: 'reasoning', title: 'Lập luận', max_points: 2, scoring: 'points' as const },
      { key: 'calculation', title: 'Tính toán', max_points: 2, scoring: 'points' as const },
    ],
  };

  assert.equal(validateRubricContract(rubric), 4);
  assert.throws(
    () => validateRubricContract({ ...rubric, total_points: 5 }),
    /Rubric total points must equal sum of criterion max points/
  );
});

test('validateRubricContract rejects duplicate criteria and invalid level definitions', () => {
  assert.throws(
    () =>
      validateRubricContract({
        total_points: 2,
        criteria: [
          { key: 'solve', title: 'Giải', max_points: 1, scoring: 'points' as const },
          { key: 'SOLVE', title: 'Giải trùng', max_points: 1, scoring: 'points' as const },
        ],
      }),
    /duplicated/
  );

  assert.throws(
    () =>
      validateRubricContract({
        total_points: 2,
        criteria: [{ key: 'proof', title: 'Chứng minh', max_points: 2, scoring: 'levels' as const, levels: [] }],
      }),
    /requires levels/
  );
});

test('calculateRubricScore supports point and level scoring criteria', () => {
  const result = calculateRubricScore(
    {
      total_points: 5,
      criteria: [
        { key: 'model', title: 'Mô hình hóa', max_points: 2, scoring: 'points' },
        {
          key: 'answer',
          title: 'Kết luận',
          max_points: 3,
          scoring: 'levels',
          levels: [
            { label: 'full', points: 3 },
            { label: 'partial', points: 1.5 },
            { label: 'none', points: 0 },
          ],
        },
      ],
    },
    [
      { criterion_key: 'model', points: 1.5 },
      { criterion_key: 'answer', level_label: 'partial' },
    ]
  );

  assert.equal(result.earned_points, 3);
  assert.equal(result.total_points, 5);
  assert.equal(result.percentage, 60);
  assert.deepEqual(result.criteria.map((criterion) => criterion.earned_points), [1.5, 1.5]);
});

test('calculateRubricScore rejects missing or out-of-range criterion scores', () => {
  const rubric = {
    total_points: 2,
    criteria: [{ key: 'calculation', title: 'Tính toán', max_points: 2, scoring: 'points' as const }],
  };

  assert.throws(() => calculateRubricScore(rubric, []), /score for criterion calculation is required/);
  assert.throws(
    () => calculateRubricScore(rubric, [{ criterion_key: 'calculation', points: 2.5 }]),
    /score must be between 0 and max points/
  );
});
