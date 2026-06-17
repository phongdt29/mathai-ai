import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ExerciseTemplateModel,
  MathQuestionBankItemModel,
  MathRubricContractModel,
  mathQuestionBankItemRepository,
} from './content-library.model';

test('math question bank item schema supports additive math taxonomy metadata and indexes', () => {
  const item = new MathQuestionBankItemModel({
    title: 'Giải phương trình bậc nhất một ẩn',
    grade_level: 7,
    math_topic: 'Đại số',
    math_topic_path: ['Toán 7', 'Đại số', 'Phương trình bậc nhất'],
    difficulty_level: 'medium',
    question_type: 'calculation',
    question_text: 'Giải phương trình 2x + 3 = 11.',
    correct_answer: 'x = 4',
    solution_steps: ['Trừ hai vế cho 3', 'Chia hai vế cho 2'],
    source: 'manual',
    status: 'review',
    max_points: 2,
    learning_objectives: [
      { objective_id: 'M7-ALG-EQ-01', description: 'Giải phương trình bậc nhất một ẩn' },
    ],
    prerequisite_objectives: [{ objective_id: 'M6-ALG-OPS-01' }],
    tags: ['linear-equation'],
  });

  const validationError = item.validateSync();
  assert.equal(validationError, undefined);
  assert.equal(item.grade_level, 7);
  assert.equal(item.math_topic, 'Đại số');
  assert.equal(item.learning_objectives[0].objective_id, 'M7-ALG-EQ-01');

  const indexSpecs = MathQuestionBankItemModel.schema.indexes().map(([fields]) => fields);
  assert.ok(
    indexSpecs.some(
      (fields) =>
        fields.grade_level === 1 &&
        fields.math_topic === 1 &&
        fields.difficulty_level === 1 &&
        fields.status === 1
    )
  );
});

test('exercise template keeps old required shape while accepting optional taxonomy fields', () => {
  const legacyExercise = new ExerciseTemplateModel({
    lesson_template_id: '665f1a000000000000000001',
    topic: 'Số học',
    difficulty_level: 'easy',
    question_text: '1 + 1 = ?',
    answer_type: 'short_answer',
    correct_answer: '2',
    order_index: 1,
  });

  assert.equal(legacyExercise.validateSync(), undefined);
  assert.equal(legacyExercise.question_bank_status, null);

  const enrichedExercise = new ExerciseTemplateModel({
    lesson_template_id: '665f1a000000000000000001',
    topic: 'Hình học',
    difficulty_level: 'hard',
    question_text: 'Chứng minh hai tam giác bằng nhau.',
    answer_type: 'essay',
    correct_answer: 'Theo trường hợp cạnh-góc-cạnh',
    order_index: 2,
    grade_level: 8,
    math_topic: 'Hình học',
    math_topic_path: ['Toán 8', 'Hình học', 'Tam giác'],
    question_type: 'proof',
    source: 'textbook',
    question_bank_status: 'approved',
    learning_objectives: [{ objective_id: 'M8-GEO-TRI-02' }],
  });

  assert.equal(enrichedExercise.validateSync(), undefined);
  assert.equal(enrichedExercise.grade_level, 8);
  assert.equal(enrichedExercise.question_type, 'proof');
});

test('math rubric contract schema validates criteria and attachment metadata', () => {
  const rubric = new MathRubricContractModel({
    title: 'Rubric bài giải phương trình',
    attachment_type: 'question_bank_item',
    question_bank_item_id: '665f1a000000000000000002',
    grade_level: 7,
    math_topic: 'Đại số',
    difficulty_level: 'medium',
    total_points: 4,
    status: 'active',
    criteria: [
      { key: 'setup', title: 'Thiết lập phép biến đổi', max_points: 1, scoring: 'points' },
      {
        key: 'solve',
        title: 'Tính toán nghiệm',
        max_points: 3,
        scoring: 'levels',
        levels: [
          { label: 'full', points: 3 },
          { label: 'partial', points: 1.5 },
          { label: 'none', points: 0 },
        ],
      },
    ],
  });

  assert.equal(rubric.validateSync(), undefined);
  assert.equal(rubric.criteria.length, 2);
  assert.equal(rubric.criteria[1].levels?.[0].points, 3);

  const indexSpecs = MathRubricContractModel.schema.indexes().map(([fields]) => fields);
  assert.ok(
    indexSpecs.some(
      (fields) =>
        fields.grade_level === 1 &&
        fields.math_topic === 1 &&
        fields.difficulty_level === 1 &&
        fields.status === 1
    )
  );
});

test('math question bank repository builds taxonomy query sorted for review workflows', async () => {
  const originalFind = mathQuestionBankItemRepository.model.find;
  const captured: any = {};

  (mathQuestionBankItemRepository.model.find as any) = (filters: any) => {
    captured.filters = filters;
    return {
      sort(sortSpec: any) {
        captured.sort = sortSpec;
        return this;
      },
      exec: async () => [],
    };
  };

  try {
    await mathQuestionBankItemRepository.findByTaxonomy({
      grade_level: 7,
      math_topic: 'Đại số',
      difficulty_level: 'medium',
      status: 'published',
    });
  } finally {
    mathQuestionBankItemRepository.model.find = originalFind;
  }

  assert.deepEqual(captured.filters, {
    grade_level: 7,
    math_topic: 'Đại số',
    difficulty_level: 'medium',
    status: 'published',
  });
  assert.deepEqual(captured.sort, { grade_level: 1, math_topic: 1, difficulty_level: 1, createdAt: -1 });
});
