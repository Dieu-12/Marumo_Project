# Contract DB hiện tại

File khởi tạo là SQL/MarumoDB.sql. Migration nâng cấp và cách chạy nằm trong SQL/migrations/README.md. Tài liệu này giữ các quyết định nghiệp vụ đã có trong schema trước khi bỏ comment khỏi code.

## Tài khoản và dữ liệu lịch sử

users.status dùng PENDING, ACTIVE và DISABLED. Khóa đăng nhập tạm thời dùng locked_until. Phân công chi nhánh dùng ACTIVE, SUSPENDED và REVOKED; thời gian hiệu lực còn phụ thuộc ends_at.

Foreign key dùng NO ACTION. Giữ lịch sử bằng trạng thái thay vì xóa cứng. Danh sách quyền chính thức chưa được seed; API phải mặc định từ chối quyền chưa cấp.

## Giờ và số tiền

created_at và updated_at kỹ thuật lưu UTC. Ứng dụng chịu trách nhiệm cập nhật updated_at. Giờ suất chiếu, giữ ghế và các thời điểm nghiệp vụ đang theo giờ địa phương. Giữ convention này khi tích hợp; API phải thể hiện offset rõ ràng.

Giá vé được chốt trong booking và booking_seats. Giá cấu hình hoặc quy tắc hiện tại không được tính lại lịch sử. Mỗi booking có tối đa một đơn F&B đi kèm và một payment_transaction cho tổng vé cùng món. Retry thanh toán nằm trong payment_attempts. Phạm vi hiện tại không có hoàn tiền.

## Lịch chiếu và ghế

Phòng bị chiếm từ start_at trừ preparation_minutes tới end_at cộng cleanup_minutes. Tạo và đổi lịch qua usp_showtime_create hoặc usp_showtime_reschedule để kiểm tra chồng lấn. Ghi trực tiếp bảng bỏ qua các kiểm tra nghiệp vụ của procedure.

Suất, showtime_seats và ghế vật lý phải cùng phòng. Chỉ đổi phòng khi suất chưa có dữ liệu ghế. booking_seats có released_at khác NULL chỉ giữ lịch sử. Unique filtered index bảo vệ một phân bổ chưa release cho mỗi ghế của suất.

Giữ ghế và quét vé phải dùng cập nhật có điều kiện trong transaction. Hủy hoặc hết hạn qua usp_booking_release. Procedure giữ nguyên vé lịch sử, vô hiệu hóa vé và trả quyền chiếm ghế. Callback thanh toán muộn không được xác nhận lại ghế đã release.

## Kho, audit và cấu hình

fnb_inventory là tồn tổng theo chi nhánh và nguyên liệu. Tồn theo lô và lịch sử giao dịch phải được cập nhật cùng transaction. Mỗi phân bổ kho có idempotency_key riêng. Lô hết hạn không được nhập bổ sung hoặc bán. Dùng procedure kho để giữ tổng tồn khớp tổng lô và tôn trọng phần đã giữ cho đơn.

Các bảng audit và lịch sử được bảo vệ khỏi UPDATE và DELETE. Cấu hình thuộc system_settings và branch_settings; giá trị chi nhánh thắng giá trị toàn hệ thống. Không lưu secret trong các bảng cấu hình này.
