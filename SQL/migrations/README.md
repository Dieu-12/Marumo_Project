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

## Migration 20261123_fnb_booking.sql (FNB-001)

```powershell
sqlcmd -S localhost -E -C -I -f 65001 -b -v DATABASE_NAME="MarumoDB" -i .\SQL\migrations\20261123_fnb_booking.sql
```

Migration additive, chạy lại được: tạo `promotion_codes` và `promotion_redemptions` (unique filtered index cho một lượt ACTIVE mỗi booking, chặn DELETE), proc `usp_booking_apply_promo` (gọi trong transaction tạo booking, không tự mở transaction), nạp lại `usp_booking_release` (huỷ đơn F&B PENDING, xóa giữ kho có hạn, chuyển redemption ACTIVE sang VOID khi booking chưa thanh toán) và `usp_booking_pay_with_points` (tổng điểm bằng vé cộng đơn F&B, đơn F&B sang PAID kèm chuyển giữ kho thành vĩnh viễn).

Mã khuyến mãi hỗ trợ PERCENT và AMOUNT, giới hạn tổng lượt, lượt mỗi tài khoản, chi nhánh, cửa sổ thời gian theo giờ địa phương Asia/Saigon và giá trị đơn tối thiểu tính trên vé cộng món. Giảm giá chỉ áp lên tiền vé và được chặn bởi ràng buộc `total_amount = subtotal_amount - discount_amount` của bảng `bookings`.

## Migration 20261125_loyalty_conversion.sql

Sao lưu DB đích và kiểm tra backup trước khi nâng cấp. Chạy F&B trước conversion trên DB đang dùng tỷ lệ cũ.

```powershell
sqlcmd -S localhost -E -C -I -f 65001 -b -d MarumoDB -v "DATABASE_NAME=MarumoDB" -i .\SQL\migrations\20261125_loyalty_conversion.sql
```

Dùng đường dẫn Windows với dấu gạch chéo ngược cho tham số `-i` và `-o` của sqlcmd. Trên host hiện tại, đường dẫn `C:/Users/...` bị ODBC sqlcmd hiểu thành tùy chọn `/U` và báo xung đột với `-E`.

Conversion đặt tỷ lệ tích 10.000 ₫/điểm và đổi 1.000 ₫/điểm. Chạy lại riêng conversion khi version bằng 2 không đổi thêm số dư hoặc ledger. Không chạy lại migration F&B sau conversion vì nó ghi đè `usp_booking_pay_with_points` về phép tính cũ. DB-005 theo dõi sửa hành vi chạy lại cả chuỗi. Sau triển khai, kiểm tra settings và định nghĩa procedure cuối cùng; GET /loyalty phải trả hai tỷ lệ mới.

Ngày 2026-11-25 đã áp F&B rồi conversion lên MarumoDB dev. Backup trước nâng cấp là `C:\Program Files\Microsoft SQL Server\MSSQL17.MSSQLSERVER\MSSQL\Backup\MarumoDB_20261125_before_checkout_7f31b9c2.bak`. BACKUP CHECKSUM và RESTORE VERIFYONLY thành công. Số dòng của mọi bảng nghiệp vụ có trước migration giữ nguyên; ví 310000/10000/200000 thành 310/10/200 cho số dư/tổng tích/tổng đổi. Bằng chứng chi tiết nằm trong `%TEMP%\marumo-checkout-20261125` trên máy nghiệm thu.
