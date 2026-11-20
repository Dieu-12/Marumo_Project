---
name: chef-output
description: Quy chuẩn đầu ra "bếp trưởng": bắt buộc agent chạy ứng dụng thật (Playwright + Chrome) theo app-map, chụp evidence (screenshot, console, network) và vượt guard trước khi báo hoàn thành. Dùng khi kết thúc/đánh giá một feature UI hoặc backend, khi repo có thư mục .chef/, hoặc khi được yêu cầu thiết lập quy chuẩn/guardrail cho dự án.
---

# Chef Output — Quy chuẩn đầu ra

Món ăn phải được nếm bằng máy, không bằng lời.

## Nguyên tắc

1. Không evidence = chưa xong. Không được nói "đã kiểm tra" nếu chưa thực sự chạy.
2. Thiếu môi trường (DB, credential, server) thì ghi `UNVERIFIED` kèm lý do; cấm claim PASS.
3. UI đổi thì cập nhật selector ổn định và `.chef/app-map.yaml` trong cùng thay đổi; ưu tiên `data-testid` cho điểm tương tác chính.
4. Rào chắn là script, không phải lời nhắc: Stop hook chặn kết thúc lượt khi guard đỏ.

## Vị trí

- Kit: `.qoder/skills/chef-output/` — copy nguyên thư mục sang repo khác là dùng được.
- Cấu hình dự án: `.chef/config.yaml`
- Bản đồ tính năng: `.chef/app-map.yaml`
- Evidence: `.chef/evidence/<feature>/<timestamp>/`
- Credential test: `.chef/.env.local` (không commit)

## Quy trình bắt buộc

1. Đọc `.chef/app-map.yaml` trước khi sửa feature: biết URL, bước UI, selector, API và bẫy đã biết. `traps` là ghi chú cho người chạy, không tự động kiểm tra DB.
2. Sửa code; nếu UI đổi, thêm/sửa selector ổn định và cập nhật map.
3. Chạy `npm run chef:map` — map phải trỏ tới file/route/selector còn sống.
4. Chạy `npm run chef:taste -- <feature>` — Playwright mở Chrome/Edge, đăng nhập, đi đúng luồng, chụp screenshot + console + network, ghi evidence.
5. Chạy `npm run chef:guard:full` — map + rule + evidence + lint/build/test.
6. Chỉ báo hoàn thành khi guard xanh và evidence mới nhất là `pass`. Nếu là `unverified`, phải nói rõ lý do và không được nói "đã kiểm tra".

## Lệnh

```bash
node .qoder/skills/chef-output/bin/chef.mjs init          # bootstrap .chef, hook Stop, npm scripts
node .qoder/skills/chef-output/bin/chef.mjs map-check     # kiểm tra app-map
node .qoder/skills/chef-output/bin/chef.mjs guard         # kiểm tra nhanh (map + rule + evidence)
node .qoder/skills/chef-output/bin/chef.mjs guard --full  # thêm lint/build/test
node .qoder/skills/chef-output/bin/chef.mjs taste <key>   # chạy Playwright, ghi evidence
node .qoder/skills/chef-output/bin/chef.mjs taste <key> --level=smoke
node .qoder/skills/chef-output/bin/chef.mjs taste --all   # chạy toàn bộ feature trong map
node .qoder/skills/chef-output/bin/chef.mjs wip start --note="mô tả task"
node .qoder/skills/chef-output/bin/chef.mjs wip end
node .qoder/skills/chef-output/bin/chef.mjs baseline      # ghi nhận vi phạm cũ đã được chấp thuận
```

## Task ngắn vs task dài

- **Task ngắn / sửa nhỏ trong feature đã map**: chạy `taste <feature> --level=smoke` (mở trang, không lỗi console). Stop hook chấp nhận evidence smoke.
- **Trước khi commit/bàn giao**: chạy `taste --all` (full) và `guard --full`; guard full bắt buộc evidence full.
- **Task dài nhiều bước**:
  1. `wip start --note="mô tả task"` — các lượt trung gian không bị chặn evidence (map/rule vẫn chặn).
  2. Làm việc; có thể chạy smoke giữa chừng.
  3. Kết thúc: chạy full taste cho feature bị ảnh hưởng (hoặc `taste --all`), `wip end`, rồi `guard --full`.
- WIP hết hạn sau `wip.default_minutes` (mặc định 480 phút) và sẽ bị bỏ qua. `guard --full` luôn enforce evidence kể cả khi WIP đang mở.

## Định dạng app-map (tóm tắt)

- `auth.steps`: các bước đăng nhập dùng chung; `auth_profiles.<profile>.steps` cho vai trò có luồng riêng (action `login` sẽ chèn đúng profile của feature).
- `features.<key>`: `title`, `auth` (`public`/`none` hoặc tên profile trong `config.app.accounts`), `code` (file/dir để tính hash evidence), `api`, `entry_url`, `selectors`, `taste` (danh sách bước), `traps`.
- Action hỗ trợ: `goto`, `login`, `fill`, `click`, `select`, `expectSelector`, `expectText`, `expectUrl`, `screenshot`, `wait`. `click` có thể kèm `expect_download` (regex tên file).
- Selector: `testid:<id>` → `[data-testid="<id>"]`; `css:<selector>`; `id:<id>`; `text:<text>`.
- Biến môi trường trong bước: `{{CHEF_ADMIN_EMAIL}}`, `{{CHEF_ADMIN_PASSWORD}}`; bước fill credential phải có `secret: true` để log được che.

## Khi Stop hook chặn (exit 2)

- Đọc danh sách feature trong thông báo và chạy đúng lệnh `npm run chef:taste -- <feature>`.
- Không sửa guard/baseline để né chặn. Baseline chỉ dành cho vi phạm cũ đã được người dùng chấp thuận.

Evidence chỉ hợp lệ khi cả `code_hash` và `contract_hash` (config + app-map) khớp. `PASS` là đã chạy thật; thiếu credential, service hoặc môi trường là `UNVERIFIED` và bị chặn khi `evidence.enforce: true`; lỗi sau khi chạy là `FAIL`.

## Portability

1. Copy `.qoder/skills/chef-output` sang repo đích (giữ đúng đường dẫn). Kit chạy độc lập bằng Node; npm scripts chỉ được thêm nếu repo đã có `package.json`.
2. Chạy `node .qoder/skills/chef-output/bin/chef.mjs init`.
3. Điền `.chef/config.yaml` (URL, lệnh start, account env), `.chef/app-map.yaml` (feature + selector), `.chef/.env.local` (credential test).
4. `npm install` trong thư mục kit để có `playwright-core` + `yaml` (dùng Chrome/Edge sẵn có trên máy).
