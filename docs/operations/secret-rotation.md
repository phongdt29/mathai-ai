# Quy trình xoay vòng bí mật (Secret Rotation Runbook)

> **Validates: Requirements 13.13**

## Tổng quan

Tài liệu này mô tả quy trình xoay vòng (rotate) các secret/credential của MathAI theo lịch hàng quý. Mục tiêu giảm thiểu rủi ro khi secret bị lộ và đảm bảo tuân thủ security best practices.

## Lịch rotation

| Secret | Tần suất | Quý tiếp theo | Owner |
|--------|----------|---------------|-------|
| `JWT_SECRET` | Hàng quý | Q2 2025 | Security Owner |
| `JWT_REFRESH_SECRET` | Hàng quý | Q2 2025 | Security Owner |
| `EMAIL_API_KEY` | Hàng quý | Q2 2025 | DevOps |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | Hàng quý | Q2 2025 | DevOps |
| `PAYMENT_VNPAY_HASH_SECRET` | Hàng quý | Q2 2025 | Payment Owner |
| `PAYMENT_MOMO_SECRET_KEY` | Hàng quý | Q2 2025 | Payment Owner |
| `STORAGE_S3_SECRET_ACCESS_KEY` | Hàng quý | Q2 2025 | DevOps |
| `SMS_API_KEY` | Hàng quý | Q2 2025 | DevOps |
| `METRICS_TOKEN` | Hàng quý | Q2 2025 | DevOps |
| `SENTRY_DSN` | Khi cần | — | DevOps |

---

## Nguyên tắc chung

1. **Không bao giờ** commit secret values vào Git repository.
2. Sử dụng secret manager (AWS Secrets Manager, Vault, hoặc platform secrets) cho mọi môi trường.
3. Rotation phải **zero-downtime** — hỗ trợ dual-key trong giai đoạn chuyển tiếp.
4. Mọi rotation phải được ghi audit log.
5. Test trên staging trước khi apply production.
6. Thông báo team trước khi bắt đầu rotation window.

---

## Quy trình chi tiết từng secret

### 1. JWT_SECRET + JWT_REFRESH_SECRET

**Ảnh hưởng:** Tất cả access token và refresh token hiện tại sẽ invalid sau rotation.

**Quy trình:**

1. **Chuẩn bị:** Thông báo team về maintenance window (khuyến nghị off-peak: 02:00-04:00 ICT).

2. **Generate secret mới:**
   ```bash
   # Generate 64-byte random secret
   openssl rand -base64 64
   ```

3. **Cập nhật secret manager:**
   ```bash
   # Ví dụ AWS Secrets Manager
   aws secretsmanager update-secret \
     --secret-id mathai/production/jwt \
     --secret-string '{"JWT_SECRET":"<new-value>","JWT_REFRESH_SECRET":"<new-value>"}'
   ```

4. **Rolling restart API instances:**
   - Restart từng instance một (không restart đồng thời tất cả).
   - Mỗi instance sau restart sẽ dùng secret mới.
   - User có session cũ sẽ bị logout → redirect về login page.

5. **Xác minh:**
   ```bash
   # Test login flow
   curl -X POST https://api.mathai.vn/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@mathai.vn","password":"<test>"}'
   # Verify token decode thành công
   ```

6. **Ghi nhận:** Cập nhật rotation log với timestamp và operator.

**Lưu ý:** Không hỗ trợ dual-key cho JWT. User sẽ cần login lại. Lên lịch vào thời điểm ít traffic nhất.

---

### 2. EMAIL_API_KEY

**Ảnh hưởng:** Email delivery (password reset, notifications) sẽ fail nếu key cũ bị revoke trước khi key mới active.

**Quy trình:**

1. **Tạo API key mới trên provider** (Resend/SendGrid):
   - Resend: Dashboard → API Keys → Create API Key
   - SendGrid: Settings → API Keys → Create API Key
   - Giữ key cũ active trong giai đoạn chuyển tiếp.

2. **Cập nhật secret manager** với key mới.

3. **Deploy/restart backend** để pick up key mới.

4. **Test email delivery:**
   ```bash
   # Trigger password reset cho test account
   curl -X POST https://api.mathai.vn/api/auth/forgot-password \
     -H "Content-Type: application/json" \
     -d '{"email":"ops-test@mathai.vn"}'
   # Xác nhận email đến inbox
   ```

5. **Revoke key cũ** trên provider dashboard sau khi xác nhận key mới hoạt động.

6. **Ghi nhận** rotation log.

---

### 3. WEB_PUSH_VAPID_PRIVATE_KEY

**Ảnh hưởng:** Push subscriptions hiện tại sẽ invalid. User cần re-subscribe.

**Quy trình:**

1. **Generate VAPID key pair mới:**
   ```bash
   npx web-push generate-vapid-keys
   ```
   Output gồm `publicKey` và `privateKey`.

2. **Cập nhật cả hai keys:**
   - `WEB_PUSH_VAPID_PUBLIC_KEY` (frontend + backend)
   - `WEB_PUSH_VAPID_PRIVATE_KEY` (backend only)

3. **Deploy frontend** với public key mới (để browser subscribe lại).

4. **Deploy backend** với private key mới.

5. **Invalidate push subscriptions cũ:**
   ```bash
   # Trong mongosh production
   db.push_subscriptions.updateMany({}, { $set: { is_active: false, invalidated_reason: "vapid_rotation" } })
   ```

6. **User sẽ tự re-subscribe** khi mở app lần tiếp theo (frontend auto-detect key change).

7. **Ghi nhận** rotation log.

**Lưu ý:** Push notifications sẽ không hoạt động cho đến khi user re-subscribe. Thông báo qua in_app/email trước rotation.

---

### 4. PAYMENT_VNPAY_HASH_SECRET

**Ảnh hưởng:** Payment redirect và webhook verification sẽ fail nếu không đồng bộ với VNPAY.

**Quy trình:**

1. **Liên hệ VNPAY** để yêu cầu cấp hash secret mới:
   - Gửi request qua VNPAY merchant portal hoặc email hỗ trợ.
   - VNPAY sẽ cung cấp secret mới và thời điểm chuyển đổi.

2. **Cập nhật secret manager** với giá trị mới theo lịch VNPAY cung cấp.

3. **Deploy backend** đúng thời điểm VNPAY activate secret mới.

4. **Test payment flow:**
   ```bash
   # Tạo test payment intent
   curl -X POST https://api.mathai.vn/api/billing/payment-intents \
     -H "Authorization: Bearer <admin-token>" \
     -H "Content-Type: application/json" \
     -d '{"amount_vnd":10000,"gateway":"vnpay","plan_id":"test"}'
   # Verify redirect URL có signature hợp lệ
   ```

5. **Monitor webhook logs** 24 giờ sau rotation:
   ```bash
   # Kiểm tra webhook_log cho signature failures
   db.webhook_logs.find({ gateway: "vnpay", signature_valid: false, createdAt: { $gte: new Date(Date.now() - 86400000) } }).count()
   ```

6. **Ghi nhận** rotation log.

**Lưu ý:** Phối hợp chặt chẽ với VNPAY về timing. Không thể dual-key.

---

### 5. PAYMENT_MOMO_SECRET_KEY

**Ảnh hưởng:** Tương tự VNPAY — payment và webhook verification sẽ fail.

**Quy trình:**

1. **Liên hệ MOMO** qua merchant portal để yêu cầu secret mới.

2. **Cập nhật `PAYMENT_MOMO_SECRET_KEY` và `PAYMENT_MOMO_ACCESS_KEY`** (nếu MOMO rotate cả hai) trong secret manager.

3. **Deploy backend** theo lịch MOMO cung cấp.

4. **Test payment flow:**
   ```bash
   # Tạo test MOMO payment
   curl -X POST https://api.mathai.vn/api/billing/payment-intents \
     -H "Authorization: Bearer <admin-token>" \
     -H "Content-Type: application/json" \
     -d '{"amount_vnd":10000,"gateway":"momo","plan_id":"test"}'
   ```

5. **Monitor webhook logs** tương tự VNPAY.

6. **Ghi nhận** rotation log.

---

## Checklist rotation hàng quý

Sử dụng checklist này mỗi quý (tháng 1, 4, 7, 10):

```markdown
## Rotation Q[X] 20XX — Checklist

- [ ] Thông báo team về rotation window (ít nhất 48h trước)
- [ ] Backup current secret metadata (key names, creation dates — KHÔNG backup values)
- [ ] Staging rotation test:
  - [ ] JWT_SECRET + JWT_REFRESH_SECRET
  - [ ] EMAIL_API_KEY
  - [ ] WEB_PUSH_VAPID keys
  - [ ] PAYMENT_VNPAY_HASH_SECRET (nếu VNPAY sẵn sàng)
  - [ ] PAYMENT_MOMO_SECRET_KEY (nếu MOMO sẵn sàng)
- [ ] Production rotation:
  - [ ] JWT secrets (off-peak window)
  - [ ] EMAIL_API_KEY
  - [ ] WEB_PUSH_VAPID keys
  - [ ] Payment secrets (phối hợp gateway)
  - [ ] SMS_API_KEY
  - [ ] METRICS_TOKEN
  - [ ] STORAGE_S3_SECRET_ACCESS_KEY
- [ ] Post-rotation verification:
  - [ ] Auth flow OK
  - [ ] Email delivery OK
  - [ ] Push notification OK (sau user re-subscribe)
  - [ ] Payment flow OK
  - [ ] Metrics endpoint OK
  - [ ] Object storage upload/download OK
- [ ] Revoke old keys trên provider dashboards
- [ ] Cập nhật rotation log
- [ ] Close rotation ticket
```

---

## Rotation log template

Lưu tại secret manager hoặc internal wiki (KHÔNG lưu trong Git):

| Ngày | Secret | Operator | Reviewer | Staging OK | Production OK | Old key revoked | Notes |
|------|--------|----------|----------|------------|---------------|-----------------|-------|
| 2025-01-15 | JWT_SECRET | ops-1 | ops-2 | ✓ | ✓ | N/A (stateless) | Off-peak 02:30 ICT |
| 2025-01-15 | EMAIL_API_KEY | ops-1 | ops-2 | ✓ | ✓ | ✓ | Resend key rotated |

---

## Emergency rotation (khi secret bị lộ)

Nếu phát hiện secret bị compromise:

1. **Ngay lập tức:** Rotate secret bị lộ theo quy trình trên, bỏ qua scheduling.
2. **Revoke key cũ** trên provider NGAY (không chờ transition period).
3. **Kiểm tra audit logs** cho unauthorized access trong thời gian secret bị lộ.
4. **Thông báo** Security Owner và Incident Commander.
5. **Đánh giá blast radius:**
   - JWT leaked → force logout tất cả user, rotate cả refresh secret.
   - Payment secret leaked → kiểm tra transaction logs cho unauthorized payments.
   - Email key leaked → kiểm tra sent emails cho spam/phishing.
6. **Ghi incident report** với timeline, impact assessment, và remediation.

---

## Tài liệu liên quan

- `docs/operations/disaster-recovery.md` — DR plan tổng thể
- `docs/operations/restore-runbook.md` — Restore sau incident
- `.env.example` — Danh sách tất cả environment variables
