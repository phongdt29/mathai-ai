import { splitTheoryContent } from "./lesson-content";

export type FallbackLessonSummary = {
	id: string;
	title: string;
	subject: string;
	grade: string;
	duration: string;
	difficulty: string;
	progress: number;
};

export type FallbackLessonExercise = {
	_id?: string;
	order_index: number;
	topic?: string | null;
	difficulty_level?: string | null;
	answer_type: "multiple_choice" | "short_answer" | "essay" | string;
	question_text: string;
	choices?: string[] | null;
	correct_answer: string;
	solution_steps?: string[] | string | null;
	explanation?: string | null;
};

export type FallbackTheorySectionDetail = {
	itemNumber: number;
	title: string;
	explanation: string;
	example: string;
	practice: string;
};

export type FallbackLessonDetail = {
	_id: string;
	lesson_title: string;
	theory_content?: string | null;
	theory_sections?: FallbackTheorySectionDetail[];
	lesson_objective?: string | null;
	estimated_minutes?: number | null;
	status?: string;
	exercises?: FallbackLessonExercise[];
};

export type FallbackLookupOptions = {
	allowLegacy?: boolean;
};

export const fallbackLessonSummaries: FallbackLessonSummary[] = [
	{
		id: "demo-1",
		title: "Phương trình bậc hai",
		subject: "Đại số",
		grade: "Lớp 9",
		duration: "45 phút",
		difficulty: "Trung bình",
		progress: 85,
	},
	{
		id: "demo-2",
		title: "Tam giác đồng dạng",
		subject: "Hình học",
		grade: "Lớp 8",
		duration: "30 phút",
		difficulty: "Dễ",
		progress: 60,
	},
	{
		id: "demo-3",
		title: "Hàm số bậc nhất",
		subject: "Đại số",
		// GDPT 2018: hàm số bậc nhất y = ax + b thuộc Toán 8
		grade: "Lớp 8",
		duration: "40 phút",
		difficulty: "Trung bình",
		progress: 100,
	},
	{
		id: "demo-4",
		title: "Đường tròn",
		subject: "Hình học",
		grade: "Lớp 9",
		duration: "50 phút",
		difficulty: "Khó",
		progress: 30,
	},
	{
		id: "demo-5",
		title: "Bất phương trình",
		subject: "Đại số",
		// GDPT 2018: bất đẳng thức, bất phương trình bậc nhất một ẩn thuộc Toán 9
		grade: "Lớp 9",
		duration: "35 phút",
		difficulty: "Dễ",
		progress: 0,
	},
	{
		id: "demo-6",
		title: "Thống kê",
		subject: "Thống kê và Xác suất",
		grade: "Lớp 10",
		duration: "45 phút",
		difficulty: "Trung bình",
		progress: 0,
	},
];

const fallbackLessonDetails: Record<string, FallbackLessonDetail> = {
	"demo-1": {
		_id: "demo-1",
		lesson_title: "Phương trình bậc hai",
		lesson_objective:
			"Nhận biết dạng ax² + bx + c = 0, tính biệt thức và chọn phương pháp giải phù hợp.",
		theory_content: [
			"Phương trình bậc hai một ẩn có dạng ax² + bx + c = 0, trong đó a khác 0; trước khi giải cần xác định đúng các hệ số a, b, c.",
			"Cách làm thông dụng là đưa mọi hạng tử về một vế, rút gọn rồi kiểm tra xem phương trình đã đúng dạng chuẩn chưa.",
			"Biệt thức Δ = b² - 4ac giúp dự đoán số nghiệm: Δ > 0 có hai nghiệm phân biệt, Δ = 0 có nghiệm kép, Δ < 0 không có nghiệm thực.",
			"Ví dụ với x² - 5x + 6 = 0, ta có a = 1, b = -5, c = 6 nên Δ = 25 - 24 = 1 và phương trình có hai nghiệm.",
			"Khi Δ không âm, áp dụng công thức x = (-b ± √Δ) / (2a); với ví dụ trên, x = (5 ± 1) / 2 nên x = 3 hoặc x = 2.",
			"Nếu phương trình có dạng dễ phân tích như x² - 7x + 12 = 0, có thể tách thành (x - 3)(x - 4) = 0 để tìm nghiệm nhanh hơn.",
			"Lưu ý dấu của b rất quan trọng: với 2x² + 3x - 2 = 0 thì b = 3, không phải -3, nên cần thay số cẩn thận.",
			"Ứng dụng thực tế: khi mô hình hóa quỹ đạo, diện tích hoặc bài toán chuyển động, nghiệm của phương trình bậc hai thường biểu thị thời điểm hoặc kích thước cần tìm.",
		].join("\n"),
		estimated_minutes: 45,
		status: "in_progress",
		exercises: [
			{
				_id: "demo-1-check-1",
				order_index: 1,
				topic: "Nghiệm của phương trình bậc hai",
				difficulty_level: "Trung bình",
				answer_type: "multiple_choice",
				question_text: "Phương trình x² - 5x + 6 = 0 có cặp nghiệm nào?",
				choices: [
					"x = 1 hoặc x = 6",
					"x = 2 hoặc x = 3",
					"x = -2 hoặc x = -3",
					"Phương trình không có nghiệm thực",
				],
				correct_answer: "x = 2 hoặc x = 3",
				solution_steps: [
					"Tìm hai số có tích bằng 6 và tổng bằng 5.",
					"Hai số đó là 2 và 3, nên x² - 5x + 6 = (x - 2)(x - 3).",
					"Suy ra x = 2 hoặc x = 3.",
				],
				explanation:
					"Có thể kiểm tra lại bằng cách thay từng nghiệm vào phương trình ban đầu.",
			},
			{
				_id: "demo-1-check-2",
				order_index: 2,
				topic: "Tính biệt thức",
				difficulty_level: "Dễ",
				answer_type: "short_answer",
				question_text:
					"Điền số là kết quả: Với phương trình x² - 4x + 4 = 0, biệt thức Δ bằng bao nhiêu?",
				correct_answer: "0",
				solution_steps: [
					"Xác định a = 1, b = -4, c = 4.",
					"Tính Δ = b² - 4ac = (-4)² - 4 · 1 · 4.",
					"Δ = 16 - 16 = 0.",
				],
				explanation: "Khi Δ = 0, phương trình bậc hai có nghiệm kép.",
			},
			{
				_id: "demo-1-check-3",
				order_index: 3,
				topic: "Ý nghĩa của biệt thức",
				difficulty_level: "Dễ",
				answer_type: "true_false",
				question_text:
					"Đúng hay sai: Nếu Δ < 0 thì phương trình bậc hai không có nghiệm thực.",
				choices: ["Đúng", "Sai"],
				correct_answer: "Đúng",
				solution_steps: [
					"Biệt thức Δ cho biết số nghiệm thực của phương trình bậc hai.",
					"Nếu Δ < 0 thì căn bậc hai của Δ không là số thực.",
					"Vì vậy phương trình không có nghiệm thực.",
				],
				explanation:
					"Quy tắc cần nhớ: Δ > 0 có hai nghiệm phân biệt, Δ = 0 có nghiệm kép, Δ < 0 không có nghiệm thực.",
			},
		],
	},
	"demo-2": {
		_id: "demo-2",
		lesson_title: "Tam giác đồng dạng",
		lesson_objective:
			"Hiểu các trường hợp đồng dạng và vận dụng tỉ số đồng dạng để tính độ dài cạnh.",
		theory_content: [
			"Hai tam giác đồng dạng là hai tam giác có các góc tương ứng bằng nhau và các cạnh tương ứng tỉ lệ theo cùng một hệ số.",
			"Cách làm đầu tiên là đánh dấu các góc bằng nhau hoặc các cạnh tương ứng, sau đó viết đúng thứ tự tên tam giác để tránh ghép nhầm cạnh.",
			"Trường hợp góc - góc dùng khi chứng minh được hai cặp góc tương ứng bằng nhau, ví dụ do so le trong hoặc cùng chắn một cung.",
			"Trường hợp cạnh - cạnh - cạnh dùng khi ba tỉ số AB/DE, BC/EF và AC/DF bằng nhau, khi đó hai tam giác đồng dạng.",
			"Trường hợp cạnh - góc - cạnh cần hai cặp cạnh kề một góc tương ứng tỉ lệ và góc xen giữa hai cạnh đó bằng nhau.",
			"Ví dụ nếu tam giác ABC đồng dạng tam giác DEF và AB/DE = 2/3, BC = 8 cm thì cạnh tương ứng EF thỏa 8/EF = 2/3, suy ra EF = 12 cm.",
			"Lưu ý tỉ số đồng dạng phải viết nhất quán: nếu lấy cạnh của tam giác nhỏ chia cạnh của tam giác lớn thì tất cả tỉ số còn lại cũng phải theo chiều đó.",
			"Ứng dụng thực tế: có thể đo chiều cao cây bằng bóng nắng vì tam giác tạo bởi cây và bóng đồng dạng với tam giác tạo bởi cọc đo và bóng của cọc.",
		].join("\n"),
		estimated_minutes: 30,
		status: "in_progress",
		exercises: [],
	},
	"demo-3": {
		_id: "demo-3",
		lesson_title: "Hàm số bậc nhất",
		lesson_objective:
			"Nhận biết hàm số y = ax + b, hiểu ý nghĩa hệ số góc và cách vẽ đồ thị đường thẳng.",
		theory_content: [
			"Hàm số bậc nhất có dạng y = ax + b với a khác 0; mỗi giá trị x xác định đúng một giá trị y tương ứng.",
			"Hệ số a là hệ số góc: a > 0 thì đường thẳng đi lên khi nhìn từ trái sang phải, còn a < 0 thì đường thẳng đi xuống.",
			"Hệ số b là tung độ gốc, nghĩa là đồ thị cắt trục Oy tại điểm có tọa độ (0; b).",
			"Cách làm khi vẽ đồ thị là chọn hai giá trị x đơn giản, tính y tương ứng, đặt hai điểm lên mặt phẳng tọa độ rồi nối thành đường thẳng.",
			"Ví dụ với y = 2x - 1, khi x = 0 thì y = -1, khi x = 1 thì y = 1; đường thẳng đi qua (0; -1) và (1; 1).",
			"Muốn kiểm tra một điểm có thuộc đồ thị hay không, thay hoành độ x vào công thức và so sánh kết quả y với tung độ của điểm.",
			"Lưu ý hai đường thẳng y = ax + b và y = a'x + b' song song khi a = a' và b khác b', còn cắt nhau khi a khác a'.",
			"Ứng dụng thực tế: hàm số bậc nhất mô tả chi phí dạng y = ax + b, trong đó b là phí cố định và a là chi phí tăng thêm cho mỗi đơn vị.",
		].join("\n"),
		estimated_minutes: 40,
		status: "completed",
		exercises: [],
	},
	"demo-4": {
		_id: "demo-4",
		lesson_title: "Đường tròn",
		lesson_objective:
			"Nắm các khái niệm tâm, bán kính, dây cung, tiếp tuyến và quan hệ cơ bản trong đường tròn.",
		theory_content: [
			"Đường tròn tâm O bán kính R là tập hợp các điểm cách O một khoảng bằng R; ký hiệu thường dùng là (O; R).",
			"Bán kính nối tâm với một điểm trên đường tròn, còn đường kính đi qua tâm và có độ dài bằng 2R.",
			"Dây cung là đoạn thẳng nối hai điểm trên đường tròn; dây đi qua tâm chính là đường kính và là dây dài nhất.",
			"Cách làm bài nhận dạng là vẽ hình rõ tâm, bán kính, dây cung, tiếp tuyến rồi ghi các quan hệ vuông góc hoặc bằng nhau đã biết.",
			"Tiếp tuyến tại điểm A của đường tròn vuông góc với bán kính OA, vì vậy nếu d là tiếp tuyến tại A thì OA ⟂ d.",
			"Ví dụ nếu OA = 5 cm và đường thẳng d tiếp xúc đường tròn tại A, mọi tam giác có cạnh OA và một đoạn trên d tại A sẽ có góc vuông tại A.",
			"Lưu ý trong cùng một đường tròn, các dây bằng nhau thì cách đều tâm; ngược lại, các dây cách đều tâm thì bằng nhau.",
			"Ứng dụng thực tế: kiến thức đường tròn xuất hiện trong thiết kế bánh xe, mặt đồng hồ, vòng quay và các bài toán khoảng cách đều quanh một điểm cố định.",
		].join("\n"),
		estimated_minutes: 50,
		status: "in_progress",
		exercises: [],
	},
	"demo-5": {
		_id: "demo-5",
		lesson_title: "Bất phương trình",
		lesson_objective:
			"Giải bất phương trình cơ bản và biểu diễn tập nghiệm trên trục số.",
		theory_content: [
			"Bất phương trình thể hiện quan hệ lớn hơn, nhỏ hơn, lớn hơn hoặc bằng, nhỏ hơn hoặc bằng giữa hai biểu thức chứa ẩn.",
			"Cách làm cơ bản là chuyển các hạng tử chứa ẩn về một vế, các số về vế còn lại rồi rút gọn từng bước.",
			"Có thể cộng hoặc trừ cùng một biểu thức vào hai vế mà không đổi chiều bất phương trình, tương tự như khi giải phương trình.",
			"Khi nhân hoặc chia cả hai vế với số dương, chiều bất phương trình giữ nguyên; khi nhân hoặc chia với số âm, bắt buộc phải đổi chiều.",
			"Ví dụ giải 2x + 3 > 7: trừ 3 hai vế được 2x > 4, chia 2 được x > 2.",
			"Ví dụ giải -3x ≤ 9: chia hai vế cho -3 phải đổi chiều, nên nghiệm là x ≥ -3.",
			"Lưu ý khi biểu diễn trên trục số, dấu > hoặc < dùng chấm tròn rỗng, còn dấu ≥ hoặc ≤ dùng chấm tròn đặc tại điểm biên.",
			"Ứng dụng thực tế: bất phương trình dùng để mô tả điều kiện tối thiểu hoặc tối đa, chẳng hạn tổng chi phí 15x + 20 ≤ 200 để không vượt ngân sách.",
		].join("\n"),
		estimated_minutes: 35,
		status: "not_started",
		exercises: [],
	},
	"demo-6": {
		_id: "demo-6",
		lesson_title: "Thống kê",
		lesson_objective:
			"Đọc bảng số liệu, tính các giá trị đặc trưng và rút ra nhận xét từ dữ liệu.",
		theory_content: [
			"Thống kê giúp thu thập, tổ chức, biểu diễn và phân tích dữ liệu để rút ra nhận xét có cơ sở thay vì chỉ dựa vào cảm giác.",
			"Cách làm với một bộ dữ liệu là kiểm tra đơn vị đo, sắp xếp giá trị nếu cần, lập bảng tần số rồi chọn số đặc trưng phù hợp để mô tả.",
			"Tần số cho biết một giá trị xuất hiện bao nhiêu lần; tần suất cho biết tỉ lệ xuất hiện, thường tính bằng tần số chia cho tổng số quan sát.",
			"Số trung bình cộng được tính bằng tổng các giá trị chia cho số lượng giá trị, ví dụ điểm 7, 8, 9 có trung bình là (7 + 8 + 9) / 3 = 8.",
			"Trung vị là giá trị đứng giữa khi dữ liệu đã được sắp xếp; nếu có số lượng giá trị chẵn, trung vị là trung bình của hai giá trị giữa.",
			"Mốt là giá trị xuất hiện nhiều nhất, ví dụ dãy 6, 7, 7, 8, 9 có mốt là 7 vì 7 xuất hiện hai lần.",
			"Lưu ý số trung bình có thể bị ảnh hưởng mạnh bởi giá trị quá lớn hoặc quá nhỏ, nên cần kết hợp trung vị và mốt khi nhận xét dữ liệu.",
			"Ứng dụng thực tế: khi phân tích điểm kiểm tra của lớp, thống kê giúp giáo viên biết mức độ phổ biến của điểm số và điều chỉnh bài giảng phù hợp.",
		].join("\n"),
		estimated_minutes: 45,
		status: "not_started",
		exercises: [],
	},
};

function buildFallbackTheorySections(
	lesson: FallbackLessonDetail,
): FallbackTheorySectionDetail[] {
	const items = splitTheoryContent(lesson.theory_content);
	return items.map((item, index) => {
		const itemNumber = index + 1;
		return {
			itemNumber,
			title: item,
			explanation: `Ở mục ${itemNumber} của bài "${lesson.lesson_title}", ý chính cần nắm là: ${item} Hãy đọc chậm từng cụm từ, xác định khái niệm hoặc thao tác toán học đang được nhắc đến, rồi liên hệ với mục tiêu bài học để hiểu vì sao bước này quan trọng trong toàn bộ bài.`,
			example: `Ví dụ ứng dụng: lấy một bài toán quen thuộc trong chủ đề "${lesson.lesson_title}" và tự hỏi dữ kiện nào khớp với nội dung "${item}". Sau đó viết lại dữ kiện bằng ký hiệu toán học, thực hiện đúng quy tắc của mục này và kiểm tra kết quả có phù hợp điều kiện ban đầu không.`,
			practice: `Luyện tập: hãy tự tạo một câu hỏi ngắn liên quan đến "${item}", giải thích bằng lời của em trong 2-3 câu, rồi viết một ví dụ số hoặc hình minh họa để kiểm tra mình đã hiểu đúng.`,
		};
	});
}

for (const detail of Object.values(fallbackLessonDetails)) {
	detail.theory_sections = buildFallbackTheorySections(detail);
}

const legacyFallbackLessonIds: Record<string, string> = {
	"1": "demo-1",
	"2": "demo-2",
	"3": "demo-3",
	"4": "demo-4",
	"5": "demo-5",
	"6": "demo-6",
};

export function isFallbackLessonId(id: string | number): boolean {
	return Object.hasOwn(fallbackLessonDetails, String(id));
}

export function getFallbackLessonDetail(
	id: string | number,
	options: FallbackLookupOptions = {},
): FallbackLessonDetail | null {
	const normalizedId =
		options.allowLegacy === true
			? (legacyFallbackLessonIds[String(id)] ?? String(id))
			: String(id);
	return fallbackLessonDetails[normalizedId] ?? null;
}

export function getFallbackTheorySectionDetail(
	id: string | number,
	itemNumber: number,
	options: FallbackLookupOptions = {},
): FallbackTheorySectionDetail | null {
	const normalizedId =
		options.allowLegacy === true
			? (legacyFallbackLessonIds[String(id)] ?? String(id))
			: String(id);
	const detail = fallbackLessonDetails[normalizedId] ?? null;
	if (
		!detail?.theory_sections ||
		!Number.isInteger(itemNumber) ||
		itemNumber < 1
	) {
		return null;
	}

	return detail.theory_sections[itemNumber - 1] ?? null;
}
