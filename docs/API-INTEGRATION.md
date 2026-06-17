# Hướng dẫn đấu nối API MathAI

Tài liệu cho đối tác/dịch vụ ngoài muốn tích hợp với backend MathAI.

## Tổng quan

| Thành phần | Giá trị |
|---|---|
| Base URL (khuyến nghị) | `https://<api-host>/api/v1` |
| Alias tương thích ngược | `https://<api-host>/api` |
| Spec máy đọc được | `GET /api/openapi.json` (OpenAPI 3.1) |
| Liveness | `GET /health` (kèm `version`) |
| Readiness | `GET /health/ready` |
| Envelope chuẩn | `{ "success": boolean, "message": string, "data": ..., "meta": ... }` |
| Rate limit chung | 600 req/phút/IP cho `/api/*` |

## Hai chế độ xác thực

### 1. JWT Bearer — luồng người dùng (web/mobile)

Đăng nhập để lấy token, gửi kèm mọi request:

```bash
# Đăng nhập
curl -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "student@mathai.vn", "password": "..."}'

# Gọi API với access token
curl "$BASE/auth/me" -H "Authorization: Bearer <access_token>"
```

Token hết hạn theo `JWT_EXPIRES_IN` (mặc định 7 ngày); cấp lại bằng `POST /auth/refresh`.

Các nhóm endpoint chính (yêu cầu Bearer):

- `/students`, `/assessments`, `/curricula` (alias `/curriculum`), `/lessons`
- `/solver` — giải toán gợi ý tăng dần (hint → detailed_hint → full_solution)
- `/chat` — hội thoại với gia sư AI (phản hồi streaming SSE)
- `/dashboard`, `/engagement`, `/parent`, `/teacher`, `/admin`, `/billing`, `/notifications`

### 2. X-API-Key — server-to-server (cổng tích hợp ngoài)

Bật bằng env `EXTERNAL_API_KEYS` (một hoặc nhiều key phân tách dấu phẩy, sinh bằng
`openssl rand -hex 32`). Gửi key qua header `X-API-Key`.
Rate limit riêng: 120 req/phút/IP.

```bash
# Kiểm tra kết nối
curl "$BASE/external/ping" -H "X-API-Key: $KEY"

# Giải bài toán (stateless, không gắn học sinh)
curl -X POST "$BASE/external/math/solve" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"problem": "Giải phương trình x^2 - 5x + 6 = 0", "stage": "full_solution"}'

# Sinh đề toán mẫu theo khối lớp
curl -X POST "$BASE/external/math/examples" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"grade_level": 9, "count": 5}'
```

## Định dạng nội dung toán học

Mọi nội dung toán do AI sinh ra tuân theo quy chuẩn thống nhất
(`packages/backend/src/constants/math-format.ts`):

- Công thức viết bằng **LaTeX tương thích KaTeX**: inline `$...$`, display `$$...$$`.
- Đồ thị hàm số được nhúng dưới dạng khối code fence ` ```graph ` chứa JSON:

```graph
{
  "title": "Đồ thị hàm số y = (2x+1)/(x-1)",
  "xMin": -4, "xMax": 6, "yMin": -4, "yMax": 8,
  "functions": [{ "expr": "(2x+1)/(x-1)", "label": "y = (2x+1)/(x-1)" }],
  "asymptotes": { "vertical": [1], "horizontal": [2] }
}
```

Client tích hợp có thể render khối này bằng bất kỳ thư viện vẽ đồ thị nào;
frontend MathAI dùng component `FunctionGraph`
(`packages/frontend/src/components/FunctionGraph.tsx`) với parser biểu thức an toàn
(`packages/frontend/src/lib/function-graph.ts`) — hỗ trợ `x`, `+ - * / ^`,
`sin cos tan cot sqrt abs ln log exp`, hằng `pi`, `e`, nhân ẩn (`2x`, `2(x+1)`),
tự tách nhánh tại tiệm cận đứng.

## Webhook thanh toán

`POST /api/webhooks/*` (VNPAY/MOMO/SePay) xác thực bằng HMAC chữ ký riêng từng cổng,
mount trước JSON parser để giữ raw body — không dùng JWT/API key.

## CORS & hạ tầng

- `CORS_ORIGIN` nhận nhiều origin phân tách dấu phẩy.
- Chạy sau reverse proxy: đặt `TRUST_PROXY=1` để rate limit đúng IP client.
- SSE (`/chat/conversations/:id/messages`): thành công trả `text/event-stream`
  với các frame `data: {"content": "..."}`, kết thúc `data: [DONE]`;
  lỗi giữa stream trả frame `data: {"error": "..."}`.
