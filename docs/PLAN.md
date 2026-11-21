# Kế hoạch MARUMO

Mục tiêu là đưa admin và web lên dữ liệu SQL Server chung, rồi hoàn thành một luồng mua vé có kiểm soát đồng thời. Contract nằm ở [SPEC.md](SPEC.md), trạng thái ở [TASKS.md](TASKS.md), chuẩn đầu ra ở [QUALITY.md](QUALITY.md).

## Điểm xuất phát

Backend có đặc tả và test auth nhưng chưa có source triển khai. Admin dùng mock data. Web xử lý tài khoản và booking bằng localStorage. Các luồng đó chưa chứng minh đăng nhập hay thanh toán thật.

Bốn bản sửa SQL đã được kiểm thử ở lượt trước. Migration chưa áp vào MarumoDB đang dùng. Việc tạo quality gate không đồng nghĩa các mốc sản phẩm đã hoàn thành.

## Mốc thực hiện

| Mốc | Phạm vi | Phụ thuộc | Điều kiện ra mốc |
| --- | --- | --- | --- |
| M0 | Plan, spec, task, lint, Git/native hook và CI | Không | Rule chặn ca sai và nhận ca đúng; handoff khớp source và thực thi; activation native theo QG-009 |
| M1 | Migration DB dev và seed tối thiểu | M0 | Test tạo mới và nâng cấp qua; có một rạp, phòng, ghế, phim và suất |
| M2 | Express, SQL repository, email, auth, session và quyền | M1 | Đăng ký ở A, xác thực, đăng nhập ở B; restart vẫn giữ tài khoản |
| M3 | Admin tạo phim và suất; web đọc catalog | M2 | Admin và web đọc cùng bản ghi; API kiểm tra quyền chi nhánh |
| M4 | Giữ ghế và booking chờ thanh toán | M3 | Hai khách tranh ghế chỉ một thắng; hết hạn trả ghế; server chốt giá |
| M5 | Thanh toán sandbox, vé, quét và hủy | M4 | Callback lặp không tạo vé trùng; quét một lần; hủy giữ lịch sử |

## Giới hạn và nghiệm thu

Không mở rộng hoàn tiền, loyalty, khuyến mãi hoặc báo cáo tài chính trong M1 và M2. Không tích hợp provider thật trước khi luồng sandbox được nghiệm thu.

Mỗi mốc cần test trên interface thật, bằng chứng chạy và task liên kết trước khi verified. CI không có SQL Server không phải bằng chứng tích hợp DB. Quyền publish, deploy và migration theo phạm vi người dùng giao.

Sau M0 thực hiện DB-001, DB-002 rồi BE-001 theo dependency trong TASKS.md. Chốt contract auth trước khi thay auth giả của web.
