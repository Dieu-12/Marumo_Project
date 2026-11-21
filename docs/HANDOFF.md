# Cơ chế kiểm soát bàn giao

## Dữ liệu và trách nhiệm

Agent viết `handoff/request.json`. Schema bắt buộc có version, baseCommit, taskIds, outcome, goal, mainFiles, risks và limitations. Outcome nhận completed, partial hoặc blocked. Task phải tồn tại trong TASKS.md. Main files phải là file thật đã thay đổi so với base.

Runner sinh `handoff/report.json`, không nhận PASS từ agent. Report chứa request, hash snapshot đầy đủ, danh sách file thêm/sửa/xóa, Git blob và file mode, check bắt buộc và trạng thái thực thi. Deployment luôn là not_performed. Không thêm số test, phần trăm hoặc claim tự do vào report.

Runner giữ `.quality/receipt.json` và `.quality/logs/` ngoài Git. Receipt ghi run ID, command argv cố định, exit code thật, hash log, snapshot trước/sau và trạng thái kết thúc. Không có receipt, log bị sửa, source đổi giữa lúc chạy, thiếu check hoặc run chưa kết thúc đều bị chặn. Đây là áp dụng Encode Lessons in Structure và Prove It Works của pstack bằng rule thực thi.

Snapshot dùng Git-normalized blobs để Windows và CI thống nhất. Nó bao gồm source, asset, lockfile, task, request, schema, validator và workflow. Report tự sinh được loại khỏi hash để tránh tự tham chiếu. Dependency, `.quality`, `.audit`, `.agents` cục bộ và artifact build/test được loại khỏi snapshot. File ngoài Git và không bị ignore vẫn được tính; file đã xóa vẫn xuất hiện trong scope. File mode được kiểm tra; Git submodule chưa được hỗ trợ và bị từ chối.

## Quy trình sử dụng

Cài dependency và Chromium theo QUALITY.md. Trước khi sửa, đọc task và chọn phạm vi. Sau khi sửa, khởi tạo request với base thật của đợt thay đổi.

```sh
npm run handoff:init -- --base origin/main --task QG-006 --goal "Mục tiêu quan sát được" --main scripts/handoff/core.mjs
```

Không có origin/main thì dùng commit gốc của phạm vi, không chọn base mới để giấu diff. Init mặc định dùng merge-base HEAD với origin/main, hoặc HEAD nếu chưa có remote đó. Xem lại request, ghi rủi ro/giới hạn thật và không liệt kê file chưa thay đổi. Init chỉ tạo request, không kiểm chứng thành công.

```sh
npm run handoff:verify
npm run handoff:check
npm run --silent handoff:render
```

`npm run check` tương đương handoff:verify. Verify chạy `scripts/quality/run.mjs` với danh sách lệnh cố định. Khi SQL hoặc runner SQL thay đổi, nó chạy thêm `scripts/handoff/sql-check.mjs`. Không có cờ skip hay command do report cung cấp. Sửa bất kỳ nguồn, task hoặc request nào sau đó phải verify lại. Dùng nguyên nội dung renderer làm final message, không thêm claim PASS bên ngoài.

Khi chưa xong, đặt outcome partial/blocked và giới hạn trước khi chạy verify. Lệnh vẫn trả lỗi nếu check lỗi nhưng lưu report và receipt thật. Renderer có thể in báo cáo chưa hoàn tất khi bằng chứng còn khớp; commit/push/CI vẫn chặn. Thiếu cả môi trường chạy là giới hạn, không phải PASS.

## Git và CI

Chạy `npm run hooks:install`. Pre-commit đọc staged source, lint và đối chiếu report/receipt. Stage một phần khác snapshot đã test bị chặn. Pre-push đối chiếu commit và chạy `npm run handoff:ci`, tạo receipt mới bằng việc chạy lại check. Report/request phải đi cùng commit payload; không commit receipt hoặc log.

CI dùng cùng handoff:ci, không tin log hay PASS ở máy agent. `HANDOFF_BASE_REF` của CI phải resolve được; merge-base với HEAD phải khớp baseCommit trong request. Checkout có full history và đúng PR head thay vì merge commit tổng hợp. Report scope sai làm job dừng trước khi chạy SQL. Đẩy một nhánh hoàn toàn mới không có base hợp lệ cần chốt base trước; không bỏ kiểm tra này để tạo CI xanh.

CI cấp mật khẩu SQL ngẫu nhiên qua environment và mask log, tạo container riêng theo run/attempt, rồi cleanup trong bước always. Node runner chỉ tạo/xóa DB tên UUID của chính nó. Không chạy phần CREATE/USE MarumoDB của schema gốc. Windows dùng integrated authentication nếu không có SQL_TEST_USER; SQL authentication yêu cầu SQL_TEST_USER và SQL_TEST_PASSWORD cùng host/port. Không ghi credential vào request hay report.

## Native Codex hook

`.codex/hooks.json` khai báo UserPromptSubmit và Stop. UserPromptSubmit ghi baseline theo session/turn vào `.quality/turns/`. Stop cho phép lượt chỉ đọc khi source và report không đổi. Nếu có thay đổi, Stop kiểm tra handoff hiện tại và yêu cầu last_assistant_message khớp renderer. Thiếu baseline cũng phải kiểm tra. Chỉ chuẩn hóa CRLF và khoảng trắng đầu/cuối, không bỏ qua nội dung.

Stop trả JSON decision block khi sai. Trạng thái awaitingStop phân biệt lượt bị ngắt với lượt đã kết thúc. Nếu source/report đổi trong lượt chưa qua Stop, prompt tiếp theo phải giữ pendingValidation. Pending sống qua prompt tiếp tục; stop_hook_active không phải cờ bypass. Lượt đã kết thúc cho phép người dùng sửa code rồi yêu cầu một lượt chỉ review. Report-only edit trong lượt cũng phải kiểm tra. State phiên dùng tên hash, không dùng trực tiếp session ID làm đường dẫn. Đây là áp dụng Make Operations Idempotent cho lượt tiếp tục sau lỗi.

Tạo file và synthetic test không bật hook trong host. Codex yêu cầu review trust nội dung hook trong giao diện Hooks. Chỉ ghi QG-009 verified sau khi host thật đã nạp cấu hình và chứng kiến ca sai bị chặn, ca đúng được nhận. Không sửa trust record thủ công hoặc dùng cờ bypass. Không tự bật hook toàn cục.

## Phục hồi run bị ngắt

Verify tạo lock độc quyền chứa PID. Trong khi lock còn tồn tại, receipt cũ không được dùng. Hai runner không ghi chung receipt.

```sh
npm run handoff:recover
npm run handoff:verify
```

Recover chỉ gỡ lock khi PID đã chết và lock không đổi; nó vô hiệu receipt cũ trước khi gỡ lock. PID còn sống hoặc lock không đọc được phải được điều tra, không xóa mù theo tuổi file.

## Biên tin cậy và giới hạn

Gate chặn lỗi vô ý, bằng chứng cũ và claim không khớp thực thi. Actor có cùng quyền ghi source vẫn có thể sửa cả validator lẫn receipt. Review thay đổi gate, CI chạy lại và required branch checks trên remote tạo biên tin cậy bên ngoài máy agent. Không tuyên bố chống được actor cố tình kiểm soát cùng tài khoản.

Schema không chứng minh ý nghĩa nghiệp vụ của goal hoặc rủi ro viết tự do. Các check hiện có chỉ bao phủ implementation đang tồn tại; không tính backend auth chưa có source là đã test. Hook Git có thể bị Git bypass, native hook có thể chưa được trust; không dùng các lớp cục bộ thay branch protection. File workflow không phải bằng chứng đã chạy trên GitHub. Báo cáo luôn tách kiểm chứng trên DB thử khỏi migration vào DB đang dùng.
