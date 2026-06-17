/**
 * Chuẩn hóa delimiter LaTeX về dạng $...$ / $$...$$ mà remark-math hiểu.
 *
 * - \[...\] → $$...$$ (display math)
 * - \(...\) → $...$ (inline math)
 * - Không đụng vào nội dung nằm trong code fence ``` ``` hoặc inline code ` `
 *   để ví dụ LaTeX trong code không bị rewrite.
 *
 * Lưu ý: dùng hàm thay thế (callback) vì trong chuỗi thay thế của
 * String.replace, '$$' là escape của MỘT ký tự '$'.
 */
export function normalizeMathDelimiters(content: string): string {
	// Tách các vùng code (fence và inline) ra khỏi phần được chuẩn hóa
	const parts = content.split(/(```[\s\S]*?```|`[^`\n]*`)/);

	return parts
		.map((part, index) => {
			const isCode = index % 2 === 1;
			if (isCode) return part;
			return part
				.replace(/\\\[/g, () => "$$")
				.replace(/\\\]/g, () => "$$")
				.replace(/\\\(/g, () => "$")
				.replace(/\\\)/g, () => "$");
		})
		.join("");
}
