# Đặc tả MARUMO v1

Đây là contract cần triển khai, không phải mô tả tính năng đã chạy. [PLAN.md](PLAN.md) định nghĩa thứ tự, [TASKS.md](TASKS.md) giữ trạng thái.

## Dữ liệu và biên API

SQL Server sở hữu tài khoản, phiên, quyền, catalog, booking, thanh toán và vé. Client không tự cấp quyền, xác nhận thanh toán hoặc chốt giá. LocalStorage chỉ giữ lựa chọn hiển thị không nhạy cảm. Memory adapter chỉ dùng trong test.

BIGINT truyền qua JSON dưới dạng chuỗi thập phân. API dùng camelCase, repository ánh xạ cột SQL. Giá v1 là số nguyên đơn vị VND, phép tính được kiểm tra bằng decimal tại DB.

## HTTP M2

| Endpoint | Input | Thành công | Từ chối |
| --- | --- | --- | --- |
| GET /health | Không | 200, status ok | Không tiết lộ connection string |
| GET /ready | Không | 200 khi DB và schema sẵn sàng | 503 khi chưa sẵn sàng |
| POST /auth/register | name, email, password | 202 thông báo chung | 400 input sai, 429 quá tần suất |
| POST /auth/verify-email | token | 200, tài khoản ACTIVE | 400 token sai, đã dùng hoặc hết hạn |
| POST /auth/resend-verification | email | 202 thông báo chung | 429 quá tần suất |
| POST /auth/login | email, password | 200 customer và cookie phiên | 401 sai thông tin, 403 chưa xác thực hoặc khóa, 429 quá tần suất |
| GET /auth/session | Cookie | 200 customer và quyền hiệu lực | 401 phiên sai |
| POST /auth/logout | Cookie và CSRF proof | 204 và thu hồi phiên | 403 CSRF sai |

Customer công khai chỉ có id, name, email. Lỗi có code ổn định, message và requestId. Không trả hash, token hoặc stack trace. Sai email và sai mật khẩu trả cùng thông điệp.

## Auth và email

Email trim và lowercase trước kiểm tra duy nhất. Mật khẩu giữ nguyên, không trim. Từ chối đầu vào vượt giới hạn byte bcrypt thay vì cắt ngầm. Task AUTH-001 chốt giới hạn tối thiểu và UI trước triển khai.

Đăng ký tạo users PENDING và hash mật khẩu tại backend. Token dùng nguồn ngẫu nhiên mật mã. DB chỉ giữ hash, expiresAt, usedAt. Hạn mặc định 30 phút; khoảng chờ gửi lại 60 giây. Inject clock vào biên test.

Xác thực dùng cập nhật có điều kiện trong transaction. Tại đúng expiresAt token hết hạn. Hai request cùng token chỉ một thành công. Gửi lại đồng thời không tạo nhiều token hiệu lực. SMTP lỗi không xóa tài khoản. Thay token lỗi không làm mất token cũ đang dùng được. Liên kết email mở trang xác nhận; POST mới tiêu thụ token.

Validate cấu hình SMTP tại startup. Không log secret. Kiểm thử SMTP lỗi và retry bằng SMTP thử nghiệm.

## Phiên và quyền

Session token ngẫu nhiên được lưu bằng hash trong user_sessions. Cookie HttpOnly, Secure ở HTTPS và SameSite phù hợp deployment. CORS chỉ nhận origin cấu hình. Request thay đổi dữ liệu dùng cookie kiểm tra Origin và CSRF proof. Logout thu hồi phía server. DISABLED, khóa tạm và phiên hết hạn đều bị từ chối.

Mặc định từ chối quyền chưa cấp. GLOBAL và BRANCH có phạm vi riêng. Kiểm tra trạng thái và thời gian hiệu lực phân công. Không tin role hoặc branchId do client tự khai. Chốt và seed ma trận role_permissions trước mở admin API. Mã role phải khớp SQL, không suy quyền từ nhãn UI.

## Thời gian và booking

createdAt và updatedAt kỹ thuật lưu UTC. Trường nghiệp vụ đang dùng giờ địa phương theo schema được ánh xạ rõ theo Asia/Saigon. API trả timestamp có offset. Không parse chuỗi ngày hiển thị thành thời điểm nghiệp vụ. Không âm thầm đổi convention SQL trong task auth.

M3 nối admin tạo phim, phiên bản, suất với web đọc cùng DB. Suất có inventory không đổi phòng bằng luồng thông thường. Ghế vật lý và suất cùng phòng.

M4 giữ ghế bằng cập nhật có điều kiện trong transaction. Backend trả thời hạn và snapshot giá. Chỉ booking_seats chưa release còn chiếm ghế. Client không tạo thành công giả khi API lỗi.

M5 xác thực chữ ký provider ở adapter và dùng trường từ payload đã xác thực. Procedure chốt thanh toán và phát vé. Event chưa xong được retry; event thành công không phát thêm vé. Callback muộn không lấy lại ghế của khách khác, phải được ghi nhận để đối soát.

Hủy và hết hạn gọi usp_booking_release, giữ lịch sử và kiểm tra sở hữu ghế. Không có hoàn tiền v1. Quét vé cập nhật có điều kiện một lần. Endpoint booking chi tiết được chốt trong task M4 trước triển khai.

## Nghiệm thu M2

Chạy test auth hiện có sau khi có source, cộng test SQL repository, SMTP lỗi, session thu hồi, CSRF và truy cập sai chi nhánh. Test memory không thay SQL. Web bỏ auth giả khi nối API. Reload, trình duyệt khác và restart không làm mất dữ liệu server. Áp [QUALITY.md](QUALITY.md) cho mọi thay đổi.
