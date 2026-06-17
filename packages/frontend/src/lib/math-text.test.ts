import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { normalizeMathDelimiters } from "./math-text";

describe("normalizeMathDelimiters", () => {
	test("\\[...\\] thành $$...$$ (display), không bị escape thành một $", () => {
		assert.equal(
			normalizeMathDelimiters("\\[ x = \\frac{-b}{2a} \\]"),
			"$$ x = \\frac{-b}{2a} $$",
		);
	});

	test("\\(...\\) thành $...$ (inline)", () => {
		assert.equal(normalizeMathDelimiters("Cho \\(x^2\\) dương"), "Cho $x^2$ dương");
	});

	test("không rewrite bên trong code fence và inline code", () => {
		const fenced = "```\nVí dụ: \\(x^2\\)\n```";
		assert.equal(normalizeMathDelimiters(fenced), fenced);

		const inline = "Gõ `\\(x\\)` để viết toán";
		assert.equal(normalizeMathDelimiters(inline), inline);
	});

	test("giữ nguyên $...$ và $$...$$ sẵn có", () => {
		const content = "Inline $x+1$ và display $$y = x^2$$";
		assert.equal(normalizeMathDelimiters(content), content);
	});

	test("khối graph fence được giữ nguyên", () => {
		const content = '```graph\n{"functions": ["(2x+1)/(x-1)"]}\n```';
		assert.equal(normalizeMathDelimiters(content), content);
	});
});
