CHEF-OUTPUT KIT — HƯỚNG DẪN MANG SANG REPO KHÁC

1. Copy thư mục chef-output vào repo đích, giữ đúng đường dẫn:
   <repo>/.qoder/skills/chef-output/

2. Cài dependency (KHÔNG copy node_modules):
   npm install --prefix .qoder/skills/chef-output

3. Chạy init tại thư mục gốc repo đích:
   node .qoder/skills/chef-output/bin/chef.mjs init
   Lệnh này tạo .chef/, thêm Stop hook vào .qoder/settings.json
   và các script chef:* vào package.json nếu repo đã có package.json.

4. Điền cấu hình của repo đích:
   .chef/config.yaml    URL, cổng, lệnh start, tên biến tài khoản test
   .chef/app-map.yaml   feature: auth, code, entry_url, selectors, smoke, taste
   .chef/.env.local     CHEF_ADMIN_EMAIL / CHEF_ADMIN_PASSWORD

5. Kiểm tra lần đầu:
   npm run chef:map
   npm run chef:taste -- <feature> --level=smoke
   npm run chef:taste -- <feature> --level=full
   npm run chef:guard:full

LỆNH TRONG REPO SAU INIT:
   npm run chef:guard
   npm run chef:guard:full
   npm run chef:taste -- <feature>
   npm run chef:taste -- <feature> --level=smoke
   npm run chef:taste:smoke:all
   npm run chef:taste:all
   npm run chef:wip:start -- --note="task dai nhieu buoc"
   npm run chef:wip:end
   npm run chef:baseline

ĐIỀU KIỆN STOP HOOK CHẶN THẬT:
   - .qoder/settings.json có hook trỏ tới .qoder/skills/chef-output/bin/chef.mjs
   - feature nằm trong .chef/app-map.yaml
   - feature protected có auth profile và credential hợp lệ; feature public đặt auth: public
   - evidence mới nhất có code_hash + contract_hash khớp

GHI CHÚ:
   - Task ngắn: smoke; trước commit: full + chef:guard:full.
   - Task dài: wip start ở đầu, wip end sau khi taste full.
   - guard --full luôn enforce evidence, kể cả khi WIP đang mở.
   - Không có credential/môi trường: taste ghi UNVERIFIED và guard chặn khi enforce bật.
   - `contract_hash` bao gồm `.chef/config.yaml` và `.chef/app-map.yaml`; sửa map/config phải taste lại.
   - Allowlist lỗi nên dùng object `{ pattern, reason, url?, expires? }`; entry hết hạn tự động không còn được chấp nhận.
