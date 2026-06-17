/**
 * OpenAPI 3.1 cho bề mặt API công khai của MathAI.
 *
 * Phục vụ tại GET /api/openapi.json (và /api/v1/openapi.json) để đối tác
 * đấu nối nhanh. Spec mô tả các nhóm endpoint chính và chuẩn envelope;
 * danh sách endpoint đầy đủ xem docs/API-INTEGRATION.md.
 */

const RESPONSE_ENVELOPE = {
	type: 'object',
	properties: {
		success: { type: 'boolean' },
		message: { type: 'string' },
		data: {},
		meta: { type: 'object' },
	},
	required: ['success'],
} as const;

export function buildOpenApiSpec(baseUrl: string, version: string) {
	return {
		openapi: '3.1.0',
		info: {
			title: 'MathAI API',
			version,
			description:
				'API của nền tảng học toán MathAI. Xác thực người dùng bằng JWT Bearer (đăng nhập qua /auth/login); tích hợp server-to-server dùng X-API-Key với nhóm /external.',
		},
		servers: [
			{ url: `${baseUrl}/api/v1`, description: 'Bản ổn định (khuyến nghị)' },
			{ url: `${baseUrl}/api`, description: 'Alias tương thích ngược' },
		],
		components: {
			securitySchemes: {
				bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
				apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
			},
			schemas: {
				Envelope: RESPONSE_ENVELOPE,
			},
		},
		paths: {
			'/auth/register': {
				post: {
					tags: ['auth'],
					summary: 'Đăng ký tài khoản',
					requestBody: {
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['email', 'password', 'full_name', 'role'],
									properties: {
										email: { type: 'string', format: 'email' },
										password: { type: 'string', minLength: 8 },
										full_name: { type: 'string' },
										role: { type: 'string', enum: ['student', 'parent', 'teacher'] },
									},
								},
							},
						},
					},
					responses: { '200': { description: 'Tài khoản và token', content: { 'application/json': { schema: RESPONSE_ENVELOPE } } } },
				},
			},
			'/auth/login': {
				post: {
					tags: ['auth'],
					summary: 'Đăng nhập, nhận access/refresh token',
					requestBody: {
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['email', 'password'],
									properties: {
										email: { type: 'string', format: 'email' },
										password: { type: 'string' },
									},
								},
							},
						},
					},
					responses: { '200': { description: 'JWT access + refresh token', content: { 'application/json': { schema: RESPONSE_ENVELOPE } } } },
				},
			},
			'/auth/refresh': {
				post: { tags: ['auth'], summary: 'Cấp lại access token từ refresh token', responses: { '200': { description: 'Token mới' } } },
			},
			'/auth/me': {
				get: { tags: ['auth'], summary: 'Thông tin người dùng hiện tại', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Hồ sơ người dùng' } } },
			},
			'/solver/solve': {
				post: {
					tags: ['solver'],
					summary: 'Giải bài toán theo cơ chế gợi ý tăng dần (học sinh)',
					security: [{ bearerAuth: [] }],
					requestBody: {
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['problem_text'],
									properties: {
										problem_text: { type: 'string' },
										stage: { type: 'string', enum: ['hint', 'detailed_hint', 'full_solution'] },
									},
								},
							},
						},
					},
					responses: { '200': { description: 'Gợi ý/lời giải LaTeX (KaTeX) + khối ```graph khi có đồ thị' } },
				},
			},
			'/lessons/{id}': {
				get: { tags: ['lessons'], summary: 'Chi tiết bài học kèm bài tập', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Bài học' } } },
			},
			'/curricula/active': {
				get: { tags: ['curriculum'], summary: 'Giáo trình đang hoạt động của học sinh', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Giáo trình' } } },
			},
			'/curriculum/generate': {
				post: { tags: ['curriculum'], summary: 'Sinh giáo trình cá nhân hóa bằng AI', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Giáo trình mới' } } },
			},
			'/chat/teachers': {
				get: { tags: ['chat'], summary: 'Danh sách gia sư AI', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Danh sách gia sư' } } },
			},
			'/chat/conversations/{id}/messages': {
				post: {
					tags: ['chat'],
					summary: 'Gửi tin nhắn và nhận phản hồi AI (Server-Sent Events)',
					description:
						'Thành công trả về text/event-stream: các frame data {"content": "..."} và kết thúc bằng data: [DONE]. Lỗi giữa chừng trả frame data {"error": "..."}.',
					security: [{ bearerAuth: [] }],
					parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
					responses: { '200': { description: 'SSE stream' } },
				},
			},
			'/external/ping': {
				get: { tags: ['external'], summary: 'Kiểm tra kết nối cổng tích hợp ngoài', security: [{ apiKey: [] }], responses: { '200': { description: 'Trạng thái dịch vụ' } } },
			},
			'/external/math/solve': {
				post: {
					tags: ['external'],
					summary: 'Giải bài toán (server-to-server, stateless)',
					security: [{ apiKey: [] }],
					requestBody: {
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['problem'],
									properties: {
										problem: { type: 'string', maxLength: 4000 },
										stage: { type: 'string', enum: ['hint', 'detailed_hint', 'full_solution'], default: 'full_solution' },
									},
								},
							},
						},
					},
					responses: { '200': { description: 'Lời giải LaTeX (KaTeX-compatible)', content: { 'application/json': { schema: RESPONSE_ENVELOPE } } } },
				},
			},
			'/external/math/examples': {
				post: {
					tags: ['external'],
					summary: 'Sinh đề toán mẫu theo khối lớp (server-to-server)',
					security: [{ apiKey: [] }],
					requestBody: {
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['grade_level'],
									properties: {
										grade_level: { type: 'integer', minimum: 1, maximum: 12 },
										count: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
									},
								},
							},
						},
					},
					responses: { '200': { description: 'Danh sách đề toán' } },
				},
			},
		},
	};
}
