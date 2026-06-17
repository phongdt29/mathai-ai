import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AdaptiveRecommendation } from "./api";
import {
	cleanRecommendationTopics,
	formatClassification,
	getRecommendationDisplaySummary,
} from "./recommendation-ui";

function recommendationFixture(
	overrides: Partial<AdaptiveRecommendation> = {},
): AdaptiveRecommendation {
	return {
		new_lesson: {
			lesson_id: "lesson-1",
			title: "Rút gọn phân thức đại số",
			topic: "Phân thức đại số",
			reason:
				"Bài mới phù hợp tiếp theo dựa trên phân loại đầu vào: trung_binh; điểm quiz gần nhất: 100%; cần ôn: , , , ; cần củng cố: Đại số - Căn bậc hai.",
		},
		review_items: [],
		reinforce_items: [],
		session_structure: {
			review_ratio: 0.2,
			new_ratio: 0.6,
			reinforce_ratio: 0.2,
		},
		signals: {
			last_quiz_score: 100,
			hint_usage_rate: 0,
			avg_time_per_question: null,
			recurring_error_topics: [],
			stability_last_5: 0.5,
			forgetting_risk_topics: [],
		},
		learning_tips: [],
		fallback_reason: null,
		stats: {
			total_lessons: 1,
			completed_lessons: 0,
			remaining_lessons: 1,
			current_streak: 0,
		},
		...overrides,
	};
}

describe("recommendation UI helpers", () => {
	test("cleanRecommendationTopics drops empty, punctuation-only, and duplicate topics", () => {
		assert.deepEqual(
			cleanRecommendationTopics([
				"",
				"   ",
				",",
				"Đại số - Căn bậc hai",
				" đại số - căn bậc hai ",
				"Hình học - tam giác cân",
			]),
			["Đại số - Căn bậc hai", "Hình học - tam giác cân"],
		);
	});

	test("formatClassification turns stored identifiers into student-facing labels", () => {
		assert.equal(formatClassification("trung_binh"), "Trung bình");
		assert.equal(formatClassification("needs_practice"), "Cần luyện tập");
		assert.equal(formatClassification("custom_level"), "Custom Level");
	});

	test("getRecommendationDisplaySummary replaces raw context text with compact personalized UI data", () => {
		const summary = getRecommendationDisplaySummary(
			recommendationFixture({
				signals: {
					last_quiz_score: 100,
					hint_usage_rate: 0,
					avg_time_per_question: null,
					recurring_error_topics: [
						"Đại số - Bài toán lập phương trình",
						"",
						",",
						"Đại số - Căn bậc hai",
						"Hình học - tam giác cân và đường trung tuyến",
						"Đại số - Phương trình bậc nhất một ẩn",
						"Số học - tỉ số và phân số",
					],
					stability_last_5: 0.5,
					forgetting_risk_topics: ["", ",", "   "],
				},
				learning_tips: [
					"Gợi ý được cá nhân hóa theo phân loại đầu vào: trung_binh; cần ôn: , , , .",
					"Làm chậm ở bước biến đổi để tránh sai dấu.",
				],
			}),
		);

		assert.equal(summary.classification, "Trung bình");
		assert.equal(summary.quizScore, "100%");
		assert.equal(summary.friendlyTip, "Làm chậm ở bước biến đổi để tránh sai dấu.");
		assert.deepEqual(
			summary.topicGroups.map((group) => group.label),
			["Cần củng cố"],
		);
		assert.equal(summary.topicGroups[0].topics.length, 4);
		assert.equal(summary.topicGroups[0].hiddenCount, 1);
		assert.doesNotMatch(summary.focusText, /,\s*,/);
	});
});
