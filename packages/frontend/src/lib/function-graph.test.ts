import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
	buildGraphCurves,
	buildTicks,
	compileExpression,
	computeAutoYRange,
	niceTickStep,
	parseGraphSpec,
	sampleSegments,
} from "./function-graph";

describe("compileExpression", () => {
	test("đánh giá đúng các phép toán cơ bản và thứ tự ưu tiên", () => {
		assert.equal(compileExpression("2 + 3 * 4")(0), 14);
		assert.equal(compileExpression("(2 + 3) * 4")(0), 20);
		assert.equal(compileExpression("x^2")(3), 9);
		assert.equal(compileExpression("2^3^2")(0), 512); // kết hợp phải
		assert.equal(compileExpression("-x^2")(2), -4); // -(x^2)
		assert.equal(compileExpression("10 - 4 - 3")(0), 3); // kết hợp trái
	});

	test("hỗ trợ nhân ẩn như SGK: 2x, 2(x+1), (x+1)(x-1)", () => {
		assert.equal(compileExpression("2x")(4), 8);
		assert.equal(compileExpression("2(x + 1)")(4), 10);
		assert.equal(compileExpression("(x + 1)(x - 1)")(3), 8);
		assert.equal(compileExpression("3x^2 - 2x + 1")(2), 9);
	});

	test("hỗ trợ hàm sơ cấp và hằng số", () => {
		assert.ok(Math.abs(compileExpression("sin(pi/2)")(0) - 1) < 1e-12);
		assert.ok(Math.abs(compileExpression("cos(0)")(0) - 1) < 1e-12);
		assert.ok(Math.abs(compileExpression("ln(e)")(0) - 1) < 1e-12);
		assert.equal(compileExpression("log(100)")(0), 2); // log = log10 theo SGK
		assert.equal(compileExpression("sqrt(x)")(16), 4);
		assert.equal(compileExpression("abs(x)")(-5), 5);
		assert.equal(compileExpression("2^x")(10), 1024);
	});

	test("hàm phân thức (2x+1)/(x-1) đúng giá trị và không hữu hạn tại tiệm cận", () => {
		const fn = compileExpression("(2x + 1)/(x - 1)");
		assert.equal(fn(2), 5);
		assert.equal(fn(0), -1);
		assert.ok(!Number.isFinite(fn(1)));
	});

	test("miền xác định: sqrt và log trả NaN ngoài miền", () => {
		assert.ok(Number.isNaN(compileExpression("sqrt(x)")(-1)));
		assert.ok(Number.isNaN(compileExpression("ln(x)")(-2)));
	});

	test("báo lỗi tiếng Việt với biểu thức không hợp lệ", () => {
		assert.throws(() => compileExpression("x +"), /Biểu thức/);
		assert.throws(() => compileExpression("foo(x)"), /không hợp lệ/);
		assert.throws(() => compileExpression("(x + 1"), /ngoặc/);
		assert.throws(() => compileExpression(""), /rỗng/);
	});
});

describe("parseGraphSpec", () => {
	test("đọc spec JSON đầy đủ", () => {
		const spec = parseGraphSpec(
			JSON.stringify({
				title: "Đồ thị hàm phân thức",
				xMin: -4,
				xMax: 6,
				yMin: -4,
				yMax: 8,
				functions: [{ expr: "(2x + 1)/(x - 1)", label: "y = (2x+1)/(x-1)" }],
				asymptotes: { vertical: [1], horizontal: [2] },
			}),
		);
		assert.equal(spec.title, "Đồ thị hàm phân thức");
		assert.equal(spec.functions.length, 1);
		assert.deepEqual(spec.asymptotes.vertical, [1]);
		assert.deepEqual(spec.asymptotes.horizontal, [2]);
		assert.equal(spec.xMin, -4);
		assert.equal(spec.yMax, 8);
	});

	test("đọc dạng rút gọn mỗi dòng một hàm", () => {
		const spec = parseGraphSpec("y = x^2\ny = 2x + 1");
		assert.equal(spec.functions.length, 2);
		assert.equal(spec.functions[0].label, "y = x^2");
		assert.notEqual(spec.functions[0].color, spec.functions[1].color);
	});

	test("tự tính khoảng y khi thiếu", () => {
		const spec = parseGraphSpec(
			JSON.stringify({ functions: ["x^2"], xMin: -3, xMax: 3 }),
		);
		assert.ok(spec.yMin < 0.5);
		assert.ok(spec.yMax >= 7); // x^2 đạt ~9, phân vị 95% ≥ 7
	});

	test("từ chối spec sai", () => {
		assert.throws(() => parseGraphSpec("{ broken json"), /JSON/);
		assert.throws(() => parseGraphSpec("{}"), /không có hàm số/);
		assert.throws(
			() => parseGraphSpec(JSON.stringify({ functions: ["x"], xMin: 5, xMax: 5 })),
			/xMin < xMax/,
		);
		assert.throws(() => parseGraphSpec(JSON.stringify({ functions: ["eval(x)"] })));
	});
});

describe("sampleSegments — tách đoạn tại tiệm cận đứng", () => {
	test("hàm phân thức tách thành 2 nhánh, không nối qua tiệm cận", () => {
		const fn = compileExpression("1/(x - 1)");
		const segments = sampleSegments(fn, -4, 6, -5, 5);
		assert.equal(segments.length, 2);
		// Nhánh trái kết thúc trước x = 1, nhánh phải bắt đầu sau x = 1
		const leftEnd = segments[0][segments[0].length - 1].x;
		const rightStart = segments[1][0].x;
		assert.ok(leftEnd < 1);
		assert.ok(rightStart > 1);
	});

	test("hàm liên tục cho đúng 1 đoạn", () => {
		const segments = sampleSegments(compileExpression("x^2"), -3, 3, 0, 9);
		assert.equal(segments.length, 1);
	});

	test("sqrt(x) bỏ qua miền âm (NaN)", () => {
		const segments = sampleSegments(compileExpression("sqrt(x)"), -4, 4, 0, 2);
		assert.equal(segments.length, 1);
		assert.ok(segments[0][0].x >= 0);
	});

	test("tan(x) tách đoạn tại mỗi tiệm cận trong khoảng", () => {
		const segments = sampleSegments(compileExpression("tan(x)"), -4.5, 4.5, -5, 5);
		// tan có tiệm cận tại ±π/2, ±3π/2 trong khoảng này → ≥ 3 đoạn
		assert.ok(segments.length >= 3);
	});
});

describe("buildGraphCurves", () => {
	test("đường cong của hàm phân thức (2x+1)/(x-1) bám đúng giá trị hàm", () => {
		const spec = parseGraphSpec(
			JSON.stringify({
				functions: ["(2x + 1)/(x - 1)"],
				xMin: -4,
				xMax: 6,
				yMin: -4,
				yMax: 8,
			}),
		);
		const curves = buildGraphCurves(spec);
		assert.equal(curves.length, 1);
		const fn = compileExpression("(2x + 1)/(x - 1)");
		for (const segment of curves[0].segments) {
			for (const point of segment) {
				const expected = fn(point.x);
				if (expected >= -16 && expected <= 20) {
					// trong vùng không bị giới hạn (clamp)
					assert.ok(
						Math.abs(point.y - expected) < 1e-9,
						`sai tại x=${point.x}: ${point.y} != ${expected}`,
					);
				}
			}
		}
	});
});

describe("trục và vạch chia", () => {
	test("niceTickStep trả bước 1-2-5", () => {
		assert.equal(niceTickStep(10), 2);
		assert.equal(niceTickStep(8), 1);
		assert.equal(niceTickStep(100), 20);
		assert.equal(niceTickStep(0.8), 0.1);
	});

	test("buildTicks không chứa 0 (tránh đè gốc O) và phủ đúng khoảng", () => {
		const ticks = buildTicks(-5, 5, 1);
		assert.ok(!ticks.includes(0));
		assert.equal(ticks[0], -5);
		assert.equal(ticks[ticks.length - 1], 5);
	});
});

describe("computeAutoYRange", () => {
	test("khoảng y bỏ qua đuôi tiệm cận của hàm phân thức", () => {
		const range = computeAutoYRange(
			[{ expr: "1/(x - 1)", label: "", color: "#000" }],
			-4,
			6,
		);
		// 1/(x-1) bùng nổ tới ±300 gần tiệm cận; phân vị 5-95% giữ khoảng gọn
		assert.ok(range.yMax <= 20);
		assert.ok(range.yMin >= -20);
		assert.ok(range.yMax > range.yMin);
	});
});
