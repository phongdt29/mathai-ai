import {
	buildGraphCurves,
	buildTicks,
	niceTickStep,
	parseGraphSpec,
	type GraphSpec,
} from "@/lib/function-graph";

type FunctionGraphProps = {
	/** Nội dung khối ```graph: JSON spec hoặc mỗi dòng "y = <biểu thức>". */
	source: string;
	className?: string;
};

const WIDTH = 560;
const HEIGHT = 380;
const PADDING = { top: 30, right: 18, bottom: 42, left: 46 };

/**
 * Vẽ đồ thị hàm số chính xác từ công thức toán học.
 *
 * Đường cong được lấy mẫu dày và tách đoạn tại tiệm cận đứng nên phản ánh
 * đúng dáng đồ thị thật (parabol, hàm phân thức với hai nhánh hyperbol,
 * lượng giác, mũ/logarit...). Trục tọa độ theo quy ước SGK: mũi tên,
 * nhãn x, y và gốc O.
 */
export default function FunctionGraph({ source, className = "" }: FunctionGraphProps) {
	let spec: GraphSpec;
	try {
		spec = parseGraphSpec(source);
	} catch (error) {
		// Fail-safe: giữ nguyên nội dung gốc nếu spec sai, không làm vỡ trang
		return (
			<pre className="my-2 overflow-x-auto rounded-lg bg-gray-100 p-3 text-sm font-mono text-gray-700">
				{source.trim()}
				{"\n"}
				{`(Không vẽ được đồ thị: ${error instanceof Error ? error.message : "spec không hợp lệ"})`}
			</pre>
		);
	}

	const plotWidth = WIDTH - PADDING.left - PADDING.right;
	const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
	const { xMin, xMax, yMin, yMax } = spec;

	const toPx = (x: number) => PADDING.left + ((x - xMin) / (xMax - xMin)) * plotWidth;
	const toPy = (y: number) => PADDING.top + ((yMax - y) / (yMax - yMin)) * plotHeight;

	const curves = buildGraphCurves(spec);
	const xStep = niceTickStep(xMax - xMin);
	const yStep = niceTickStep(yMax - yMin);
	const xTicks = buildTicks(xMin, xMax, xStep);
	const yTicks = buildTicks(yMin, yMax, yStep);

	const axisX = yMin <= 0 && yMax >= 0 ? toPy(0) : null;
	const axisY = xMin <= 0 && xMax >= 0 ? toPx(0) : null;

	const formatTick = (value: number) =>
		Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

	const clipId = `fg-clip-${Math.abs(hashCode(source))}`;

	return (
		<figure
			className={`my-3 overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm ${className}`}
		>
			<svg
				viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
				role="img"
				aria-label={spec.title ?? curves.map((c) => c.label).join("; ")}
				className="h-auto w-full"
			>
				<defs>
					<clipPath id={clipId}>
						<rect x={PADDING.left} y={PADDING.top} width={plotWidth} height={plotHeight} />
					</clipPath>
				</defs>

				{/* Lưới */}
				<g stroke="#e5e7eb" strokeWidth={1}>
					{xTicks.map((t) => (
						<line key={`gx${t}`} x1={toPx(t)} y1={PADDING.top} x2={toPx(t)} y2={PADDING.top + plotHeight} />
					))}
					{yTicks.map((t) => (
						<line key={`gy${t}`} x1={PADDING.left} y1={toPy(t)} x2={PADDING.left + plotWidth} y2={toPy(t)} />
					))}
				</g>

				{/* Trục tọa độ */}
				<g stroke="#374151" strokeWidth={1.5}>
					{axisX !== null && (
						<>
							<line x1={PADDING.left - 6} y1={axisX} x2={PADDING.left + plotWidth + 8} y2={axisX} />
							<polygon
								points={`${PADDING.left + plotWidth + 14},${axisX} ${PADDING.left + plotWidth + 4},${axisX - 4} ${PADDING.left + plotWidth + 4},${axisX + 4}`}
								fill="#374151"
								stroke="none"
							/>
						</>
					)}
					{axisY !== null && (
						<>
							<line x1={axisY} y1={PADDING.top + plotHeight + 6} x2={axisY} y2={PADDING.top - 8} />
							<polygon
								points={`${axisY},${PADDING.top - 14} ${axisY - 4},${PADDING.top - 4} ${axisY + 4},${PADDING.top - 4}`}
								fill="#374151"
								stroke="none"
							/>
						</>
					)}
				</g>

				{/* Nhãn trục và gốc tọa độ */}
				<g fontFamily="Arial, sans-serif" fontSize={13} fill="#374151">
					{axisX !== null && (
						<text x={PADDING.left + plotWidth + 6} y={axisX - 8} fontStyle="italic">
							x
						</text>
					)}
					{axisY !== null && (
						<text x={axisY + 8} y={PADDING.top - 6} fontStyle="italic">
							y
						</text>
					)}
					{axisX !== null && axisY !== null && (
						<text x={axisY - 14} y={axisX + 16}>
							O
						</text>
					)}
				</g>

				{/* Vạch chia và số trên trục */}
				<g fontFamily="Arial, sans-serif" fontSize={11} fill="#6b7280">
					{axisX !== null &&
						xTicks.map((t) => (
							<g key={`tx${t}`}>
								<line x1={toPx(t)} y1={axisX - 3} x2={toPx(t)} y2={axisX + 3} stroke="#374151" strokeWidth={1} />
								<text x={toPx(t)} y={axisX + 16} textAnchor="middle">
									{formatTick(t)}
								</text>
							</g>
						))}
					{axisY !== null &&
						yTicks.map((t) => (
							<g key={`ty${t}`}>
								<line x1={axisY - 3} y1={toPy(t)} x2={axisY + 3} y2={toPy(t)} stroke="#374151" strokeWidth={1} />
								<text x={axisY - 6} y={toPy(t) + 4} textAnchor="end">
									{formatTick(t)}
								</text>
							</g>
						))}
				</g>

				{/* Tiệm cận */}
				<g clipPath={`url(#${clipId})`}>
					<g stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="6 4">
						{spec.asymptotes.vertical.map((v) => (
							<line key={`av${v}`} x1={toPx(v)} y1={PADDING.top} x2={toPx(v)} y2={PADDING.top + plotHeight} />
						))}
						{spec.asymptotes.horizontal.map((h) => (
							<line key={`ah${h}`} x1={PADDING.left} y1={toPy(h)} x2={PADDING.left + plotWidth} y2={toPy(h)} />
						))}
						{spec.asymptotes.oblique.map((o, index) => (
							<line
								key={`ao${index}`}
								x1={toPx(xMin)}
								y1={toPy(o.slope * xMin + o.intercept)}
								x2={toPx(xMax)}
								y2={toPy(o.slope * xMax + o.intercept)}
							/>
						))}
					</g>

					{/* Đường cong hàm số */}
					{curves.map((curve) =>
						curve.segments.map((segment, segmentIndex) => (
							<polyline
								key={`${curve.label}-${segmentIndex}`}
								points={segment.map((p) => `${toPx(p.x).toFixed(2)},${toPy(p.y).toFixed(2)}`).join(" ")}
								fill="none"
								stroke={curve.color}
								strokeWidth={2.5}
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						)),
					)}
				</g>

				{/* Nhãn tiệm cận */}
				<g fontFamily="Arial, sans-serif" fontSize={11} fill="#6b7280">
					{spec.asymptotes.vertical.map((v) => (
						<text key={`avl${v}`} x={toPx(v) + 4} y={PADDING.top + 12}>
							x = {formatTick(v)}
						</text>
					))}
					{spec.asymptotes.horizontal.map((h) => (
						<text key={`ahl${h}`} x={PADDING.left + plotWidth - 4} y={toPy(h) - 5} textAnchor="end">
							y = {formatTick(h)}
						</text>
					))}
				</g>
			</svg>

			<figcaption className="border-t border-blue-100 bg-blue-50/70 px-4 py-2.5 text-center text-sm text-blue-900">
				{spec.title ? <span className="font-medium">{spec.title}</span> : null}
				<span className={spec.title ? "ml-2 inline-flex flex-wrap justify-center gap-x-3" : "inline-flex flex-wrap justify-center gap-x-3"}>
					{curves.map((curve) => (
						<span key={curve.label} className="inline-flex items-center gap-1.5">
							<span
								aria-hidden
								className="inline-block h-1 w-4 rounded-full"
								style={{ backgroundColor: curve.color }}
							/>
							{curve.label}
						</span>
					))}
				</span>
			</figcaption>
		</figure>
	);
}

function hashCode(value: string): number {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = (hash * 31 + value.charCodeAt(i)) | 0;
	}
	return hash;
}
