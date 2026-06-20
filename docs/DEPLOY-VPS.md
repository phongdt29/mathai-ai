# Hướng dẫn Deploy Production lên VPS — MathAI

Hướng dẫn từng bước đưa MathAI lên **1 VPS Linux tự quản** (frontend + backend + worker).
Bổ sung cho [HUONG-DAN-BUILD-PRODUCTION.md](HUONG-DAN-BUILD-PRODUCTION.md).

> **Stack**: Next.js (frontend) · Express/Node (backend) · MongoDB Atlas · worker cron riêng.
> **Yêu cầu VPS**: 2 vCPU · 4GB RAM · 80GB SSD trở lên · Ubuntu 22.04+.

---

## 0. Checklist trước khi bắt đầu

| Cần có | Trạng thái |
| --- | --- |
| VPS Ubuntu + quyền sudo/SSH | ☐ |
| Domain trỏ về IP VPS (`app.domain` + `api.domain`) | ☐ |
| MongoDB Atlas URI (whitelist IP VPS) | ☐ |
| OpenAI API key | ☐ |
| **Email provider HTTP** (Resend/SendGrid…) — *bắt buộc* | ☐ |
| File `.env.production.local` đã điền đầy đủ | ☐ |

> ⚠️ **Email là bắt buộc**: production guard fail nếu `EMAIL_PROVIDER` ≠ `http` hoặc thiếu `EMAIL_API_URL`/`EMAIL_API_KEY`. Gợi ý: [Resend](https://resend.com) có free tier 3.000 mail/tháng, API `https://api.resend.com/emails`.

---

## 1. Build artifact (trên máy dev)

```bash
# Verify code xanh trước
npm run verify:backend          # backend test + tsc build

# Đóng gói toàn bộ vào thư mục deploy/
npm run build:deploy
```

`deploy/` sau khi build gồm: `backend/dist`, `frontend/` (Next standalone), `start-frontend.js`, `package.json` (script `start:backend`/`start:frontend`).

> Frontend cần `NEXT_PUBLIC_API_URL` **ngay lúc build**. Nếu build:deploy không nhận env, build riêng:
> ```bash
> NEXT_PUBLIC_API_URL=https://api.your-domain/api npm run build:frontend
> ```

Đẩy `deploy/` lên VPS (vd `scp -r deploy user@vps:/var/www/mathai`).

---

## 2. Cài runtime trên VPS

```bash
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm install -g pm2

node -v   # >= 18
```

---

## 3. Cấu hình môi trường

```bash
cd /var/www/mathai

# Backend env  (từ phần BACKEND của .env.production.local)
nano backend/.env

# Frontend env (từ phần FRONTEND)
nano frontend/.env
```

> Đã build standalone rồi nên `NEXT_PUBLIC_API_URL` phải đúng **từ lúc build**; sửa env frontend sau build sẽ không đổi giá trị `NEXT_PUBLIC_*` đã nhúng. Nếu sai → build lại frontend.

Cài dependency production của backend:
```bash
cd backend && npm install --omit=dev && cd ..
```

---

## 4. Chạy bằng pm2 (3 process)

```bash
# API server (cổng 3001)
pm2 start backend/dist/src/index.js --name mathai-api

# Worker scheduler (cron: điểm danh, báo cáo phụ huynh, gia hạn, dọn OCR…)
pm2 start backend/dist/src/worker.js --name mathai-worker

# Frontend (cổng 3444)
pm2 start frontend/start-frontend.js --name mathai-web

pm2 save
pm2 startup        # chạy lệnh nó in ra để tự khởi động khi reboot
pm2 status
```

---

## 5. Nginx reverse proxy + HTTPS

`/etc/nginx/sites-available/mathai`:

```nginx
# Frontend → app.your-domain
server {
    server_name app.your-domain;
    location / {
        proxy_pass http://127.0.0.1:3444;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Backend API → api.your-domain
server {
    server_name api.your-domain;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/mathai /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# HTTPS miễn phí (Let's Encrypt)
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.your-domain -d api.your-domain
```

> Vì có nginx phía trước → đã đặt `TRUST_PROXY=1` trong backend env (rate-limit theo IP thật).

---

## 6. Seed dữ liệu ban đầu (tùy chọn)

```bash
# Tạo dữ liệu mẫu — KHÔNG dùng cho production thật trừ khi cố ý
# Seed bị chặn khi NODE_ENV=production (cần SEED_ALLOW_PRODUCTION=true để ép)
```
> Production thật nên tạo tài khoản admin qua luồng đăng ký, không dùng seed demo.

---

## 7. Smoke test sau deploy

```bash
curl https://api.your-domain/health         # liveness → status: ok
curl https://api.your-domain/health/ready   # readiness: ping Mongo + email config
```

Mở `https://app.your-domain` → đăng ký → đăng nhập → vào dashboard.

---

## 8. Vận hành

```bash
pm2 logs mathai-api          # xem log
pm2 restart mathai-api       # restart sau khi cập nhật
pm2 monit                    # theo dõi CPU/RAM

# Cập nhật phiên bản mới:
# 1) build:deploy trên dev  2) scp deploy/ lên  3) pm2 restart all
```

**MongoDB Atlas**: bật backup tự động trong Atlas dashboard. Whitelist đúng IP VPS (Network Access).

---

## Checklist go-live

1. ☐ `npm run verify:backend` xanh
2. ☐ `.env.production.local` điền đủ (Atlas, domain, OpenAI, **email http**, JWT đã sinh, demo flags=false)
3. ☐ Frontend build với `NEXT_PUBLIC_API_URL` production (non-localhost)
4. ☐ Atlas whitelist IP VPS + bật backup
5. ☐ 3 process pm2 chạy (`api`, `worker`, `web`) + `pm2 save` + `pm2 startup`
6. ☐ nginx + HTTPS (certbot) cho cả `app.` và `api.`
7. ☐ `TRUST_PROXY=1`
8. ☐ Smoke test `/health` & `/health/ready` trả `ok`
