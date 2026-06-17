# Kế hoạch khôi phục sau thảm hoạ (Disaster Recovery Plan)

> **Validates: Requirements 13.1, 13.2, 13.10**

## Tổng quan

Tài liệu này định nghĩa kế hoạch Disaster Recovery (DR) cho MathAI, bao gồm các kịch bản sự cố, quy trình phục hồi, và mục tiêu SLA.

### Mục tiêu phục hồi

| Metric | Target | Ghi chú |
|--------|--------|---------|
| **RTO (Recovery Time Objective)** | 4 giờ | Thời gian tối đa hệ thống down |
| **RPO (Recovery Point Objective)** | 1 giờ | Lượng dữ liệu tối đa có thể mất |

### Phạm vi hệ thống

| Component | Tier | RTO | RPO |
|-----------|------|-----|-----|
| MongoDB Atlas (primary data) | Critical | 2h | 1h (PITR) |
| Object Storage (S3/R2) | High | 4h | 0 (versioning) |
| Backend API | Critical | 30min | N/A (stateless) |
| Worker Process | High | 1h | N/A (idempotent jobs) |
| Frontend (Next.js) | High | 30min | N/A (static + CDN) |
| Redis (cache/queue) | Medium | 1h | Acceptable loss |
| External providers (email, SMS, push) | Low | N/A | N/A (retry mechanism) |

---

## Chiến lược backup

### MongoDB Atlas — Continuous Backup + PITR

**Cấu hình (Requirement 13.1):**

| Setting | Value |
|---------|-------|
| Backup type | Continuous (Cloud Backup) |
| PITR retention | 7 ngày |
| Daily snapshot retention | 30 ngày |
| Weekly snapshot retention | 8 tuần |
| Monthly snapshot retention | 12 tháng |
| Cluster tier | M10+ (hỗ trợ PITR) |

**Cách bật:**
1. Atlas Console → Cluster → Backup → Configure
2. Enable "Continuous Cloud Backup"
3. Set retention policies theo bảng trên
4. Verify: `atlas backups schedule describe --clusterName mathai-production`

**Monitoring:**
- Alert khi `backup.last_success_at > 26 giờ` (Requirement 13.6).
- Kiểm tra Atlas Backup tab hàng ngày cho warnings.

### Object Storage — Versioning + Lifecycle (Requirement 13.2)

**Cấu hình cho buckets `solver` và `submissions`:**

| Setting | Value |
|---------|-------|
| Versioning | Enabled |
| Lifecycle: Standard → Glacier | 90 ngày |
| Lifecycle: Glacier → Delete | 365 ngày |
| Legal hold | Override delete cho objects có legal hold tag |

**AWS S3 Lifecycle Policy (JSON):**

```json
{
  "Rules": [
    {
      "ID": "TransitionToGlacier90d",
      "Status": "Enabled",
      "Filter": {
        "Prefix": ""
      },
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ]
    },
    {
      "ID": "DeleteAfter365d",
      "Status": "Enabled",
      "Filter": {
        "Prefix": ""
      },
      "Expiration": {
        "Days": 365
      },
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 365
      }
    }
  ]
}
```

**Áp dụng lifecycle policy:**

```bash
# AWS S3
aws s3api put-bucket-lifecycle-configuration \
  --bucket mathai-storage-production \
  --lifecycle-configuration file://lifecycle-policy.json

# Bật versioning
aws s3api put-bucket-versioning \
  --bucket mathai-storage-production \
  --versioning-configuration Status=Enabled
```

**Cloudflare R2 (nếu dùng R2):**

```bash
# R2 lifecycle qua Cloudflare Dashboard hoặc API
# R2 không hỗ trợ Glacier — sử dụng Infrequent Access class
# Lifecycle: delete after 365 days
wrangler r2 bucket lifecycle set mathai-storage-production \
  --rule '{"id":"delete-365d","enabled":true,"conditions":{"age":365},"action":"Delete"}'
```

**Legal hold (cho objects cần giữ lâu hơn 365 ngày):**

```bash
# Tag object với legal hold
aws s3api put-object-tagging \
  --bucket mathai-storage-production \
  --key "submissions/2025/01/abc123.pdf" \
  --tagging 'TagSet=[{Key=legal-hold,Value=true}]'
```

Objects có tag `legal-hold=true` được exclude khỏi lifecycle delete rule.

---

## Kịch bản sự cố và quy trình phục hồi

### Kịch bản 1: Database corruption / accidental deletion

**Triệu chứng:** Data inconsistency, missing documents, application errors.

**Phục hồi:**
1. Xác định thời điểm trước sự cố (từ audit logs, error timestamps).
2. Thực hiện PITR restore theo `docs/operations/restore-runbook.md`.
3. RTO estimate: 2-3 giờ (restore + validation).

### Kịch bản 2: MongoDB Atlas cluster failure

**Triệu chứng:** Connection timeouts, `/health/ready` trả 503.

**Phục hồi:**
1. Kiểm tra Atlas Status Page cho region outage.
2. Nếu single-region failure:
   - Atlas tự động failover sang secondary (< 30 giây cho replica set).
   - Monitor application reconnection.
3. Nếu multi-region failure (hiếm):
   - Restore từ snapshot sang cluster mới ở region khác.
   - Cập nhật `MONGODB_URI` trong secret manager.
   - Restart tất cả API + Worker instances.
4. RTO estimate: 30 phút (auto-failover) đến 4 giờ (manual restore).

### Kịch bản 3: Object Storage unavailable

**Triệu chứng:** Upload/download failures, OCR service errors.

**Phục hồi:**
1. Kiểm tra AWS/Cloudflare status page.
2. Nếu tạm thời (< 1 giờ):
   - Application retry mechanism sẽ handle.
   - OCR requests trả error gracefully (ocr_status="failed").
3. Nếu kéo dài:
   - Switch `STORAGE_PROVIDER=local` tạm thời (nếu có disk space).
   - Hoặc switch sang backup bucket ở region khác.
4. Sau khi S3 recovery:
   - Verify versioning intact.
   - Sync any local uploads back to S3.
5. RTO estimate: phụ thuộc provider (thường < 4 giờ).

### Kịch bản 4: Application server failure

**Triệu chứng:** 502/503 từ load balancer, health check failures.

**Phục hồi:**
1. Backend API (stateless, ≥ 2 instances):
   - Load balancer tự động route traffic sang instance healthy.
   - Restart/replace failed instance.
   - RTO: < 5 phút (auto-healing).
2. Worker Process (1 instance, DB lock protection):
   - Restart worker.
   - Scheduler lock mechanism đảm bảo không duplicate job execution.
   - Missed jobs sẽ chạy ở lần trigger tiếp theo.
   - RTO: < 15 phút.

### Kịch bản 5: Secret compromise

**Triệu chứng:** Unauthorized access detected, suspicious audit logs.

**Phục hồi:**
1. Emergency secret rotation theo `docs/operations/secret-rotation.md`.
2. Revoke compromised credentials ngay lập tức.
3. Review audit logs cho unauthorized actions.
4. Nếu data bị modify → PITR restore về thời điểm trước compromise.
5. RTO estimate: 1-4 giờ tuỳ scope.

### Kịch bản 6: Complete infrastructure loss

**Triệu chứng:** Toàn bộ deployment environment unavailable.

**Phục hồi:**
1. Provision infrastructure mới (IaC hoặc manual).
2. Restore MongoDB từ Atlas backup (cross-region nếu cần).
3. Restore Object Storage từ versioned objects hoặc cross-region replication.
4. Deploy application từ Git repository (latest stable tag).
5. Restore secrets từ secret manager backup.
6. Update DNS records.
7. RTO estimate: 4 giờ (target maximum).

---

## Communication plan

### Escalation matrix

| Severity | Thời gian phát hiện → thông báo | Ai được thông báo |
|----------|----------------------------------|-------------------|
| Critical (service down) | < 5 phút | On-call → Team Lead → CTO |
| High (degraded) | < 15 phút | On-call → Team Lead |
| Medium (partial impact) | < 30 phút | On-call |

### Status page updates

1. **Investigating** — Ngay khi phát hiện sự cố.
2. **Identified** — Khi xác định root cause.
3. **Monitoring** — Khi fix đã deploy, đang monitor.
4. **Resolved** — Khi xác nhận hệ thống ổn định.

---

## DR drill schedule

| Drill | Tần suất | Mô tả |
|-------|----------|--------|
| PITR restore test | Hàng tháng | Restore sang staging, validate data |
| Failover test | Hàng quý | Simulate primary failure, verify auto-failover |
| Full DR exercise | 6 tháng/lần | Simulate complete loss, restore from scratch |
| Secret rotation | Hàng quý | Rotate tất cả secrets theo schedule |

---

## Checklist DR readiness

```markdown
## DR Readiness — Monthly Review

- [ ] MongoDB Atlas backup status: continuous + PITR active
- [ ] Last successful backup < 24h ago
- [ ] PITR drill completed this month
- [ ] Object Storage versioning enabled
- [ ] Object Storage lifecycle policy active
- [ ] Secret manager accessible and up-to-date
- [ ] Application deployable from Git (verified by CI)
- [ ] Monitoring alerts firing correctly (test alert sent)
- [ ] Escalation contacts up-to-date
- [ ] This DR plan reviewed and current
```

---

## Metrics và monitoring cho DR

Các metric cần monitor liên tục:

| Metric | Alert threshold | Severity |
|--------|----------------|----------|
| `backup.last_success_at` | > 26 giờ | Critical |
| MongoDB connection failures | > 5/min | Critical |
| Object Storage error rate | > 5%/5min | High |
| `/health/ready` failures | > 2 consecutive | Critical |
| Disk space (Atlas) | < 20% free | Warning |

---

## Tài liệu liên quan

- `docs/operations/restore-runbook.md` — Quy trình PITR restore chi tiết
- `docs/operations/secret-rotation.md` — Rotation secrets hàng quý
- `docs/runbooks/mongo-backup-restore.md` — Backup/restore procedures (Phase 6)
- `docs/runbooks/deployment-verification-recovery-drills.md` — Deployment verification
