# Áp bản sửa tính toàn vẹn DB

Chạy các lệnh từ thư mục gốc repository. Các lệnh dùng Windows Authentication và `sqlcmd`.

## Kiểm thử trên DB riêng

```powershell
& .\SQL\tests\Invoke-DbIntegrityTests.ps1 -Server localhost
```

Script tạo database `MarumoIntegrityTest_<guid>`, chạy migration nhiều lần và kiểm thử các luồng nghiệp vụ cùng request đồng thời. Script xóa database thử khi kết thúc. Nhật ký nằm trong thư mục tạm được in ở dòng kết quả.

Để kiểm tra nâng cấp từ một bản schema cũ, truyền đường dẫn tới file đó.

```powershell
& .\SQL\tests\Invoke-DbIntegrityTests.ps1 -Server localhost -BaselineSchema C:\path\MarumoDB-before.sql
```

## Nâng cấp DB hiện hữu

```powershell
sqlcmd -S localhost -E -C -I -f 65001 -b -d MarumoDB -i .\SQL\migrations\20261121_db_integrity.sql
```

Migration chạy trong một transaction và có thể chạy lại. Nó giữ nguyên ID booking, dòng ghế và vé lịch sử. Nó đánh dấu release cho phân bổ của booking đã hủy hoặc hết hạn, đồng thời giữ lượt giữ ghế hiện tại của khách khác.

Migration dừng nếu có ghế sai phòng hoặc booking đã hủy, hết hạn nhưng còn vé `ISSUED` hay `USED`. Xử lý các dòng được báo trước khi chạy lại. Dùng SQLCMD Mode nếu chạy file migration trong SSMS.

## Cập nhật bên gọi

Khi thêm `showtime_seats`, truyền `auditorium_id` của suất chiếu. DB kiểm tra phòng của suất và ghế vật lý phải khớp.

Hủy booking bằng procedure sau. Procedure giữ lịch sử vé và trả ghế trong cùng transaction.

```sql
EXEC dbo.usp_booking_release
    @booking_id = 123,
    @status_code = 'CANCELLED',
    @actor_user_id = 456,
    @reason = N'Khách yêu cầu hủy';
```

Tác vụ dọn booking hết hạn gọi cùng procedure với `@status_code = 'EXPIRED'`. Procedure chỉ chấp nhận booking chờ thanh toán đã hết hạn.

Khi tạo phân bổ ghế trong transaction, khóa `showtime_seats` bằng `UPDLOCK, HOLDLOCK` trước khi thêm `booking_seats`. Chỉ dòng `booking_seats` có `released_at IS NULL` còn chiếm ghế. Nếu finalize phát hiện bất kỳ dòng ghế nào đã release, toàn bộ booking bị từ chối xác nhận.

`usp_payment_provider_event_apply` tiếp tục nhận kết quả xác thực chữ ký từ ứng dụng. Truyền các trường thanh toán lấy từ payload đã xác thực. Procedure lưu request sai chữ ký để audit, cho phép thử lại event chưa hoàn tất và chống phát hành vé trùng.
