import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const projectRoot = process.cwd();
const kitRoot = path.resolve(projectRoot, '.qoder/skills/chef-output');

const require = createRequire(import.meta.url);
let YAML;
try {
  YAML = require(require.resolve('yaml', { paths: [kitRoot] }));
} catch {
  console.error('[map-drift] Không tìm thấy thư viện yaml trong kit. Chạy: npm ci --prefix .qoder/skills/chef-output');
  process.exit(1);
}

const configPath = path.join(projectRoot, '.chef', 'config.yaml');
if (!fs.existsSync(configPath)) {
  console.error('[map-drift] Chưa có .chef/config.yaml');
  process.exit(1);
}
const config = YAML.parse(fs.readFileSync(configPath, 'utf8')) || {};
const mapPath = path.resolve(projectRoot, config.map || '.chef/app-map.yaml');
if (!fs.existsSync(mapPath)) {
  console.error('[map-drift] Chưa có app-map:', config.map || '.chef/app-map.yaml');
  process.exit(1);
}
const map = YAML.parse(fs.readFileSync(mapPath, 'utf8')) || {};

const routeRel = config.project?.route_file;
const routeFile = routeRel ? path.resolve(projectRoot, routeRel) : null;
if (!routeRel || !routeFile || !fs.existsSync(routeFile)) {
  console.error('[map-drift] route_file không tồn tại:', routeRel || '(chưa khai báo)');
  process.exit(1);
}

const LEGACY_UNMAPPED = new Set([
  '/movies',
  '/promotions',
  '/membership',
  '/dang-ky',
  '/tickets',
]);

const normalize = (route) => {
  const clean = route.split('?')[0].replace(/\/+$/, '');
  return clean === '' ? '/' : clean;
};

const routeText = fs.readFileSync(routeFile, 'utf8');
const declaredRoutes = [...routeText.matchAll(/path=["']([^"']+)["']/g)].map((match) => normalize(match[1]));
const staticRoutes = [...new Set(declaredRoutes)].filter((route) => !route.includes(':') && !route.includes('*'));

const mappedRoutes = new Set(
  Object.values(map.features || {})
    .map((feature) => feature?.entry_url)
    .filter(Boolean)
    .map(normalize),
);

const unmapped = staticRoutes.filter((route) => !mappedRoutes.has(route) && !LEGACY_UNMAPPED.has(route));
const legacy = staticRoutes.filter((route) => !mappedRoutes.has(route) && LEGACY_UNMAPPED.has(route));

console.log(`[map-drift] routes tĩnh: ${staticRoutes.length}, đã map: ${staticRoutes.filter((r) => mappedRoutes.has(r)).length}`);
for (const route of legacy) {
  console.log(`[map-drift] WARN legacy chưa map: ${route}`);
}
if (unmapped.length > 0) {
  console.error('[map-drift] FAIL — route mới chưa có trong app-map:');
  for (const route of unmapped) {
    console.error(`  - ${route}`);
  }
  console.error('Thêm feature tương ứng vào .chef/app-map.yaml (code + selectors + taste) hoặc bổ sung vào LEGACY_UNMAPPED nếu cố ý bỏ qua.');
  process.exit(1);
}
console.log('[map-drift] OK — mọi route tĩnh đều đã map hoặc nằm trong legacy-ignore');
