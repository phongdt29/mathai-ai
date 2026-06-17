# Hướng dẫn viết Unit Test — MathAI

Tài liệu này giúp bạn **tự viết thêm test khi cần**. Dự án dùng **Node.js built-in test runner** (`node:test` + `node:assert/strict`) chạy qua `tsx` — **không dùng Jest/Vitest/Mocha**. Không cần cài thêm gì.

---

## 1. Quy ước chung

| Hạng mục | Quy ước |
| --- | --- |
| Framework | `node:test` (`test`, `describe`, `it`, `beforeEach`...) + `node:assert/strict` |
| Vị trí file | **Colocated** — đặt cạnh file nguồn: `scoring.ts` → `scoring.test.ts` |
| Đặt tên | `*.test.ts` (backend & frontend src), `*.test.mjs` / `*.test.cjs` (frontend `test/`, `tests/`) |
| Property-based | `fast-check` (đã cài ở backend) cho input ngẫu nhiên |
| Mock | **Không** mock framework. Backend service nhận **dependency injection** → inject object giả. Frontend dùng `import { mock } from "node:test"` khi cần |
| DB | **Không cần MongoDB thật** cho unit test — inject mock repository |

---

## 2. Lệnh chạy test

```bash
# Toàn bộ backend (từ root hoặc packages/backend)
npm run test --workspace=packages/backend

# Toàn bộ frontend
npm run test --workspace=packages/frontend

# Chạy 1 file lẻ (focused) — backend
cd packages/backend
node --import tsx --test src/utils/scoring.test.ts

# Chạy 1 file lẻ — frontend (cần alias-loader cho import "@/...")
cd packages/frontend
node --import tsx --import ./test/alias-loader.mjs --test src/lib/math-text.test.ts

# Lọc theo tên test (mọi nơi)
node --import tsx --test --test-name-pattern="reward points" src/**/*.test.ts
```

> Mẹo: viết test trước, chạy file lẻ để vòng lặp nhanh, sau đó chạy `npm run verify` trước khi bàn giao.

---

## 3. Template A — Hàm thuần (pure util)

Dùng cho `utils/`, `lib/` — hàm không phụ thuộc DB/network. Đây là loại dễ test nhất, ưu tiên tách logic ra hàm thuần để test.

```ts
// packages/backend/src/utils/vi-du.test.ts
import test from "node:test";
import assert from "node:assert/strict";

import { tinhGiamGia } from "./vi-du";

test("tinhGiamGia áp đúng phần trăm và làm tròn", () => {
  assert.equal(tinhGiamGia(100_000, 10), 90_000);
  assert.equal(tinhGiamGia(99_999, 10), 89_999); // kiểm tra làm tròn
});

test("tinhGiamGia từ chối phần trăm ngoài 0..100", () => {
  assert.throws(() => tinhGiamGia(100, -1), /percent must be between 0 and 100/);
  assert.throws(() => tinhGiamGia(100, 101), /percent must be between 0 and 100/);
});
```

---

## 4. Template B — Backend service (dependency injection + mock repo)

Service trong dự án được thiết kế nhận `XxxServiceDependencies` để **inject repo giả** → test không chạm MongoDB. Xem mẫu thật: [gamification.service.test.ts](../packages/backend/src/services/gamification.service.test.ts), [point.service.test.ts](../packages/backend/src/services/point.service.test.ts).

```ts
// packages/backend/src/services/diem-thuong.service.test.ts
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { DiemThuongService } from "./diem-thuong.service";

// Repo giả: lưu trong Map thay vì DB
function createMockLedgerRepo() {
  const store = new Map<string, any>();
  return {
    store,
    create: async (doc: any) => {
      const _id = new mongoose.Types.ObjectId().toString();
      store.set(_id, { _id, ...doc });
      return store.get(_id);
    },
    sumByStudent: async (studentId: string) =>
      [...store.values()]
        .filter((d) => d.student_id === studentId)
        .reduce((s, d) => s + d.points, 0),
  };
}

describe("DiemThuongService.award", () => {
  let ledger: ReturnType<typeof createMockLedgerRepo>;
  let service: DiemThuongService;

  beforeEach(() => {
    ledger = createMockLedgerRepo();
    service = new DiemThuongService({ ledgerRepo: ledger }); // inject mock
  });

  it("cộng điểm và ghi vào ledger", async () => {
    await service.award("student-1", 50);
    assert.equal(await ledger.sumByStudent("student-1"), 50);
  });

  it("từ chối điểm âm", async () => {
    await assert.rejects(() => service.award("student-1", -10), /points must be positive/);
  });
});
```

> Nếu service bạn cần test lại **import model trực tiếp** (không qua DI), hãy refactor để nhận dependency qua constructor/tham số — đó là lý do toàn bộ service hiện tại test được mà không cần DB.

---

## 5. Template C — Mock hàm bằng `node:test`

Khi cần theo dõi/giả lập một hàm (vd: gọi API, gửi email):

```ts
import { test, mock } from "node:test";
import assert from "node:assert/strict";

import * as emailModule from "./email.service";

test("gửi email reset gọi provider đúng 1 lần", async () => {
  const sendMock = mock.method(emailModule, "sendEmail", async () => ({ ok: true }));

  await yeuCauResetMatKhau("user@mathai.vn");

  assert.equal(sendMock.mock.callCount(), 1);
  assert.equal(sendMock.mock.calls[0].arguments[0].to, "user@mathai.vn");

  sendMock.mock.restore();
});
```

---

## 6. Template D — Frontend lib / logic thuần

Frontend tách logic ra `lib/` để test không cần render React. Import `@/...` hoạt động nhờ alias-loader. Xem mẫu: [math-text.test.ts](../packages/frontend/src/lib/math-text.test.ts), [function-graph.test.ts](../packages/frontend/src/lib/function-graph.test.ts).

```ts
// packages/frontend/src/lib/dinh-dang.test.ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { formatVND } from "@/lib/dinh-dang";

describe("formatVND", () => {
  test("định dạng tiền VN có dấu phân cách nghìn", () => {
    assert.equal(formatVND(1234567), "1.234.567 ₫");
  });
  test("xử lý số 0", () => {
    assert.equal(formatVND(0), "0 ₫");
  });
});
```

> Component React (`*.tsx`) hiện được test gián tiếp qua **logic tách ra lib** và các test cấu trúc route (`tests/*.test.cjs`). Dự án **chưa** dùng render library (React Testing Library). Ưu tiên tách logic khỏi component để test bằng `node:test`; nếu cần test render thật, đề xuất thêm thư viện trong một thay đổi riêng (cần duyệt dependency).

---

## 7. Bảng tra assert thường dùng (`node:assert/strict`)

| Cần kiểm | Cách viết |
| --- | --- |
| Bằng nhau (sâu) | `assert.deepEqual(actual, expected)` |
| Bằng nhau (giá trị) | `assert.equal(a, b)` |
| Đúng/sai | `assert.ok(value)` |
| Ném lỗi (sync) | `assert.throws(() => fn(), /thông điệp/)` |
| Promise reject | `await assert.rejects(() => fn(), /thông điệp/)` |
| Không ném lỗi | `assert.doesNotThrow(() => fn())` |

---

## 8. Checklist khi thêm test mới

1. Đặt file `*.test.ts` **cạnh** file nguồn.
2. Test **hành vi & ca biên** (input rỗng, âm, vượt ngưỡng, lỗi), không chỉ happy-path.
3. Service → inject mock repo, **không** kết nối MongoDB.
4. Chạy file lẻ để lặp nhanh → rồi `npm run test --workspace=...`.
5. Trước khi commit/bàn giao: `npm run verify`.
