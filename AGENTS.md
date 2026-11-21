# Quy chuẩn agent MARUMO

Đọc docs/PLAN.md, docs/SPEC.md, docs/TASKS.md, docs/QUALITY.md và docs/HANDOFF.md trước khi sửa. Nếu có .agents/skills/poteto-mode/SKILL.md, đọc đầy đủ và dùng playbook tương ứng. Nếu thiếu thư viện pstack cục bộ, theo quy chuẩn được theo dõi trong repo và báo giới hạn. Không giả vờ đã chạy công cụ không có. Chỉ dẫn rõ ràng của người dùng có ưu tiên cao hơn skill.

## Trước khi viết

- Chọn task có phạm vi phù hợp hoặc bổ sung task trước khi triển khai.
- Đọc code và Git thật. Giữ thay đổi ngoài phạm vi của người dùng.
- Nêu giả định và tiêu chí nghiệm thu kiểm tra được. Chỉ hỏi khi thiếu quyết định không thể suy ra an toàn.
- Tái hiện lỗi và xác định nguyên nhân gốc. Chốt cấu trúc trước khi đổi schema, interface hoặc transaction.
- Chọn thay đổi nhỏ nhất. Không thêm abstraction, feature hay cấu hình dự phòng chưa cần.
- Tách agent ghi file bằng worktree riêng. Chỉ một người tích hợp cùng một file.

## Code bắt buộc

- Không dùng useEffect, kể cả alias, namespace hoặc wrapper che hook.
- Không thay bằng useLayoutEffect, useInsertionEffect hay side effect trong render, initializer hoặc useMemo.
- Dùng state suy ra, event handler, remount key, callback ref có cleanup hoặc subscription thật qua useSyncExternalStore.
- Không comment trong code. Đưa lý do và contract vào Markdown. Interpreter directive cần để thực thi không phải comment giải thích.
- Không suppression, baseline hoặc loại file nguồn khỏi lint để làm check xanh.
- Validate dữ liệu tại biên. Nội bộ dùng dữ liệu đã parse. Đặt tên và cấu trúc thể hiện ý nghĩa thay cho comment.
- Không đưa secret, mật khẩu hoặc token vào repository và log.
- Không thay test để chấp nhận hành vi sai. Không bắt lỗi rồi trả thành công giả.

## Kiểm chứng và đầu ra

Tạo hoặc cập nhật handoff/request.json theo docs/HANDOFF.md, rồi chạy npm run check. Runner thực thi quality gate và thêm SQL khi scope yêu cầu. Sửa UI phải kiểm tra hành vi, không chỉ build. Rule mới cần ca sai bị chặn và ca đúng được chấp nhận. Kiểm tra cleanup và request đồng thời khi có tài nguyên chung.

Không báo PASS khi bỏ qua, thiếu dependency, thiếu source hoặc công cụ không chạy được. Chỉ chuyển task sang verified khi có bằng chứng cụ thể. Test auth chưa có source vẫn là backlog, không được tuyên bố CI đã kiểm tra backend.

Không tự commit, mở PR, deploy hoặc áp migration vào DB đang dùng nếu yêu cầu chưa bao gồm hành động đó. Tiếp tục chỉnh sửa đảo ngược được trong phạm vi đã giao mà không hỏi lại quyền đã có.

Không tự viết PASS vào report hoặc receipt. Không bỏ qua Git hook, sửa gate để né lỗi, đổi tracking hoặc dùng cơ chế bypass trust của host. Mọi sửa đổi source, task hay request sau kiểm chứng đều cần chạy lại. Native hook chỉ được coi là hoạt động sau khi host thực sự nạp cấu hình đã review trust.

Cuối lượt có thay đổi, chạy npm run --silent handoff:render và dùng nguyên đầu ra làm câu trả lời cuối. Renderer kiểm tra lại bằng chứng trước khi in. Khai báo outcome partial hoặc blocked và giới hạn thật khi chưa hoàn tất; trạng thái này không qua gate commit/push/CI. Không ghi số đo hoặc phần trăm tiến độ không có bằng chứng.
