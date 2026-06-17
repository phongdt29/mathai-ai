import assert from "node:assert/strict";
import test from "node:test";

import {
	calculatePercentage,
	calculateRewardPoints,
	normalizeDifficultyMultiplier,
	validateEarnedPoints,
	validateQuestionPoints,
	validateTotalMaxPoints,
} from "./scoring";

test("validateQuestionPoints rejects non-positive question max points", () => {
	assert.throws(
		() => validateQuestionPoints([1, 0, 2]),
		/Question max points must be positive/,
	);
	assert.throws(
		() => validateQuestionPoints([1, -1, 2]),
		/Question max points must be positive/,
	);
});

test("validateQuestionPoints returns the total max points for positive values", () => {
	assert.equal(validateQuestionPoints([1, 2.5, 3]), 6.5);
});

test("validateTotalMaxPoints enforces assignment max equals sum of question points", () => {
	assert.doesNotThrow(() => validateTotalMaxPoints([2, 3], 5));
	assert.throws(
		() => validateTotalMaxPoints([2, 3], 6),
		/Assignment max points must equal sum of question points/,
	);
});

test("validateEarnedPoints rejects earned points outside 0..max", () => {
	assert.throws(
		() => validateEarnedPoints(-0.1, 10),
		/Earned points must be between 0 and max points/,
	);
	assert.throws(
		() => validateEarnedPoints(10.1, 10),
		/Earned points must be between 0 and max points/,
	);
	assert.equal(validateEarnedPoints(7.5, 10), 7.5);
});

test("calculatePercentage rounds to two decimals and handles zero max score", () => {
	assert.equal(calculatePercentage(2, 3), 66.67);
	assert.equal(calculatePercentage(0, 0), 0);
});

test("difficulty multiplier is normalized and capped for reward points", () => {
	assert.equal(normalizeDifficultyMultiplier("easy"), 1);
	assert.equal(normalizeDifficultyMultiplier("medium"), 1.15);
	assert.equal(normalizeDifficultyMultiplier("hard"), 1.3);
	assert.equal(normalizeDifficultyMultiplier("unknown"), 1);
	assert.equal(calculateRewardPoints(10, 20, "hard"), 13);
	assert.equal(calculateRewardPoints(20, 20, "hard"), 20);
});
