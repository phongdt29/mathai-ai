/**
 * Quy chuẩn định dạng toán học dùng chung cho mọi prompt AI.
 *
 * Frontend render bằng remark-math + rehype-katex, chỉ nhận $...$ và $$...$$.
 * KHÔNG hướng dẫn AI dùng \( \) hay \[ \]:
 * - Trong JSON, "\(" là escape không hợp lệ → JSON.parse thất bại, toàn bộ
 *   giáo trình AI bị loại bỏ và học sinh nhận nội dung placeholder.
 * - Trong markdown thường, $...$ vẫn là dạng chuẩn ít rủi ro nhất.
 */
export const MATH_FORMAT_GUIDELINES = [
	'QUY CHUẨN VIẾT CÔNG THỨC TOÁN:',
	'- Mọi công thức viết bằng LaTeX tương thích KaTeX: inline dùng $...$, công thức đứng riêng dòng dùng $$...$$.',
	'- KHÔNG dùng \\( \\) hoặc \\[ \\]. KHÔNG viết ký hiệu thô như x^2, sqrt(x), 3/4, <=, != — thay bằng $x^2$, $\\sqrt{x}$, $\\dfrac{3}{4}$, $\\le$, $\\ne$.',
	'- Dùng đúng thuật ngữ toán học tiếng Việt theo SGK (GDPT 2018): "tiệm cận đứng/tiệm cận ngang" (không viết "tiềm cận"), "biệt thức", "hệ số góc", "điều kiện xác định"... Kiểm tra chính tả tiếng Việt cẩn thận.',
	'- Tự tính lại mọi kết quả số trước khi trả về; đáp án và các bước giải phải nhất quán với nhau.',
].join('\n');

/**
 * Quy chuẩn bổ sung khi công thức nằm trong chuỗi JSON: backslash phải escape kép.
 */
export const MATH_FORMAT_JSON_GUIDELINES = [
	MATH_FORMAT_GUIDELINES,
	'- Vì nội dung nằm trong chuỗi JSON, mọi backslash của LaTeX phải được escape kép: viết "$\\\\dfrac{1}{2}$", "$\\\\sqrt{x}$" trong JSON để khi parse ra còn "$\\dfrac{1}{2}$", "$\\sqrt{x}$".',
	'- Với câu trắc nghiệm: correct_answer phải trùng khớp 100% với đúng một phần tử trong options, và mỗi câu multiple_choice phải có đúng 4 options.',
	'- Với câu điền số (short_answer): correct_answer ghi giá trị số ở dạng chính tắc (ví dụ "1/2" hoặc "0,5"), không kèm lời giải thích.',
].join('\n');

/**
 * Hướng dẫn AI nhúng đồ thị hàm số bằng khối ```graph — frontend sẽ vẽ
 * đồ thị chính xác từ công thức (component FunctionGraph).
 */
export const GRAPH_BLOCK_GUIDELINES = [
	'VẼ ĐỒ THỊ HÀM SỐ:',
	'- Khi cần minh họa đồ thị hàm số (khảo sát hàm số, hàm bậc nhất/bậc hai, hàm phân thức, lượng giác, mũ/logarit), thêm một khối code fence với ngôn ngữ graph chứa JSON theo mẫu:',
	'```graph',
	'{"title": "Đồ thị hàm số y = (2x+1)/(x-1)", "xMin": -4, "xMax": 6, "yMin": -4, "yMax": 8, "functions": [{"expr": "(2x+1)/(x-1)", "label": "y = (2x+1)/(x-1)"}], "asymptotes": {"vertical": [1], "horizontal": [2]}}',
	'```',
	'- Trường expr dùng cú pháp: biến x; phép toán + - * / ^; hàm sin, cos, tan, cot, sqrt, abs, ln, log, exp; hằng số pi, e; hỗ trợ nhân ẩn như 2x, 2(x+1).',
	'- Với hàm phân thức $y = \\dfrac{ax+b}{cx+d}$, luôn khai báo asymptotes: tiệm cận đứng x = -d/c và tiệm cận ngang y = a/c (tính giá trị số cụ thể).',
	'- Chọn xMin/xMax/yMin/yMax sao cho các điểm đặc biệt (đỉnh, giao điểm với trục, tiệm cận) nằm trong khung nhìn.',
].join('\n');
