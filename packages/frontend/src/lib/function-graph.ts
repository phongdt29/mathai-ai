/**
 * Thư viện vẽ đồ thị hàm số từ công thức toán học.
 *
 * - compileExpression: parser biểu thức an toàn (không dùng eval),
 *   hỗ trợ +, -, *, /, ^, ngoặc, nhân ẩn (2x, 2(x+1)), hàm sơ cấp
 *   (sin, cos, tan, cot, sqrt, abs, ln, log, exp...) và hằng số pi, e.
 * - parseGraphSpec: đọc spec đồ thị từ khối ```graph (JSON hoặc dạng rút gọn
 *   "y = x^2" mỗi dòng một hàm).
 * - buildGraphGeometry: lấy mẫu hàm số, tách đoạn tại điểm gián đoạn
 *   (tiệm cận đứng) để đường vẽ phản ánh đúng đồ thị thật.
 */

export type CompiledFunction = (x: number) => number;

export type GraphFunctionSpec = {
	expr: string;
	label: string;
	color: string;
};

export type GraphAsymptotes = {
	vertical: number[];
	horizontal: number[];
	oblique: Array<{ slope: number; intercept: number; label?: string }>;
};

export type GraphSpec = {
	title: string | null;
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
	functions: GraphFunctionSpec[];
	asymptotes: GraphAsymptotes;
};

export type GraphSegment = Array<{ x: number; y: number }>;

export type GraphCurve = {
	label: string;
	color: string;
	segments: GraphSegment[];
};

export const GRAPH_COLORS = ["#2563eb", "#ea580c", "#16a34a", "#7c3aed"];

const MAX_FUNCTIONS = 4;
const DEFAULT_X_MIN = -5;
const DEFAULT_X_MAX = 5;
const DEFAULT_SAMPLES = 600;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
	| { kind: "number"; value: number }
	| { kind: "ident"; name: string }
	| { kind: "op"; op: "+" | "-" | "*" | "/" | "^" }
	| { kind: "lparen" }
	| { kind: "rparen" };

const FUNCTIONS: Record<string, (v: number) => number> = {
	sin: Math.sin,
	cos: Math.cos,
	tan: Math.tan,
	cot: (v) => Math.cos(v) / Math.sin(v),
	asin: Math.asin,
	acos: Math.acos,
	atan: Math.atan,
	arcsin: Math.asin,
	arccos: Math.acos,
	arctan: Math.atan,
	sqrt: Math.sqrt,
	cbrt: Math.cbrt,
	abs: Math.abs,
	exp: Math.exp,
	ln: Math.log,
	log: Math.log10,
	lg: Math.log10,
	log10: Math.log10,
	log2: Math.log2,
	floor: Math.floor,
	ceil: Math.ceil,
};

const CONSTANTS: Record<string, number> = {
	pi: Math.PI,
	e: Math.E,
};

function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	const input = source.replace(/π/g, "pi").replace(/\*\*/g, "^");
	let i = 0;

	while (i < input.length) {
		const ch = input[i];

		if (/\s/.test(ch)) {
			i += 1;
			continue;
		}

		if (/[0-9.]/.test(ch)) {
			const match = input.slice(i).match(/^(?:\d+(?:\.\d+)?|\.\d+)/);
			if (!match) {
				throw new Error(`Số không hợp lệ tại vị trí ${i + 1}`);
			}
			tokens.push({ kind: "number", value: Number(match[0]) });
			i += match[0].length;
			continue;
		}

		if (/[a-zA-Z]/.test(ch)) {
			const match = input.slice(i).match(/^[a-zA-Z][a-zA-Z0-9]*/);
			const name = match ? match[0] : ch;
			tokens.push({ kind: "ident", name });
			i += name.length;
			continue;
		}

		if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^") {
			tokens.push({ kind: "op", op: ch });
			i += 1;
			continue;
		}

		if (ch === "(") {
			tokens.push({ kind: "lparen" });
			i += 1;
			continue;
		}

		if (ch === ")") {
			tokens.push({ kind: "rparen" });
			i += 1;
			continue;
		}

		throw new Error(`Ký tự không hợp lệ trong biểu thức: "${ch}"`);
	}

	return tokens;
}

// ---------------------------------------------------------------------------
// Parser (đệ quy xuống, ưu tiên chuẩn: ^ > nhân/chia > cộng/trừ)
// ---------------------------------------------------------------------------

type AstNode =
	| { kind: "number"; value: number }
	| { kind: "variable" }
	| { kind: "constant"; value: number }
	| { kind: "unary"; node: AstNode }
	| { kind: "binary"; op: "+" | "-" | "*" | "/" | "^"; left: AstNode; right: AstNode }
	| { kind: "call"; fn: (v: number) => number; arg: AstNode };

class Parser {
	private pos = 0;

	constructor(private readonly tokens: Token[]) {}

	parse(): AstNode {
		if (this.tokens.length === 0) {
			throw new Error("Biểu thức rỗng");
		}
		const node = this.parseExpression();
		if (this.pos < this.tokens.length) {
			throw new Error("Biểu thức có phần thừa không phân tích được");
		}
		return node;
	}

	private peek(): Token | undefined {
		return this.tokens[this.pos];
	}

	private next(): Token | undefined {
		return this.tokens[this.pos++];
	}

	private parseExpression(): AstNode {
		let left = this.parseTerm();
		for (;;) {
			const token = this.peek();
			if (token?.kind === "op" && (token.op === "+" || token.op === "-")) {
				this.next();
				const right = this.parseTerm();
				left = { kind: "binary", op: token.op, left, right };
				continue;
			}
			return left;
		}
	}

	private parseTerm(): AstNode {
		let left = this.parseUnary();
		for (;;) {
			const token = this.peek();
			if (token?.kind === "op" && (token.op === "*" || token.op === "/")) {
				this.next();
				const right = this.parseUnary();
				left = { kind: "binary", op: token.op, left, right };
				continue;
			}
			// Nhân ẩn: "2x", "2(x+1)", "x sin(x)", "(x+1)(x-1)"
			if (
				token &&
				(token.kind === "number" || token.kind === "ident" || token.kind === "lparen")
			) {
				const right = this.parseUnary();
				left = { kind: "binary", op: "*", left, right };
				continue;
			}
			return left;
		}
	}

	private parseUnary(): AstNode {
		const token = this.peek();
		if (token?.kind === "op" && (token.op === "-" || token.op === "+")) {
			this.next();
			const node = this.parseUnary();
			return token.op === "-" ? { kind: "unary", node } : node;
		}
		return this.parsePower();
	}

	private parsePower(): AstNode {
		const base = this.parseAtom();
		const token = this.peek();
		if (token?.kind === "op" && token.op === "^") {
			this.next();
			// Lũy thừa kết hợp phải: 2^3^2 = 2^(3^2)
			const exponent = this.parseUnary();
			return { kind: "binary", op: "^", left: base, right: exponent };
		}
		return base;
	}

	private parseAtom(): AstNode {
		const token = this.next();
		if (!token) {
			throw new Error("Biểu thức kết thúc đột ngột");
		}

		if (token.kind === "number") {
			return { kind: "number", value: token.value };
		}

		if (token.kind === "lparen") {
			const node = this.parseExpression();
			const closing = this.next();
			if (!closing || closing.kind !== "rparen") {
				throw new Error("Thiếu dấu ngoặc đóng");
			}
			return node;
		}

		if (token.kind === "ident") {
			const lower = token.name.toLowerCase();
			if (lower === "x") {
				return { kind: "variable" };
			}
			if (lower in CONSTANTS) {
				return { kind: "constant", value: CONSTANTS[lower] };
			}
			if (lower in FUNCTIONS) {
				const argToken = this.next();
				if (!argToken || argToken.kind !== "lparen") {
					throw new Error(`Hàm ${token.name} cần dấu ngoặc: ${token.name}(...)`);
				}
				const arg = this.parseExpression();
				const closing = this.next();
				if (!closing || closing.kind !== "rparen") {
					throw new Error("Thiếu dấu ngoặc đóng");
				}
				return { kind: "call", fn: FUNCTIONS[lower], arg };
			}
			throw new Error(`Tên không hợp lệ trong biểu thức: "${token.name}"`);
		}

		throw new Error("Biểu thức không hợp lệ");
	}
}

function evaluateAst(node: AstNode, x: number): number {
	switch (node.kind) {
		case "number":
			return node.value;
		case "constant":
			return node.value;
		case "variable":
			return x;
		case "unary":
			return -evaluateAst(node.node, x);
		case "call":
			return node.fn(evaluateAst(node.arg, x));
		case "binary": {
			const left = evaluateAst(node.left, x);
			const right = evaluateAst(node.right, x);
			switch (node.op) {
				case "+":
					return left + right;
				case "-":
					return left - right;
				case "*":
					return left * right;
				case "/":
					return left / right;
				case "^":
					return Math.pow(left, right);
			}
		}
	}
}

/**
 * Biên dịch biểu thức toán học (biến x) thành hàm số an toàn.
 * Ném Error với thông báo tiếng Việt nếu biểu thức không hợp lệ.
 */
export function compileExpression(expr: string): CompiledFunction {
	const ast = new Parser(tokenize(expr)).parse();
	return (x: number) => evaluateAst(ast, x);
}

// ---------------------------------------------------------------------------
// Graph spec
// ---------------------------------------------------------------------------

function toFiniteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeFunctions(raw: unknown): Array<{ expr: string; label?: string; color?: string }> {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item) => {
			if (typeof item === "string") return { expr: item };
			if (item && typeof item === "object") {
				const record = item as Record<string, unknown>;
				const expr = typeof record.expr === "string" ? record.expr : null;
				if (!expr) return null;
				return {
					expr,
					label: typeof record.label === "string" ? record.label : undefined,
					color: typeof record.color === "string" ? record.color : undefined,
				};
			}
			return null;
		})
		.filter((item): item is { expr: string; label?: string; color?: string } => item !== null);
}

function normalizeAsymptotes(raw: unknown): GraphAsymptotes {
	const empty: GraphAsymptotes = { vertical: [], horizontal: [], oblique: [] };
	if (!raw || typeof raw !== "object") return empty;
	const record = raw as Record<string, unknown>;

	const numbers = (value: unknown): number[] =>
		Array.isArray(value)
			? value.map(toFiniteNumber).filter((v): v is number => v !== null)
			: [];

	type ObliqueAsymptote = GraphAsymptotes["oblique"][number];
	const oblique = Array.isArray(record.oblique)
		? record.oblique
				.map((item): ObliqueAsymptote | null => {
					if (!item || typeof item !== "object") return null;
					const entry = item as Record<string, unknown>;
					const slope = toFiniteNumber(entry.slope);
					const intercept = toFiniteNumber(entry.intercept);
					if (slope === null || intercept === null) return null;
					return {
						slope,
						intercept,
						...(typeof entry.label === "string" ? { label: entry.label } : {}),
					};
				})
				.filter((v): v is ObliqueAsymptote => v !== null)
		: [];

	return {
		vertical: numbers(record.vertical),
		horizontal: numbers(record.horizontal),
		oblique,
	};
}

/** Dạng rút gọn: mỗi dòng "y = <biểu thức>" hoặc chỉ "<biểu thức>". */
function parseShorthand(source: string): Array<{ expr: string; label?: string }> {
	return source
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const match = line.match(/^y\s*=\s*(.+)$/i);
			const expr = match ? match[1].trim() : line;
			return { expr, label: `y = ${expr}` };
		});
}

/**
 * Đọc spec đồ thị từ nội dung khối ```graph.
 * Chấp nhận JSON ({functions, xMin, xMax, yMin, yMax, title, asymptotes})
 * hoặc dạng rút gọn mỗi dòng một hàm: "y = x^2 - 2x + 1".
 */
export function parseGraphSpec(source: string): GraphSpec {
	const trimmed = source.trim();
	if (!trimmed) {
		throw new Error("Khối graph rỗng");
	}

	let rawFunctions: Array<{ expr: string; label?: string; color?: string }>;
	let title: string | null = null;
	let xMin = DEFAULT_X_MIN;
	let xMax = DEFAULT_X_MAX;
	let yMin: number | null = null;
	let yMax: number | null = null;
	let asymptotes: GraphAsymptotes = { vertical: [], horizontal: [], oblique: [] };

	if (trimmed.startsWith("{")) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			throw new Error("Khối graph không phải JSON hợp lệ");
		}
		const record = parsed as Record<string, unknown>;
		rawFunctions = normalizeFunctions(record.functions);
		title = typeof record.title === "string" ? record.title : null;
		xMin = toFiniteNumber(record.xMin) ?? DEFAULT_X_MIN;
		xMax = toFiniteNumber(record.xMax) ?? DEFAULT_X_MAX;
		yMin = toFiniteNumber(record.yMin);
		yMax = toFiniteNumber(record.yMax);
		asymptotes = normalizeAsymptotes(record.asymptotes);
	} else {
		rawFunctions = parseShorthand(trimmed);
	}

	if (rawFunctions.length === 0) {
		throw new Error("Khối graph không có hàm số nào");
	}
	if (xMin >= xMax) {
		throw new Error("Khoảng x không hợp lệ: cần xMin < xMax");
	}

	const functions: GraphFunctionSpec[] = rawFunctions
		.slice(0, MAX_FUNCTIONS)
		.map((fn, index) => {
			// Biên dịch ngay để báo lỗi sớm nếu biểu thức sai
			compileExpression(fn.expr);
			return {
				expr: fn.expr,
				label: fn.label ?? `y = ${fn.expr}`,
				color: fn.color ?? GRAPH_COLORS[index % GRAPH_COLORS.length],
			};
		});

	if (yMin === null || yMax === null || yMin >= yMax) {
		const autoRange = computeAutoYRange(functions, xMin, xMax);
		yMin = autoRange.yMin;
		yMax = autoRange.yMax;
	}

	return { title, xMin, xMax, yMin, yMax, functions, asymptotes };
}

/**
 * Tự tính khoảng y hợp lý: lấy phân vị 5%-95% của các giá trị hữu hạn
 * để tiệm cận đứng không kéo dãn toàn bộ đồ thị.
 */
export function computeAutoYRange(
	functions: GraphFunctionSpec[],
	xMin: number,
	xMax: number,
): { yMin: number; yMax: number } {
	const values: number[] = [];
	for (const fn of functions) {
		const compiled = compileExpression(fn.expr);
		for (let i = 0; i <= DEFAULT_SAMPLES; i++) {
			const x = xMin + ((xMax - xMin) * i) / DEFAULT_SAMPLES;
			const y = compiled(x);
			if (Number.isFinite(y)) {
				values.push(y);
			}
		}
	}

	if (values.length === 0) {
		return { yMin: -5, yMax: 5 };
	}

	values.sort((a, b) => a - b);
	const pick = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))];
	let low = pick(0.05);
	let high = pick(0.95);

	const pad = Math.max((high - low) * 0.15, 0.5);
	low -= pad;
	high += pad;

	if (high - low < 4) {
		const mid = (high + low) / 2;
		low = mid - 2;
		high = mid + 2;
	}

	return { yMin: roundNice(low, false), yMax: roundNice(high, true) };
}

function roundNice(value: number, up: boolean): number {
	const rounded = up ? Math.ceil(value) : Math.floor(value);
	return Object.is(rounded, -0) ? 0 : rounded;
}

// ---------------------------------------------------------------------------
// Geometry: lấy mẫu và tách đoạn tại điểm gián đoạn
// ---------------------------------------------------------------------------

/**
 * Lấy mẫu một hàm và tách thành các đoạn liên tục.
 * Đoạn bị ngắt khi: giá trị không hữu hạn (NaN/∞) hoặc bước nhảy giữa hai
 * mẫu liền kề vượt quá 2 lần chiều cao khung nhìn (dấu hiệu tiệm cận đứng) —
 * nhờ đó không vẽ đường nối giả qua tiệm cận.
 */
export function sampleSegments(
	fn: CompiledFunction,
	xMin: number,
	xMax: number,
	yMin: number,
	yMax: number,
	samples: number = DEFAULT_SAMPLES,
): GraphSegment[] {
	const span = yMax - yMin;
	const clampLimit = span * 2;
	const segments: GraphSegment[] = [];
	let current: GraphSegment = [];
	let previousY: number | null = null;

	const flush = () => {
		if (current.length >= 2) {
			segments.push(current);
		}
		current = [];
	};

	for (let i = 0; i <= samples; i++) {
		const x = xMin + ((xMax - xMin) * i) / samples;
		const rawY = fn(x);

		if (!Number.isFinite(rawY)) {
			flush();
			previousY = null;
			continue;
		}

		// Ngắt đoạn khi nhảy vọt qua tiệm cận đứng
		if (previousY !== null && Math.abs(rawY - previousY) > clampLimit) {
			flush();
		}

		// Giới hạn giá trị để đường vẽ thoát khỏi khung theo phương dọc
		const y = Math.max(yMin - span, Math.min(yMax + span, rawY));
		current.push({ x, y });
		previousY = rawY;
	}

	flush();
	return segments;
}

/** Tính toàn bộ hình học các đường cong cho một spec. */
export function buildGraphCurves(spec: GraphSpec, samples: number = DEFAULT_SAMPLES): GraphCurve[] {
	return spec.functions.map((fn) => ({
		label: fn.label,
		color: fn.color,
		segments: sampleSegments(
			compileExpression(fn.expr),
			spec.xMin,
			spec.xMax,
			spec.yMin,
			spec.yMax,
			samples,
		),
	}));
}

/** Bước chia trục dạng đẹp: 1, 2, 5 × 10^k. */
export function niceTickStep(span: number, targetTicks: number = 8): number {
	const rough = span / targetTicks;
	const power = Math.pow(10, Math.floor(Math.log10(rough)));
	const ratio = rough / power;
	if (ratio <= 1) return power;
	if (ratio <= 2) return 2 * power;
	if (ratio <= 5) return 5 * power;
	return 10 * power;
}

/** Danh sách vạch chia trên một khoảng (không gồm 0 để tránh đè lên gốc O). */
export function buildTicks(min: number, max: number, step: number): number[] {
	const ticks: number[] = [];
	const start = Math.ceil(min / step) * step;
	for (let v = start; v <= max + step / 1000; v += step) {
		const rounded = Math.round(v / step) * step;
		const normalized = Math.abs(rounded) < step / 1000 ? 0 : Number(rounded.toFixed(10));
		if (normalized !== 0) {
			ticks.push(normalized);
		}
	}
	return ticks;
}
