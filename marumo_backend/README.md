# Marumo Backend

## Triển khai hiện tại

Backend dùng Node.js 22+ và Express để cung cấp API. bcrypt băm mật khẩu. SMTP gửi email xác thực qua nodemailer. Repository có hai cài đặt: SQL Server qua mssql cho chạy thật và memory cho test. Đặc tả dữ liệu và các luồng rạp nằm trong [docs/SPEC.md](../docs/SPEC.md).

Cấu trúc source:

| Tệp | Trách nhiệm |
| --- | --- |
| `src/server.js` | Khởi động: đọc config, mở pool SQL, dịch vụ lắng nghe, tắt sạch pool khi SIGTERM/SIGINT. |
| `src/app.js` | `createApp(options)`: Express app, helmet, giới hạn 16kb, requestId, `/health`, `/ready`, handler lỗi. |
| `src/auth.js` | Route auth, hàng đợi gửi email coalescing theo tài khoản, session middleware, CSRF. |
| `src/repository.js` | `createMemoryRepository` cho test và `createSqlRepository(pool)` cho SQL Server. |
| `src/validation.js` | Parse tại biên: email chuẩn hóa, mật khẩu 12–72 byte bcrypt, chặn trường lạ. |
| `src/tokens.js` | Token ngẫu nhiên 32 byte base64url, hash SHA-256. |
| `src/cookies.js` | Parse/serialize cookie phiên và CSRF. |
| `src/permissions.js` | hasPermission, hasBranchScope, requirePermission cho API quản trị. |
| `src/config.js` | Đọc và validate biến môi trường khi khởi động. |
| `src/smtp.js` | Transport nodemailer và nội dung email xác thực. |

## API

| Endpoint | Hành vi |
| --- | --- |
| `GET /health` | 200 `{status:"ok"}` khi tiến trình chạy. |
| `GET /ready` | 200 khi DB sẵn sàng, 503 khi probe lỗi, không tiết lộ connection string. |
| `POST /auth/register` | Email trim+lowercase, mật khẩu băm, tạo users PENDING, gửi email xác thực. Trả 202 thông báo chung kể cả email trùng. |
| `POST /auth/verify-email` | Cập nhật có điều kiện trong transaction: một token chỉ dùng một lần, hết hạn đúng `expiresAt`, kích hoạt users ACTIVE. |
| `POST /auth/resend-verification` | Chờ tối thiểu 60 giây giữa các lần gửi, coalesce gửi đồng thời, SMTP lỗi giữ token cũ đang hiệu lực. |
| `POST /auth/login` | bcrypt so mật khẩu, 401 chung cho sai thông tin, 403 chưa xác thực/khóa/khuyết tật, khóa tài khoản sau 10 lần sai, cookie phiên HttpOnly. |
| `GET /auth/session` | Trả customer công khai (id, name, email), roles, permissions và branchAssignments lọc theo trạng thái ACTIVE và cửa sổ thời gian hiệu lực. |
| `POST /auth/logout` | Cần CSRF proof và origin trong allowlist, thu hồi phiên phía server, 204. |

Lỗi trả `{code, message}` với code ổn định; requestId nằm ở header `X-Request-Id`. Không trả hash, token hay stack trace.

## Cấu hình

Đọc từ biến môi trường, validate khi khởi động: `PORT`, `REPOSITORY` (`sql` hoặc `memory`, memory không chạy ở production), `DATABASE_SERVER`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_ENCRYPT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `EMAIL_VERIFICATION_URL`, `BCRYPT_ROUNDS`, `TOKEN_TTL_MINUTES`, `RESEND_COOLDOWN_SECONDS`, `SESSION_TTL_MINUTES`, `COOKIE_SECURE`, `ALLOWED_ORIGINS`, `LOGIN_RATE_LIMIT`. Mẫu nằm ở `.env.example`. Giữ bí mật SMTP ngoài Git và không ghi mật khẩu hoặc mã xác thực vào nhật ký.

DB lưu `user_verifications` với `verified_at` làm dấu đã dùng và `revoked_at` làm dấu token thay thế; chỉ giữ hash và `expires_at`. `user_sessions` chỉ lưu hash token. `user_login_history` ghi mỗi lần đăng nhập kèm lý do thất bại.

## Chạy và kiểm thử

`npm start` nạp file `marumo_backend/.env` qua `--env-file-if-exists`; file này nằm ngoài Git theo .gitignore và chỉ người dùng giữ nội dung thật. Đổi key env nào phải khớp chuẩn trong phần Cấu hình và `.env.example` trước khi sửa code.

```sh
npm ci --prefix marumo_backend
npm run --prefix marumo_backend start
node --test marumo_backend/test/auth.test.js marumo_backend/test/session.test.js
```

SQL repository test cần `SQL_TEST_USER` và `SQL_TEST_PASSWORD`, tự tạo DB dùng một lần `MarumoAuthTest_*`, áp schema rồi tự xóa:

```sh
node --test marumo_backend/test/sqlRepository.test.js
```

Tài khoản khách tự đăng ký. Quản lý tạo tài khoản nhân viên và cấp vai trò theo phạm vi rạp. Đăng nhập thành công chưa đồng nghĩa có quyền quản trị.
