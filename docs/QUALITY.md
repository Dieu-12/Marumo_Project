# Chuẩn đầu ra và quality gate

## Quy tắc pstack được áp dụng

Encode Lessons in Structure đưa lỗi lặp thành rule chạy được. Architect chốt ownership và contract trước khi đổi schema, interface hoặc transaction. Prove It Works yêu cầu đọc lại artifact thật và kết quả chạy. Task, code, kiểm chứng và triển khai có trạng thái riêng.

Chọn thay đổi nhỏ nhất đạt tiêu chí task. Không refactor lân cận hoặc thêm abstraction một caller. Mỗi agent ghi vào worktree riêng; một owner tích hợp file chung. Không dùng summary của agent thay kết quả chạy và review diff.

## Quy tắc code

Code do dự án quản lý không có comment. Phạm vi gồm JS, JSX, TS, TSX, SQL, CSS, HTML, YAML, PowerShell và shell hook. Markdown là nơi lưu lý do và contract. Thư viện pstack cài cục bộ, dependency và artifact sinh tự động không thuộc code ứng dụng. Interpreter directive phục vụ thực thi được giữ. Contract DB trước đây nằm trong comment được giữ tại DATABASE.md.

Cấm effect hook, gồm alias và namespace. Cấm thay bằng layout hoặc insertion effect. Cấm DOM, storage, listener hoặc timer side effect trong render và useMemo. Dùng event handler, state suy ra, remount key, callback ref có cleanup và subscription cho external store thật.

Không suppression, baseline nợ cũ, bỏ qua file nguồn, catch lỗi rồi trả thành công hoặc continue-on-error để qua gate. Rule phân biệt comment với URL hay delimiter trong string. Lỗi parser JS, TS, JSON, CSS và YAML làm check thất bại. SQL, PowerShell và shell được kiểm tra comment; đây không phải kiểm tra cú pháp hay thực thi đầy đủ của các ngôn ngữ đó. HTML được kiểm tra comment và code inline; parser HTML có khả năng phục hồi nên không phải validator HTML nghiêm ngặt.

## Kiểm tra cục bộ

Chạy npm ci tại root, npm ci --prefix marumo_web và npm ci --prefix marumo_admin. Cài Chromium bằng npx playwright install chromium. Tạo request theo [HANDOFF.md](HANDOFF.md), rồi chạy npm run check tại root. Command này sinh report/receipt sau khi thực thi policy, ca hồi quy, unit test đã có implementation, build hai app và smoke test trình duyệt. Khi scope thay đổi SQL hoặc runner SQL, nó bắt buộc chạy thêm SQL trên DB dùng một lần. npm run quality chạy riêng phần lint, unit, build và UI để điều tra, không tạo bằng chứng bàn giao.

Cài Git hook bằng npm run hooks:install. Installer từ chối ghi đè cấu hình hook không thuộc dự án. Pre-commit lint Git index và đối chiếu index với report/receipt đã kiểm chứng. Pre-push đối chiếu commit, rồi chạy lại các check bắt buộc. Chạy installer lại không làm mất hook hay thay đổi ngoài dự án.

Windows dùng SQL/tests/Invoke-DbIntegrityTests.ps1 với integrated authentication. CI dùng runner Node SQL authentication và container tạm. Thiếu kết nối SQL làm gate thất bại. Thay đổi UI phải kiểm tra hành vi bị tác động, gồm cleanup, focus, keyboard, storage và timer tương ứng.

## Phạm vi CI

CI checkout đúng commit payload, kiểm tra scope với base của sự kiện GitHub và chạy lại lint, test policy, unit frontend, build, smoke test Chromium bằng dependency lockfile. Nếu SQL hoặc runner SQL đổi, CI tạo SQL Server tạm, kiểm thử và dọn đúng container sở hữu. Receipt/log CI được tải thành artifact. CI trả mã lỗi thật khi check lỗi; không tin PASS của report cục bộ. Cấu hình workflow chưa phải bằng chứng workflow đã chạy trên GitHub. Required branch checks cần được cấu hình riêng trên remote.

Backend hiện có test auth nhưng thiếu source. Quality gate này không tuyên bố auth đã qua test. AUTH-001 đến AUTH-004 phải bổ sung job chạy contract auth và SQL repository trước nghiệm thu M2. Test integrity schema hiện có không thay thế kiểm thử API chưa triển khai.

## Bằng chứng và báo cáo

Trước sửa lỗi, ghi input và kết quả sai tái hiện được. Sau sửa, chạy lại cùng ca đó và một ca đúng lân cận. Kiểm tra rule bằng counterexample thực sự bị chặn. Không tính lệnh chưa chạy, bị bỏ qua hoặc thiếu source là PASS.

Cuối lượt có thay đổi dùng nguyên đầu ra npm run --silent handoff:render. JSON schema giới hạn trường được khai; runner gắn kết quả với snapshot và log của command thật. Native Stop hook, khi đã được host trust/nạp, kiểm tra final message khớp renderer. Không báo đã deploy khi chỉ sửa file, đã migrate khi chỉ chạy DB thử hoặc đã review độc lập khi tự review.

Các trạng thái task và dependency phải hợp lệ theo [TASKS.md](TASKS.md). Verified bắt buộc có bằng chứng cụ thể. Không tự commit, publish, mở PR hoặc áp migration nếu nằm ngoài quyền người dùng giao.
