import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { splitTheoryContent } from "./lesson-content";
import {
	fallbackLessonSummaries,
	getFallbackLessonDetail,
	getFallbackTheorySectionDetail,
	isFallbackLessonId,
} from "./lesson-fallbacks";

describe("lesson fallbacks", () => {
	test("uses namespaced demo ids for fallback lesson summaries", () => {
		const ids = fallbackLessonSummaries.map((lesson) => lesson.id);

		assert.deepEqual(ids, [
			"demo-1",
			"demo-2",
			"demo-3",
			"demo-4",
			"demo-5",
			"demo-6",
		]);
		assert.equal(
			ids.some((id) => /^\d+$/.test(String(id))),
			false,
		);
	});

	test("identifies only namespaced demo lesson ids as endpoint fallbacks", () => {
		assert.equal(isFallbackLessonId("demo-1"), true);
		assert.equal(isFallbackLessonId("demo-6"), true);
		assert.equal(isFallbackLessonId("1"), false);
		assert.equal(isFallbackLessonId(6), false);
		assert.equal(isFallbackLessonId("demo-7"), false);
		assert.equal(isFallbackLessonId("507f1f77bcf86cd799439011"), false);
	});

	test("returns local detail content only for namespaced fallback lessons by default", () => {
		const namespacedDetail = getFallbackLessonDetail("demo-1");
		const numericDetail = getFallbackLessonDetail("1");

		assert.equal(namespacedDetail?._id, "demo-1");
		assert.equal(numericDetail, null);
		assert.equal(
			namespacedDetail?.lesson_title,
			fallbackLessonSummaries[0].title,
		);
		assert.match(
			namespacedDetail?.theory_content ?? "",
			/Phương trình bậc hai/,
		);
		assert.ok(
			(namespacedDetail?.exercises?.length ?? 0) >= 3,
			"demo-1 should include final-check exercises",
		);
	});

	test("provides demo-1 final check exercises for choice, numeric fill-in, and true/false", () => {
		const detail = getFallbackLessonDetail("demo-1");
		const exercises = detail?.exercises ?? [];

		const multipleChoice = exercises.find(
			(exercise) => exercise.answer_type === "multiple_choice",
		);
		assert.ok(multipleChoice, "missing multiple-choice exercise");
		assert.ok(
			multipleChoice.choices?.includes(multipleChoice.correct_answer),
			"multiple-choice correct answer should match one choice",
		);

		const numericFillIn = exercises.find(
			(exercise) => exercise.answer_type === "short_answer",
		);
		assert.ok(numericFillIn, "missing numeric fill-in exercise");
		assert.match(numericFillIn.question_text, /(\u0111i\u1ec1n|nh\u1eadp|k\u1ebft qu\u1ea3|s\u1ed1)/i);
		assert.match(numericFillIn.correct_answer, /^-?\d+(?:[,.]\d+)?$/);

		const trueFalse = exercises.find(
			(exercise) => exercise.answer_type === "true_false",
		);
		assert.ok(trueFalse, "missing true/false exercise");
		assert.match(trueFalse.correct_answer, /^(\u0111\u00fang|sai|true|false)$/i);
	});

	test("provides substantial Vietnamese theory content for every demo lesson", () => {
		for (const summary of fallbackLessonSummaries) {
			const detail = getFallbackLessonDetail(summary.id);
			assert.ok(detail, `Missing fallback detail for ${summary.id}`);

			const contentItems = splitTheoryContent(detail.theory_content);
			assert.ok(
				contentItems.length >= 8,
				`${summary.id} should include at least 8 theory content items`,
			);

			for (const item of contentItems) {
				assert.ok(
					item.length >= 45,
					`${summary.id} has a heading-only or too-short item: ${item}`,
				);
			}

			assert.match(
				detail.theory_content ?? "",
				/(Ví dụ|Cách làm|Lưu ý|Ứng dụng|\d+\s*[+\-*/=<>≤≥]|x\s*[²^]|Δ\s*=)/,
				`${summary.id} should include practical examples, steps, notes, applications, or worked expressions`,
			);
		}
	});

	test("does not map bare numeric ids to fallback section details by default", () => {
		const numericSection = getFallbackTheorySectionDetail("1", 1);
		const namespacedSection = getFallbackTheorySectionDetail("demo-1", 1);

		assert.equal(numericSection, null);
		assert.ok(
			namespacedSection,
			"section lookup should still allow namespaced demo ids",
		);
	});

	test("provides substantial child-page details for every split theory item", () => {
		for (const summary of fallbackLessonSummaries) {
			const detail = getFallbackLessonDetail(summary.id);
			assert.ok(detail, `Missing fallback detail for ${summary.id}`);

			const contentItems = splitTheoryContent(detail.theory_content);
			for (let index = 0; index < contentItems.length; index += 1) {
				const section = getFallbackTheorySectionDetail(summary.id, index + 1);
				assert.ok(
					section,
					`Missing section detail ${index + 1} for ${summary.id}`,
				);
				assert.equal(section.itemNumber, index + 1);
				assert.equal(section.title, contentItems[index]);
				assert.ok(
					section.explanation.length >= 80,
					`${summary.id} section ${index + 1} needs a substantial explanation`,
				);
				assert.ok(
					section.example.length >= 60,
					`${summary.id} section ${index + 1} needs a substantial example`,
				);
				assert.ok(
					section.practice.length >= 50,
					`${summary.id} section ${index + 1} needs a substantial practice prompt`,
				);
			}
		}
	});
});
