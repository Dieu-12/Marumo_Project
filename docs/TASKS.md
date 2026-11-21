# Task MARUMO

Status hợp lệ là planned, active, blocked và verified. Depends on chứa ID task cách nhau bằng dấu phẩy hoặc dấu gạch ngang khi không có. Chỉ verified khi Evidence chỉ tới file và lệnh cùng kết quả đã kiểm tra. Code đã viết không đồng nghĩa đã triển khai. Các task sản phẩm dưới đây chưa được thực hiện trong lượt tạo quality gate.

| ID | Status | Depends on | Deliverable | Verification | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| QG-001 | verified | - | Plan, spec, task và AGENTS đồng bộ | Kiểm tra liên kết, ID, dependency và contract | docs/PLAN.md, docs/SPEC.md; npm run lint PASS |
| QG-002 | verified | - | Lint cấm effect hook, comment và suppression | Ca sai thất bại, URL và string hợp lệ qua | scripts/quality/policy.test.mjs; npm run test:quality PASS |
| QG-003 | verified | QG-002 | Hook staged snapshot và file CI quality | Staged sai bị chặn dù working tree đúng; CI command chạy cục bộ | .githooks, .github/workflows/quality.yml; npm run hooks:install PASS hai lần; npm run test:quality PASS |
| QG-004 | verified | QG-002 | Bỏ effect hook và comment hiện có, giữ hành vi | Unit, build và hành vi cleanup, modal, carousel | npm run check PASS 51 test và 5 smoke test; SQL/tests/Invoke-DbIntegrityTests.ps1 PASS |
| QG-005 | verified | QG-001, QG-003, QG-004 | Review độc lập và kết quả gate | npm run check và review đúng diff | npm run check PASS; reviewer gates chạy npm run lint và npm run test:quality PASS; reviewer lifecycle chạy npm run test:ui -- --grep quick-ticket PASS |
| QG-006 | verified | QG-005 | Báo cáo JSON và receipt đối chiếu Git, lệnh thực chạy | Báo cáo thiếu, sai scope, stale hoặc khai PASS sai bị chặn | scripts/handoff/core.test.mjs; npm run check PASS; node .audit/handoff/probe.mjs PASS với Git index chính giữ nguyên |
| QG-007 | verified | QG-006 | Native Stop adapter kiểm tra đúng câu trả lời cuối | Read-only qua; code đổi phải có report và final trùng renderer; interruption và continuation không né gate | node --test scripts/handoff/native-hook.test.mjs PASS; node .audit/handoff/probe.mjs PASS với native process; review độc lập PASS |
| QG-008 | verified | QG-006 | Job CI kiểm tra committed scope và runner SQL dùng một lần | Node SQL-auth chạy trên DB dùng một lần; check lỗi không được báo PASS | scripts/handoff/sql-integration.mjs; node .audit/handoff/sql-review/run.mjs PASS; core.test.mjs recertify commit PASS |
| QG-009 | blocked | QG-007 | Kích hoạt native hook trên host sau review trust | Host thực sự nạp và gọi hook | Cần review trust của Codex; không đồng nghĩa đã bật khi có file |
| QG-010 | planned | QG-008 | Chạy job GitHub với Docker SQL và bật required branch checks | PR có check thật; check lỗi ngăn merge; artifact có receipt/log | Cấu hình đã có; workflow remote và branch protection chưa thực hiện |
| QG-011 | verified | QG-003, QG-006 | Pre-push chạy trên Git đi kèm Codex khi thiếu Bash | Git hook thật chạy npm CLI; nested check lỗi vẫn từ chối push | node --test scripts/quality/pre-push.test.mjs PASS hai ca Git thật; review độc lập PASS |
| DB-001 | planned | QG-005 | Áp migration vào DB dev được chỉ định | Test SQL tạo mới, nâng cấp và kiểm tra schema đích | Migration chưa áp MarumoDB |
| DB-002 | planned | DB-001 | Seed một rạp, phòng, ghế, phim, suất | Chạy seed hai lần không trùng; đọc lại đủ liên kết | Chưa có |
| BE-001 | planned | DB-002 | Express app, startup, config và SQL pool | Health 200; ready 503 khi DB lỗi; shutdown đóng pool | Chưa có src backend |
| AUTH-001 | planned | BE-001 | Validation và register với SQL repository | Email chuẩn hóa; bcrypt không cắt input; duplicate phản hồi chung | Có contract test tại marumo_backend/test/auth.test.js, chưa có implementation |
| AUTH-002 | planned | AUTH-001 | Verify, resend và SMTP adapter | Token biên hết hạn; concurrent verify; gửi lại lỗi vẫn phục hồi | Chưa có |
| AUTH-003 | planned | AUTH-002 | Login, session, logout và CSRF | Test phiên SQL qua restart, thu hồi và cookie; test CSRF | Chưa có |
| AUTH-004 | planned | AUTH-003 | Seed quyền và kiểm tra phạm vi chi nhánh | Ma trận allow và deny; client không tự nâng quyền | Ma trận quyền chưa chốt |
| WEB-001 | planned | AUTH-003 | Web dùng auth API thật | Đăng ký ở A, xác thực, login ở B; không lưu credential local | Hiện là demo localStorage |
| CAT-001 | planned | AUTH-004 | Admin tạo phim, phiên bản và suất qua API | Test quyền, định dạng phòng, lịch trùng và validation | Chưa có |
| CAT-002 | planned | CAT-001 | Web đọc catalog API | Admin tạo bản ghi và web đọc đúng bản ghi đó | Chưa có |
| BKG-001 | planned | CAT-002, WEB-001 | API giữ ghế và booking chờ thanh toán | Request đồng thời; hết hạn; server chốt giá | Chưa có |
| PAY-001 | planned | BKG-001 | Provider sandbox và webhook | Chữ ký sai, callback lặp, retry và callback muộn | Chưa có |
| TKT-001 | planned | PAY-001 | Vé, quét và hủy qua API | Quét một lần; vé cũ vô hiệu; ghế bán lại được | Chưa có |

## Cách cập nhật

Task active có một owner và phạm vi file rõ ràng trong brief. Khi phát hiện lỗi, thêm task hoặc ca hồi quy vào task đang sửa. Không sửa trạng thái để giấu check thất bại. Ghi blocker cụ thể nếu cần quyền hoặc tài nguyên không có. Khi verified, giữ bằng chứng lệnh, kết quả và phạm vi thực sự được kiểm tra.

Bản sửa SQL ở lượt trước được mô tả trong SQL/migrations/README.md và test trong SQL/tests. Việc đó chưa hoàn thành DB-001 vì DB dev đang dùng chưa được nâng cấp.

QG-006 đến QG-008 nghiệm thu implementation cục bộ và các ca có thể chạy trên máy này. Activation native và job Docker/GitHub thật được theo dõi riêng ở QG-009/QG-010. Review đã tái hiện và kiểm tra bản sửa cho file mode, biến CI lọt vào Git fixture và lượt bị ngắt trước Stop. Không coi synthetic/native process test là hook đã được host trust.
