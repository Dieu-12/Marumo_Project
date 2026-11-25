# Marumo Backend

## Triển khai hiện tại

Backend dùng Node.js 22+ và Express để cung cấp API. bcrypt băm mật khẩu. SMTP gửi email xác thực qua nodemailer. Repository có hai cài đặt: SQL Server qua mssql cho chạy thật và memory cho test. Đặc tả dữ liệu và các luồng rạp nằm trong [docs/SPEC.md](../docs/SPEC.md).

Cấu trúc source:

| Thư mục / tệp | Trách nhiệm |
| --- | --- |
| `src/server.js` | Khởi động: đọc config, mở pool SQL, dịch vụ lắng nghe, tắt sạch pool khi SIGTERM/SIGINT. |
| `src/app.js` | `createApp(options)`: Express app, helmet, serve `/public`, giới hạn 16kb, requestId, `/health`, `/ready`, handler lỗi. |
| `src/routes/` | Khai báo verb, path và chuỗi middleware cho từng nhóm API. |
| `src/controllers/` | Đọc request, parse đầu vào, gọi service và dựng response HTTP. |
| `src/services/` | Nghiệp vụ: orchestration gọi repository, adapter SMTP và VNPAY, ánh xạ lỗi domain. |
| `src/repositories/` | Đọc/ghi SQL Server và phiên bản memory cho chạy không DB. |
| `src/middlewares/` | Phiên JWT, CSRF, origin proof và kiểm tra quyền. |
| `src/configs/` | Đọc và validate biến môi trường khi khởi động. |
| `src/constants/` | Hằng số nghiệp vụ dùng chung: trạng thái phim/suất, tên cookie, giới hạn booking. |
| `src/utils/` | Parse tại biên, cookie, token ngẫu nhiên, HttpError. |
| `public/` | Ảnh sản phẩm serve tĩnh qua `/public`. |

## Ảnh sản phẩm trong public/

`public/` được serve tĩnh tại đường dẫn `/public`. Ảnh của mỗi phim nằm trong thư mục tên slug phim, ví dụ `public/movies/dem-trang-o-sai-gon/poster.jpg`. URL tương ứng `/public/movies/<slug>/poster.jpg` là giá trị lưu vào `movie_media.media_url` để API trả về cho web. Mọi ảnh thêm vào phải nằm trong đúng thư mục slug của phim đó.

## API

| Endpoint | Hành vi |
| --- | --- |
| `GET /health` | 200 `{status:"ok"}` khi tiến trình chạy. |
| `GET /ready` | 200 khi DB sẵn sàng, 503 khi probe lỗi, không tiết lộ connection string. |
| `POST /auth/register` | Email trim+lowercase, mật khẩu băm, tạo users PENDING, gửi email xác thực. Trả 202 thông báo chung kể cả email trùng. |
| `POST /auth/verify-email` | Cập nhật có điều kiện trong transaction: một token chỉ dùng một lần, hết hạn đúng `expiresAt`, kích hoạt users ACTIVE. |
| `POST /auth/resend-verification` | Chờ tối thiểu 60 giây giữa các lần gửi, coalesce gửi đồng thời, SMTP lỗi giữ token cũ đang hiệu lực. |
| `POST /auth/login` | bcrypt so mật khẩu, 401 chung cho sai thông tin, 403 chưa xác thực/khóa/vô hiệu hóa. Trả customer, roles, permissions, branchAssignments và đặt JWT trong cookie HttpOnly. |
| `GET /auth/session` | Trả customer công khai (id, name, email), roles, permissions và branchAssignments lọc theo trạng thái ACTIVE và cửa sổ thời gian hiệu lực. |
| `POST /auth/logout` | Cần CSRF proof và origin trong allowlist, thu hồi phiên phía server, 204. |

Lỗi trả `{code, message, requestId}` với code ổn định. Request ID khớp header `X-Request-Id`. Không trả hash, token hay stack trace.

## Cấu hình

Đọc từ biến môi trường, validate khi khởi động: `PORT`, `REPOSITORY` (`sql` hoặc `memory`, memory không chạy ở production), `DATABASE_SERVER`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_ENCRYPT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `EMAIL_VERIFICATION_URL`, `BCRYPT_ROUNDS`, `TOKEN_TTL_MINUTES`, `RESEND_COOLDOWN_SECONDS`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `COOKIE_HTTP_ONLY`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `ALLOWED_ORIGINS`, `LOGIN_RATE_LIMIT`. Mẫu nằm ở `.env.example`. Giữ bí mật JWT/SMTP ngoài Git và không ghi mật khẩu, khóa ký hoặc token vào nhật ký.

DB lưu `user_verifications` với `verified_at` làm dấu đã dùng và `revoked_at` làm dấu token thay thế; chỉ giữ hash và `expires_at`. `user_sessions` chỉ lưu hash token. `user_login_history` ghi mỗi lần đăng nhập kèm lý do thất bại.

## JWT và cookie phiên

`JWT_SECRET` bắt buộc có ít nhất 32 byte UTF-8. Backend không sinh khóa thay thế hoặc dùng khóa mặc định. `JWT_EXPIRES_IN` là nguồn hạn phiên duy nhất, mặc định `1d`. Giá trị gồm số nguyên dương và đơn vị `s`, `m`, `h` hoặc `d`, tối đa 30 ngày. `SESSION_TTL_MINUTES` cũ không còn điều khiển phiên đăng nhập.

Cookie `marumo_session` chứa JWT ký HS256, có `sub` là ID thập phân, `jti` ngẫu nhiên, `iat`, `exp` và snapshot mã role đang active. Issuer là `marumo-api`, audience là `marumo-browser`, loại token là `marumo-session+jwt`. Backend xác thực chữ ký và các claim trước khi đọc phiên DB, sau đó đối chiếu `sub` với user của phiên. DB lưu SHA-256 của toàn bộ JWT và thời điểm hết hạn đúng bằng `exp`.

JWT dùng thời gian giây nguyên, `exp - iat` bằng hạn cấu hình. Cookie dùng `Max-Age` bằng hạn đó. Cookie có thể còn được trình duyệt gửi sau khi JWT hết hạn do phần lẻ của giây hoặc độ trễ truyền. Backend luôn từ chối tại đúng `exp`, kể cả cookie còn tồn tại.

`COOKIE_HTTP_ONLY` phải là `true`. `COOKIE_SECURE` mặc định `false` ở dev và `true` ở production; production từ chối giá trị `false`. `COOKIE_SAME_SITE` nhận `lax`, `strict`, `none` không phân biệt hoa thường, mặc định `lax`. `none` yêu cầu Secure. Cookie phiên và CSRF dùng cùng Secure/SameSite và `Path=/`. Chỉ cookie `marumo_csrf` được JavaScript đọc để gửi `X-CSRF-Token`.

JWT role chỉ là snapshot. `/auth/session` và API quản trị đọc lại role, quyền và phân công từ DB. Role bị vô hiệu hóa hoặc thu hồi không còn cấp quyền, dù JWT cũ còn hạn. Logout thu hồi phiên ở DB, nên JWT không thể phát lại sau logout. Tài khoản bị vô hiệu hóa, khóa tạm hoặc phiên hết hạn đều bị từ chối.

JWT không xuất hiện trong response JSON hoặc localStorage. Web nhận thông tin role từ API ngay khi login. Cookie phiên dạng token ngẫu nhiên cũ không còn được chấp nhận; người dùng cần đăng nhập lại sau khi nâng cấp.

Triển khai JWT dùng [jose](https://github.com/panva/jose) với allowlist HS256 và xác thực claim theo [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html).

## Chạy và kiểm thử

`npm start` nạp file `marumo_backend/.env` qua `--env-file-if-exists`; file này nằm ngoài Git theo .gitignore và chỉ người dùng giữ nội dung thật. Đổi key env nào phải khớp chuẩn trong phần Cấu hình và `.env.example` trước khi sửa code.

```sh
npm ci --prefix marumo_backend
npm run --prefix marumo_backend start
```

Tài khoản khách tự đăng ký. Quản lý tạo tài khoản nhân viên và cấp vai trò theo phạm vi rạp. Đăng nhập thành công chưa đồng nghĩa có quyền quản trị.
