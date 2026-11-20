import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const HOOK_COMMAND = 'node .qoder/skills/chef-output/bin/chef.mjs guard --mode=stop';

async function copyIfMissing(templatePath, targetPath, changes) {
  if (fs.existsSync(targetPath)) {
    changes.push(`skip (đã có): ${targetPath}`);
    return;
  }
  await fsp.copyFile(templatePath, targetPath);
  changes.push(`tạo: ${targetPath}`);
}

async function mergeHook(projectRoot, changes) {
  const settingsPath = path.join(projectRoot, '.qoder', 'settings.json');
  await fsp.mkdir(path.dirname(settingsPath), { recursive: true });

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(await fsp.readFile(settingsPath, 'utf8'));
    } catch {
      changes.push(`skip hook: ${settingsPath} không phải JSON hợp lệ`);
      return;
    }
  }

  settings.hooks = settings.hooks || {};
  settings.hooks.Stop = settings.hooks.Stop || [];
  const exists = settings.hooks.Stop.some((group) =>
    (group.hooks || []).some((hook) => hook.command === HOOK_COMMAND),
  );
  if (!exists) {
    settings.hooks.Stop.push({
      hooks: [{ type: 'command', command: HOOK_COMMAND }],
    });
    changes.push('hook: thêm Stop guard vào .qoder/settings.json');
  } else {
    changes.push('hook: đã có, giữ nguyên');
  }
  await fsp.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

async function mergePackageScripts(projectRoot, changes) {
  const packagePath = path.join(projectRoot, 'package.json');
  let pkg;
  if (fs.existsSync(packagePath)) {
    try {
      pkg = JSON.parse(await fsp.readFile(packagePath, 'utf8'));
    } catch {
      changes.push(`skip scripts: ${packagePath} không phải JSON hợp lệ`);
      return;
    }
  } else {
    changes.push('skip scripts: repo không có package.json (dùng CLI trực tiếp hoặc tích hợp runner riêng)');
    return;
  }

  pkg.scripts = pkg.scripts || {};
  const scripts = {
    'chef:map': 'node .qoder/skills/chef-output/bin/chef.mjs map-check',
    'chef:guard': 'node .qoder/skills/chef-output/bin/chef.mjs guard',
    'chef:guard:full': 'node .qoder/skills/chef-output/bin/chef.mjs guard --full',
    'chef:taste': 'node .qoder/skills/chef-output/bin/chef.mjs taste',
    'chef:taste:smoke:all': 'node .qoder/skills/chef-output/bin/chef.mjs taste --all --level=smoke',
    'chef:taste:all': 'node .qoder/skills/chef-output/bin/chef.mjs taste --all',
    'chef:wip:start': 'node .qoder/skills/chef-output/bin/chef.mjs wip start',
    'chef:wip:end': 'node .qoder/skills/chef-output/bin/chef.mjs wip end',
    'chef:baseline': 'node .qoder/skills/chef-output/bin/chef.mjs baseline',
  };
  let added = 0;
  for (const [name, command] of Object.entries(scripts)) {
    if (!pkg.scripts[name]) {
      pkg.scripts[name] = command;
      added++;
    }
  }
  if (added > 0) changes.push(`scripts: thêm ${added} lệnh chef:*`);
  else changes.push('scripts: đã có, giữ nguyên');
  await fsp.writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

export async function initProject({ projectRoot, kitRoot, log = console.log }) {
  const changes = [];
  const chefDir = path.join(projectRoot, '.chef');
  await fsp.mkdir(path.join(chefDir, 'evidence'), { recursive: true });

  const templates = path.join(kitRoot, 'templates');
  await copyIfMissing(
    path.join(templates, 'config.template.yaml'),
    path.join(chefDir, 'config.yaml'),
    changes,
  );
  await copyIfMissing(
    path.join(templates, 'app-map.template.yaml'),
    path.join(chefDir, 'app-map.yaml'),
    changes,
  );
  await copyIfMissing(
    path.join(templates, 'env.local.example'),
    path.join(chefDir, '.env.local.example'),
    changes,
  );

  const gitignorePath = path.join(chefDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    await fsp.writeFile(gitignorePath, '.env.local\nevidence/\n');
    changes.push('tạo: .chef/.gitignore');
  }

  await mergeHook(projectRoot, changes);
  await mergePackageScripts(projectRoot, changes);

  log('[chef] init xong:');
  for (const change of changes) log(`  - ${change}`);
  log('');
  log('Bước tiếp theo:');
  log('  1. Sửa .chef/config.yaml cho dự án (URL, lệnh start, account env).');
  log('  2. Điền .chef/app-map.yaml (feature, selector, kịch bản taste).');
  log('  3. Copy .chef/.env.local.example -> .chef/.env.local và điền credential test.');
  log('  4. npm run chef:map && npm run chef:taste -- <feature> (hoặc gọi trực tiếp node .qoder/skills/chef-output/bin/chef.mjs ...)');

  return changes;
}
