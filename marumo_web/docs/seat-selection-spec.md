# Quy tắc chọn ghế

## Plan

1. Đặc tả điều kiện trước khi sửa logic.
2. Viết kiểm thử các ca được phép/chặn.
3. Kiểm tra lựa chọn cuối cùng tại nút Tiếp tục.
4. Chạy kiểm thử, build và thao tác thật trên browser.

## Spec

- Chỉ kiểm tra khi nhấn Tiếp tục ở bước chọn ghế. Không chặn thao tác chọn/bỏ ghế.
- Chặn thì giữ nguyên ghế đã chọn, không bắt đầu giữ ghế và không sang bước thức ăn.
- Từ hai chỗ ngồi trở lên: các chỗ phải tạo thành một nhóm nối liền qua cạnh ngang/dọc. Chỉ chạm chéo hoặc tách cụm là không hợp lệ.
- Nhóm không được tạo ra một ghế trống đơn ở bên trái/phải, kẹp giữa nhóm và ghế đã đặt/chọn. Ghế trống ở cột đầu/cuối được phép.
- Khách đi đơn: chặn nếu ghế chọn tạo khoảng hở ngang một ghế tới ghế đã đặt trước và hai ghế ngang sát bên ghế chọn đều còn trống.
- Ngoại lệ khách đi đơn lấp chỗ: nếu ghế chọn sát ít nhất một ghế đã đặt theo chiều ngang, cho phép khe hở ngang mới; khe hở theo chiều dọc vẫn bị chặn.
- Không buộc khách sửa khoảng trống có sẵn, không tiếp giáp lựa chọn hiện tại.
- Ghế đôi chiếm hai cột liền nhau, tính là hai chỗ ngồi; một ghế đôi trống không phải khoảng hở một chỗ.

### Các ví dụ quyết định

| Trạng thái trước | Lựa chọn | Kết quả |
| --- | --- | --- |
| D5 đã đặt; D6, D7, D8 trống | D7 | Chặn: hở D6, D7 chưa sát ghế đã đặt |
| B6 đã đặt; B3, B4, B5 trống | B4 | Chặn: hở B5, B4 chưa sát ghế đã đặt |
| B3, B6 đã đặt; B4, B5 trống | B4 | Cho phép: B4 sát B3, đang lấp chỗ còn lại |
| B3, B6 đã đặt; B4, B5 trống | B5 | Cho phép: B5 sát B6 |
| D5, D8 đã đặt; D6, D7 trống | D7 | Cho phép: D7 sát D8 theo hàng ngang |
| Một vùng trống liên tục | Một ghế ở giữa | Cho phép: không tạo ghế trống bị kẹp |
| Vùng trống | E5, E7 | Chặn: hai ghế tách rời |
| Vùng trống | E6, E7 hoặc D7, E7 | Cho phép nếu không tạo ghế lẻ hai bên |
| Vùng trống | B1, D1 hoặc B12, D12 | Cho phép: ghế trống thuộc cột biên |

## Tasks

- [x] Thay kiểm tra khe ghế bằng kiểm tra lựa chọn đầy đủ.
- [x] Thêm kiểm thử hồi quy D7 và cả hai trạng thái B4.
- [x] Kiểm tra nhóm ngang/dọc, tách cụm, cột biên, ghế đôi và lấp khe.
- [x] Kiểm tra UI thật: chọn ghế không báo lỗi, nhấn Tiếp tục mới kiểm tra.
- [x] Chạy bộ test đặt vé, build, diff check; ghi kết quả.

## Check

- `node --test --import tsx src/utils/bookingLogic.test.js`: 17/17 passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Browser tab thử nghiệm: chọn D7 không báo lỗi ngay; nhấn Tiếp tục báo khe D6 và giữ nguyên bước ghế. B4 (B3 đã đặt) đi tiếp thành công. B1/B2 và D8/E8 đi tiếp thành công.
- Browser tab trên ngày 20/11 tái hiện B4 bị chặn khi B3/B5 trống và B6 đã đặt.
- Browser: sau chọn D7, chọn thêm D6 vẫn còn một khe dọc E7 sát ghế F7 đã đặt nên tiếp tục bị chặn; ca này xác nhận kiểm tra khe cả theo chiều dọc.
