# Quy trình khôi phục dữ liệu (PITR Restore Runbook)

> **Validates: Requirements 13.1, 13.10, 13.14**

## Tổng quan

Tài liệu này mô tả quy trình khôi phục dữ liệu MathAI sử dụng MongoDB Atlas Continuous Backup với Point-In-Time Recovery (PITR). Mục tiêu:

- **RPO (Recovery Point Objective):** 1 giờ — mất tối đa 1 giờ dữ liệu.
- **RTO (Recovery Time Objective):** 4 giờ — hệ thống phục hồi trong vòng 4 giờ.

## Điều kiện tiên quyết

- Quyền truy cập MongoDB Atlas Project Owner hoặc Cluster Manager.
- Atlas CLI (`atlas`) đã cài đặt và xác thực.
- Staging cluster sẵn sàng cho restore test.
- Backup continuous đã bật (xem phần cấu hình bên dưới).

## Cấu hình MongoDB Atlas Continuous Backup

### Bật Continuous Backup + PITR

1. Truy cập MongoDB Atlas Console → Project → Cluster → **Backup** tab.
2. Bật **Continuous Backup** (Cloud Backup).
3. Cấu hình PITR retention:
   - **PITR window:** 7 ngày (tối thiểu, khuyến nghị).
   - **Daily snapshot retention:** 30 ngày.
   - **Weekly snapshot retention:** 8 tuần.
   - **Monthly snapshot retention:** 12 tháng.

### Xác nhận cấu hình qua Atlas CLI

```bash
# Liệt kê backup policy
atlas backups schedule describe --clusterName mathai-production --projectId <PROJECT_ID>

# Xác nhận PITR đang hoạt động
atlas backups snapshots list --clusterName mathai-production --projectId <PROJECT_ID>
```

### Kiểm tra backup health

```bash
# Xem snapshot gần nhất
atlas backups snapshots list --clusterName mathai-production --projectId <PROJECT_ID> --output json | head -5
```

Đảm bảo `last_success_at` không cách thời điểm hiện tại quá 26 giờ (alert rule 13.6).

---

## Quy trình khôi phục PITR

### Bước 1: Xác định thời điểm khôi phục

Xác định thời điểm cần restore (UTC):

```bash
# Ví dụ: khôi phục về 14:30 UTC ngày 2025-01-15
TARGET_TIMESTAMP="2025-01-15T14:30:00Z"
```

Lưu ý:
- Thời điểm phải nằm trong PITR window (7 ngày gần nhất).
- Chuyển đổi ICT → UTC: trừ 7 giờ (ICT 21:30 = UTC 14:30).

### Bước 2: Restore sang staging trước (BẮT BUỘC)

**KHÔNG BAO GIỜ restore trực tiếp lên production mà chưa qua staging.**

```bash
# Restore PITR sang staging cluster
atlas backups restores start pointInTime \
  --clusterName mathai-production \
  --projectId <PROJECT_ID> \
  --targetClusterName mathai-staging-restore \
  --targetProjectId <PROJECT_ID> \
  --pointInTimeUTCSeconds $(date -d "$TARGET_TIMESTAMP" +%s)
```

Hoặc qua Atlas Console:
1. Backup → Restore → Point in Time
2. Chọn target timestamp
3. Chọn target cluster: `mathai-staging-restore`
4. Confirm restore

### Bước 3: Xác minh dữ liệu staging

```bash
# Kết nối staging và kiểm tra
mongosh "<STAGING_URI>" --eval "
  db.adminCommand('ping');
  print('Collections:', db.getCollectionNames().length);
  print('Users:', db.users.countDocuments());
  print('Lessons:', db.lessons.countDocuments());
  print('Subscriptions:', db.subscriptions.countDocuments());
"
```

Checklist xác minh:
- [ ] Số lượng collections khớp với production trước sự cố.
- [ ] Document count các collection chính (users, lessons, student_profiles) hợp lý.
- [ ] Chạy backend smoke test với staging URI:
  ```bash
  MONGODB_URI=<STAGING_RESTORE_URI> npm test --workspace=packages/backend
  ```
- [ ] Kiểm tra critical workflows: auth login, student dashboard, teacher gradebook.
- [ ] Xác nhận không có data corruption (spot-check 5-10 documents ngẫu nhiên).

### Bước 4: Restore production (cần approval)

**Yêu cầu approval từ:**
- Data Owner
- Deployment Owner
- Incident Commander (nếu đang trong incident)

Quy trình:
1. Đặt application vào maintenance mode:
   ```bash
   # Scale API instances xuống 0 hoặc bật maintenance flag
   # Tuỳ deployment platform (Docker/K8s/PM2)
   ```
2. Tạo emergency backup trước khi restore:
   ```bash
   atlas backups snapshots create --clusterName mathai-production \
     --projectId <PROJECT_ID> --description "pre-restore-emergency-$(date +%Y%m%d%H%M)"
   ```
3. Thực hiện PITR restore lên production:
   ```bash
   atlas backups restores start pointInTime \
     --clusterName mathai-production \
     --projectId <PROJECT_ID> \
     --targetClusterName mathai-production \
     --targetProjectId <PROJECT_ID> \
     --pointInTimeUTCSeconds $(date -d "$TARGET_TIMESTAMP" +%s)
   ```
4. Chờ restore hoàn tất (theo dõi qua Atlas Console hoặc CLI).
5. Khởi động lại application:
   ```bash
   # Restart API instances
   # Restart Worker process
   ```
6. Chạy post-restore validation (xem Bước 5).

### Bước 5: Post-restore validation

```bash
# Health check
curl -H "Authorization: Bearer $METRICS_TOKEN" https://api.mathai.vn/health/ready

# Verify critical paths
curl https://api.mathai.vn/api/auth/me -H "Authorization: Bearer <test-token>"
```

Checklist:
- [ ] `/health/ready` trả 200.
- [ ] Auth flow hoạt động (login/refresh).
- [ ] Student dashboard load thành công.
- [ ] Scheduler jobs resume (kiểm tra `scheduled_job_run` collection).
- [ ] Notification delivery hoạt động.
- [ ] Payment webhooks respond (nếu billing active).

---

## Drill hàng tháng (Requirement 13.14)

Mỗi tháng thực hiện PITR drill theo quy trình:

1. Chọn timestamp ngẫu nhiên trong PITR window.
2. Restore sang staging cluster riêng biệt.
3. Chạy full validation checklist.
4. Ghi nhận kết quả vào drill evidence:

```json
{
  "drill_date": "2025-02-01",
  "target_timestamp": "2025-01-28T10:00:00Z",
  "restore_duration_minutes": 35,
  "rto_target_minutes": 240,
  "rpo_target_minutes": 60,
  "validation_status": "passed",
  "collections_verified": 25,
  "critical_workflows_passed": ["auth", "dashboard", "gradebook", "solver", "billing"],
  "operator": "<tên người thực hiện>",
  "reviewer": "<tên người review>",
  "notes": ""
}
```

5. Lưu evidence tại `artifacts/deployment/pitr-drill-YYYY-MM.json`.
6. Đóng drill ticket sau khi reviewer confirm.

---

## Troubleshooting

### Restore bị stuck

- Kiểm tra Atlas Console → Activity Feed cho error messages.
- Nếu quá 2 giờ không progress → liên hệ MongoDB Atlas Support.

### Data inconsistency sau restore

- So sánh document counts với backup metadata.
- Kiểm tra oplog gaps qua Atlas Console.
- Nếu cần restore chi tiết hơn, sử dụng snapshot gần nhất + manual replay.

### PITR window hết hạn

- Nếu thời điểm cần restore nằm ngoài PITR window (>7 ngày):
  - Sử dụng daily/weekly/monthly snapshot gần nhất.
  - Chấp nhận RPO lớn hơn và document trong incident report.

---

## Liên hệ escalation

| Vai trò | Trách nhiệm |
|---------|-------------|
| On-call Engineer | Phát hiện sự cố, bắt đầu restore staging |
| Data Owner | Approve production restore |
| Deployment Owner | Thực hiện restore, restart services |
| Incident Commander | Quyết định go/no-go, communication |

## Tài liệu liên quan

- `docs/operations/disaster-recovery.md` — Kế hoạch DR tổng thể
- `docs/runbooks/mongo-backup-restore.md` — Backup/restore chi tiết (Phase 6)
- `docs/operations/secret-rotation.md` — Rotation secrets sau restore
