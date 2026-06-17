import assert from "node:assert/strict";
import test from "node:test";

import { CurriculumService } from "./curriculum.service";

test("fallback personalized curriculum creates real Vietnamese lessons and exercises", () => {
	const service = new CurriculumService() as any;
	const draft = service.buildFallbackCurriculum(
		{ grade_level: 8 },
		{
			percentage: 25,
			strengths: ["Lũy thừa và phép tính cơ bản: làm đúng 1/1 câu."],
			weaknesses: ["Phân thức đại số: cần củng cố thêm."],
			ai_feedback: "Cần ôn lại nền tảng.",
		},
		{
			title: "Giáo trình toán cá nhân hóa",
			total_modules: 2,
			lessons_per_module: 2,
			exercises_per_lesson: 3,
		},
	);
	const firstLesson = draft.modules[0]?.lessons[0];

	assert.equal(draft.title, "Giáo trình toán cá nhân hóa");
	assert.equal(draft.modules.length, 2);
	assert.equal(firstLesson?.title.includes("Phân thức đại số"), true);
	assert.equal(firstLesson?.exercises.length, 3);
	assert.ok(firstLesson?.end_of_lesson_quiz);
	assert.match(firstLesson?.content ?? "", /Mục tiêu|Kiến thức trọng tâm|Cách tự học/);
	assert.doesNotMatch(firstLesson?.content ?? "", /\bAPI\b|\beasy\b|\bmedium\b|\bhard\b|\btheory\b|\bpractice\b|\bmixed\b/i);

	const savedContent = service.buildLessonContent(firstLesson);
	assert.match(savedContent, /Loại bài học:\*\* Lý thuyết/);
	assert.match(savedContent, /Mức độ:\*\* Cơ bản/);
	assert.doesNotMatch(savedContent, /\btheory\b|\beasy\b/i);
});
