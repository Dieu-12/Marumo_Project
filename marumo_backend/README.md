# Marumo Backend

## Phạm vi khởi tạo

Backend dùng Node.js và Express để cung cấp API. bcrypt dùng để băm mật khẩu. SMTP dùng để gửi email xác thực. Đặc tả dữ liệu và các luồng rạp nằm trong [SQL/NGHIEP_VU.md](../SQL/NGHIEP_VU.md).

## Xác thực tài khoản

| API dự kiến | Hành vi |
| --- | --- |
| `GET /health` | Kiểm tra tiến trình Express đang chạy. |
| `POST /auth/register` | Kiểm tra dữ liệu đăng ký, chuẩn hóa email, băm mật khẩu và tạo tài khoản chờ xác thực. Gửi liên kết xác thực bằng SMTP. |
| `POST /auth/verify-email` | Kiểm tra mã trong liên kết. Nếu mã hợp lệ, chưa dùng và còn hạn, kích hoạt tài khoản và đánh dấu mã đã dùng trong cùng một giao dịch khi có SQL. |
| `POST /auth/resend-verification` | Cho phép gửi lại sau khoảng chờ. Trả cùng thông báo cho email không tồn tại và email đã xác thực để hạn chế dò tài khoản. |
| `POST /auth/login` | So sánh mật khẩu bằng bcrypt. Chỉ cấp phiên đăng nhập sau khi tài khoản đã xác thực email và đang hoạt động. |

- Yêu cầu email duy nhất sau khi chuẩn hóa. Giới hạn kích thước đầu vào cho bcrypt để tránh mật khẩu khác nhau bị cắt thành cùng một chuỗi. Áp dụng giới hạn tần suất cho đăng ký, đăng nhập và gửi lại.
- Sinh mã xác thực ngẫu nhiên. Chỉ lưu giá trị băm của mã, thời điểm hết hạn và thời điểm sử dụng. Một tài khoản chỉ có một mã đang hiệu lực. Điểm bắt đầu đề xuất là mã có hạn 30 phút và gửi lại cách nhau ít nhất 60 giây.
- Nếu SMTP gửi thất bại, giữ tài khoản ở trạng thái chờ. Khách có thể thử gửi lại. Khi thay mã, xử lý gửi lỗi và gửi trùng để một lần gửi thất bại không làm mất lối xác thực.
- Liên kết trong email mở trang xác thực. Trang đó gửi yêu cầu POST khi người dùng xác nhận, tránh để trình quét liên kết vô tình dùng mã.
- Đọc cấu hình SMTP và URL xác thực từ biến môi trường. Mẫu cấu hình gồm `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` và `EMAIL_VERIFICATION_URL`. Giữ bí mật SMTP ngoài Git và không ghi mật khẩu hoặc mã xác thực vào nhật ký.
- Tài khoản khách tự đăng ký. Quản lý tạo tài khoản nhân viên và cấp vai trò theo phạm vi rạp. Đăng nhập thành công chưa đồng nghĩa có quyền quản trị.

## Tiêu chí nghiệm thu cho bản khởi tạo

1. Express chạy được và trả kết quả kiểm tra sức khỏe.
2. Đăng ký lưu mật khẩu đã băm và gửi email qua cấu hình SMTP thử nghiệm.
3. Mã hết hạn hoặc đã dùng bị từ chối. Tài khoản chưa xác thực hoặc bị khóa không đăng nhập được.
4. Gửi lại phục hồi được sau khi SMTP lỗi. Việc gửi lại và đăng nhập được giới hạn tần suất.
5. Nếu cần chạy bản thử trước khi chọn SQL, chỉ dùng kho dữ liệu trong bộ nhớ ở chế độ phát triển và ghi rõ dữ liệu mất khi khởi động lại.

Đây là đặc tả để triển khai. Mã Express và kết nối SMTP chưa được tạo trong dự án.

