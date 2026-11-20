import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { toPosix, walkFiles } from './util.mjs';

const SELECTOR_RE = /^(testid|css|id|text):.+/;
const API_RE = /^(GET|POST|PUT|PATCH|DELETE)\s+\/api\/\S+$/;
const ACTIONS = new Set([
  'goto',
  'login',
  'fill',
  'click',
  'select',
  'expectSelector',
  'expectText',
  'expectUrl',
  'screenshot',
  'wait',
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readSources(roots, projectRoot, extensions) {
  const chunks = [];
  for (const root of roots || []) {
    const abs = path.resolve(projectRoot, root);
    if (!fs.existsSync(abs)) continue;
    const stat = await fsp.stat(abs);
    if (stat.isDirectory()) {
      for (const file of await walkFiles(abs, { extensions })) {
        chunks.push(await fsp.readFile(file, 'utf8'));
      }
    } else {
      chunks.push(await fsp.readFile(abs, 'utf8'));
    }
  }
  return chunks.join('\n');
}

function routeFragment(entryUrl) {
  const clean = entryUrl.split('?')[0].replace(/\/+$/, '');
  if (clean.startsWith('/admin/')) return clean.slice('/admin/'.length);
  return clean.replace(/^\//, '');
}

function checkStep(step, label, errors, selectors) {
  if (!step || typeof step !== 'object') {
    errors.push(`${label}: bước không hợp lệ`);
    return;
  }
  if (!ACTIONS.has(step.action)) {
    errors.push(`${label}: action không hỗ trợ "${step.action}"`);
    return;
  }
  if (step.optional && ['goto', 'login', 'fill', 'select'].includes(step.action)) {
    errors.push(`${label}: optional không được dùng cho action bắt buộc ${step.action}`);
  }
  if (step.optional && ['click', 'expectUrl'].includes(step.action) && !step.optional_reason) {
    errors.push(`${label}: optional ${step.action} cần optional_reason`);
  }
  const needsBy = ['fill', 'click', 'select', 'expectSelector'];
  if (needsBy.includes(step.action)) {
    if (!step.by || !SELECTOR_RE.test(step.by)) {
      errors.push(`${label}: "${step.action}" cần "by" dạng testid:/css:/id:/text:`);
    } else {
      selectors.add(step.by);
    }
  }
  if (step.action === 'expectText' && !step.text) {
    errors.push(`${label}: expectText thiếu text`);
  }
  if (step.action === 'expectUrl' && !step.contains) {
    errors.push(`${label}: expectUrl thiếu contains`);
  }
  if (step.action === 'goto' && !step.url) {
    errors.push(`${label}: goto thiếu url`);
  }
}

export async function checkMap(projectRoot, config, map) {
  const errors = [];
  const warnings = [];
  const selectors = new Set();
  let featureCount = 0;

  if (!map || map.version !== 1) {
    errors.push('app-map.yaml: "version" phải là 1');
  }
  if (!map || !map.features || typeof map.features !== 'object') {
    errors.push('app-map.yaml: thiếu "features"');
    return { ok: false, errors, warnings, stats: { features: 0, selectors: 0 } };
  }

  const extensions = config.project?.source_extensions || ['.js', '.jsx', '.ts', '.tsx'];
  const apiExtensions = config.project?.api_extensions || ['.js', '.ts'];
  const sourceText = await readSources(config.project?.source_roots, projectRoot, extensions);
  const apiText = await readSources(config.project?.api_roots, projectRoot, apiExtensions);
  const routeFile = config.project?.route_file
    ? path.resolve(projectRoot, config.project.route_file)
    : null;
  const routeText = routeFile && fs.existsSync(routeFile)
    ? await fsp.readFile(routeFile, 'utf8')
    : '';

  for (const root of config.project?.source_roots || []) {
    if (!fs.existsSync(path.resolve(projectRoot, root))) {
      errors.push(`source_root không tồn tại: ${root}`);
    }
  }
  for (const root of config.project?.api_roots || []) {
    if (!fs.existsSync(path.resolve(projectRoot, root))) {
      warnings.push(`api_root không tồn tại: ${root} (bỏ qua kiểm tra route)`);
    }
  }
  if (config.project?.route_file && !fs.existsSync(routeFile)) {
    errors.push(`route_file không tồn tại: ${toPosix(path.relative(projectRoot, routeFile))}`);
  }

  for (const step of map.auth?.steps || []) {
    checkStep(step, 'auth.steps', errors, selectors);
  }
  for (const [profile, auth] of Object.entries(map.auth_profiles || {})) {
    if (!auth || !Array.isArray(auth.steps) || auth.steps.length === 0) {
      errors.push(`auth_profiles.${profile}: thiếu steps`);
      continue;
    }
    auth.steps.forEach((step, index) => {
      checkStep(step, `auth_profiles.${profile}.steps[${index + 1}]`, errors, selectors);
    });
  }

  for (const [key, feature] of Object.entries(map.features)) {
    featureCount++;
    if (!feature || typeof feature !== 'object') {
      errors.push(`${key}: feature không hợp lệ`);
      continue;
    }
    if (!feature.title) errors.push(`${key}: thiếu title`);

    const authProfile = feature.auth === 'public' || feature.auth === 'none'
      ? 'public'
      : (typeof feature.auth === 'string' ? feature.auth : feature.auth?.profile || 'admin');
    if (authProfile !== 'public' && !config.app?.accounts?.[authProfile]) {
      errors.push(`${key}: auth profile "${authProfile}" chưa có trong config.app.accounts`);
    }
    if (authProfile !== 'public' && !map.auth_profiles?.[authProfile] && !map.auth?.steps?.length) {
      errors.push(`${key}: auth profile "${authProfile}" chưa có kịch bản login trong app-map`);
    }

    if (!Array.isArray(feature.code) || feature.code.length === 0) {
      errors.push(`${key}: thiếu "code" (file/dir để tính hash evidence)`);
    } else {
      for (const entry of feature.code) {
        if (!fs.existsSync(path.resolve(projectRoot, entry))) {
          errors.push(`${key}: code path không tồn tại - ${entry}`);
        }
      }
    }

    if (feature.entry_url) {
      if (!feature.entry_url.startsWith('/')) {
        errors.push(`${key}: entry_url phải bắt đầu bằng "/"`);
      } else if (routeText) {
        const fragment = routeFragment(feature.entry_url);
        const pattern = new RegExp(`path=["']/?${escapeRegExp(fragment)}["']`);
        if (!pattern.test(routeText)) {
          errors.push(
            `${key}: entry_url "${feature.entry_url}" không thấy trong ${toPosix(
              path.relative(projectRoot, routeFile),
            )}`,
          );
        }
      }
    }

    for (const selector of feature.selectors || []) {
      if (!SELECTOR_RE.test(selector)) {
        errors.push(`${key}: selector không hợp lệ - ${selector}`);
        continue;
      }
      selectors.add(selector);
    }

    for (const api of feature.api || []) {
      if (!API_RE.test(api)) {
        errors.push(`${key}: api phải có dạng "METHOD /api/..." - ${api}`);
        continue;
      }
      const tail = api.split(/\s+/)[1].split('/').filter(Boolean).pop();
      const present = apiText.includes(`"/${tail}"`) || apiText.includes(`'/${tail}'`);
      if (!present) {
        warnings.push(`${key}: không thấy route "/${tail}" trong api_roots (kiểm tra thủ công)`);
      }
    }

    if (!Array.isArray(feature.taste) || feature.taste.length === 0) {
      errors.push(`${key}: thiếu "taste" (kịch bản chạy thật)`);
    } else {
      feature.taste.forEach((step, index) => {
        checkStep(step, `${key}.taste[${index + 1}]`, errors, selectors);
      });
    }

    if (feature.smoke !== undefined) {
      if (!Array.isArray(feature.smoke) || feature.smoke.length === 0) {
        errors.push(`${key}: "smoke" phải là mảng không rỗng khi khai báo`);
      } else {
        feature.smoke.forEach((step, index) => {
          checkStep(step, `${key}.smoke[${index + 1}]`, errors, selectors);
        });
      }
    }
  }

  for (const selector of selectors) {
    if (selector.startsWith('testid:')) {
      const id = selector.slice('testid:'.length);
      if (!sourceText.includes(`data-testid="${id}"`) && !sourceText.includes(`data-testid='${id}'`)) {
        errors.push(`selector testid:${id} không thấy trong source_roots`);
      }
    } else if (selector.startsWith('id:')) {
      const id = selector.slice('id:'.length);
      if (!sourceText.includes(`id="${id}"`) && !sourceText.includes(`id='${id}'`)) {
        warnings.push(`selector id:${id} không thấy trong source_roots (có thể render động)`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { features: featureCount, selectors: selectors.size },
  };
}
