import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { loadProject } from './config.mjs';
import { credentialsReady, featureAuthProfile } from './evidence.mjs';
import {
  delay,
  hashPaths,
  isPortOpen,
  killTree,
  sanitize,
  stamp,
  waitForPortClosed,
} from './util.mjs';

class EnvError extends Error {
  constructor(message, details = '') {
    super(message);
    this.details = details;
  }
}

class UnverifiedError extends Error {}

function resolveSelector(by) {
  if (by.startsWith('testid:')) {
    return `[data-testid="${by.slice('testid:'.length).replace(/"/g, '\\"')}"]`;
  }
  if (by.startsWith('css:')) return by.slice('css:'.length);
  if (by.startsWith('id:')) return `#${by.slice('id:'.length)}`;
  if (by.startsWith('text:')) return `text=${by.slice('text:'.length)}`;
  return by;
}

function interpolate(value, env) {
  return String(value).replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (env[key] === undefined || env[key] === '') {
      throw new Error(`Thiếu biến môi trường ${key} (điền trong .chef/.env.local)`);
    }
    return env[key];
  });
}

async function safeScreenshot(page, runDir, name, result) {
  const filename = `${String(result.screenshots.length + 1).padStart(2, '0')}-${name}.png`;
  try {
    await page.screenshot({ path: path.join(runDir, filename), fullPage: true });
    result.screenshots.push(filename);
  } catch (error) {
    result.notes.push(`screenshot lỗi: ${error.message}`);
  }
}

async function isHttpUp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function waitServiceReady(service, child, logs) {
  const ready = service.ready || {};
  const timeoutMs = ready.timeout_ms || 60000;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child && child.exitCode !== null) {
      throw new EnvError(`Service "${service.name}" thoát sớm (exit ${child.exitCode}).`, logs());
    }
    if (ready.type === 'http') {
      if (await isHttpUp(ready.url)) return;
    } else if (ready.type === 'port') {
      if (await isPortOpen(ready.host || '127.0.0.1', Number(ready.port))) return;
    } else {
      await delay(1000);
      return;
    }
    await delay(500);
  }
  throw new EnvError(
    `Service "${service.name}" không sẵn sàng sau ${timeoutMs}ms.`,
    logs(),
  );
}

function servicePort(service) {
  const ready = service.ready || {};
  if (ready.type === 'port') return { host: ready.host || '127.0.0.1', port: Number(ready.port) };
  if (ready.type === 'http') {
    try {
      const url = new URL(ready.url);
      return { host: url.hostname, port: Number(url.port || 80) };
    } catch {
      return null;
    }
  }
  return null;
}

async function launchBrowser() {
  let lastError;
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch (error) {
      lastError = error;
    }
  }
  throw new EnvError(`Không mở được Chrome/Edge: ${lastError?.message || 'unknown'}`);
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function allowlistPatterns(entries = []) {
  const now = new Date();
  return entries.flatMap((entry) => {
    const pattern = typeof entry === 'string' ? entry : entry?.pattern;
    if (!pattern) return [];
    if (typeof entry === 'object' && entry.expires && new Date(entry.expires) < now) return [];
    try {
      return [{
        pattern: new RegExp(pattern, 'i'),
        url: typeof entry === 'object' && entry.url ? new RegExp(entry.url, 'i') : null,
      }];
    } catch {
      return [];
    }
  });
}

function allowlisted(entries, probe, url = '') {
  return entries.some((entry) => entry.pattern.test(probe) && (!entry.url || entry.url.test(url)));
}

function authStepsFor(map, profile) {
  return map.auth_profiles?.[profile]?.steps || map.auth?.steps || [];
}

async function executeStep(ctx, step, depth = 0) {
  const { page, env, config, map, result, runDir } = ctx;
  const timeout = step.timeout_ms || 15000;

  switch (step.action) {
    case 'goto': {
      const target = new URL(step.url, config.app.base_url).href;
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout });
      return;
    }
    case 'login': {
      if (depth > 2) throw new Error('login lồng quá sâu');
      if (!ctx.credentials) throw new UnverifiedError('Thiếu credential trong .chef/.env.local');
      for (const authStep of authStepsFor(map, ctx.authProfile)) {
        await executeStep(ctx, authStep, depth + 1);
      }
      return;
    }
    case 'fill': {
      const value = interpolate(step.value, env);
      if (step.secret) result.secrets.push(value);
      await page.locator(resolveSelector(step.by)).first().fill(value, { timeout });
      return;
    }
    case 'click': {
      const locator = page.locator(resolveSelector(step.by)).first();
      if (step.expect_download) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout }),
          locator.click({ timeout }),
        ]);
        const name = download.suggestedFilename();
        if (step.expect_download !== true && !new RegExp(step.expect_download).test(name)) {
          throw new Error(`Tên file download không khớp regex: ${name}`);
        }
        result.notes.push(`download: ${name}`);
        await download.cancel?.().catch(() => {});
      } else {
        await locator.click({ timeout });
      }
      return;
    }
    case 'select': {
      await page.locator(resolveSelector(step.by)).first().selectOption(String(step.value), { timeout });
      return;
    }
    case 'expectSelector': {
      await page.locator(resolveSelector(step.by)).first().waitFor({ state: 'visible', timeout });
      return;
    }
    case 'expectText': {
      await page.getByText(step.text, { exact: Boolean(step.exact) }).first().waitFor({ state: 'visible', timeout });
      return;
    }
    case 'expectUrl': {
      await page.waitForURL((url) => url.href.includes(step.contains), { timeout });
      return;
    }
    case 'screenshot': {
      await safeScreenshot(page, runDir, step.name || `step-${result.steps.length + 1}`, result);
      return;
    }
    case 'wait': {
      await page.waitForTimeout(step.ms || 500);
      return;
    }
    default:
      throw new Error(`action không hỗ trợ: ${step.action}`);
  }
}

function renderReport(result, feature) {
  const lines = [
    `# Evidence — ${feature.title || result.feature}`,
    '',
    `- Feature: \`${result.feature}\``,
    `- Level: **${result.level}**`,
    `- Status: **${result.status.toUpperCase()}**`,
    `- Started: ${result.started_at}`,
    `- Finished: ${result.finished_at}`,
    `- Base URL: ${result.base_url}`,
    `- Code hash: \`${result.code_hash}\``,
    `- Contract hash: \`${result.contract_hash}\``,
    `- Credentials ready: ${result.credentials_ready ? 'yes' : 'no'}`,
    '',
    '## Các bước',
    '',
    '| # | Bước | Kết quả |',
    '| --- | --- | --- |',
    ...result.steps.map((entry, index) => {
      const outcome = entry.ok ? 'OK' : entry.skipped ? 'SKIP' : `FAIL: ${entry.error || ''}`;
      return `| ${index + 1} | ${String(entry.step).replace(/\|/g, '\\|')} | ${outcome.replace(/\|/g, '\\|')} |`;
    }),
    '',
    '## Ghi chú',
    '',
    ...(result.notes.length ? result.notes.map((note) => `- ${note}`) : ['- (không có)']),
    '',
    '## Console errors',
    '',
    ...(result.consoleErrors.length ? result.consoleErrors.map((item) => `- ${item}`) : ['- (không có)']),
    '',
    '## Page errors',
    '',
    ...(result.pageErrors.length ? result.pageErrors.map((item) => `- ${item}`) : ['- (không có)']),
    '',
    '## Network failures',
    '',
    ...(result.networkFailures.length
      ? result.networkFailures.map((item) => `- ${item.status || item.error || ''} ${item.url}`)
      : ['- (không có)']),
    '',
    '## API calls',
    '',
    ...(result.apiCalls.length
      ? result.apiCalls.map((item) => `- ${item.method} ${item.status} ${item.url}`)
      : ['- (không có)']),
    '',
    '## Screenshots',
    '',
    ...(result.screenshots.length ? result.screenshots.map((item) => `- ${item}`) : ['- (không có)']),
    '',
  ];
  return lines.join('\n');
}

export async function runTaste({ projectRoot, featureKey, level = 'full', log = console.log }) {
  const project = await loadProject(projectRoot);
  const { config, map, env } = project;
  const feature = map.features?.[featureKey];
  if (!feature) {
    throw new Error(
      `Không có feature "${featureKey}". Có: ${Object.keys(map.features || {}).join(', ')}`,
    );
  }

  const hasSmoke = Array.isArray(feature.smoke) && feature.smoke.length > 0;
  const effectiveLevel = level === 'smoke' && hasSmoke ? 'smoke' : 'full';
  const steps = effectiveLevel === 'smoke' ? feature.smoke : feature.taste;

  const authProfile = featureAuthProfile(feature);
  const ready = authProfile === 'public' || credentialsReady(config, env, authProfile);
  const account = config.app.accounts?.[authProfile];
  const credentials = ready && account
    ? { email: env[account.email_env], password: env[account.password_env] }
    : null;

  if (!ready && authProfile !== 'public' && authStepsFor(map, authProfile).length > 0) {
    log('[chef] CẢNH BÁO: chưa có credential trong .chef/.env.local — các bước login sẽ UNVERIFIED.');
    log('[chef] Điền CHEF_ADMIN_EMAIL và CHEF_ADMIN_PASSWORD rồi chạy lại.');
  }

  const runDir = path.join(
    projectRoot,
    config.evidence?.dir || '.chef/evidence',
    featureKey,
    stamp(),
  );
  await fsp.mkdir(runDir, { recursive: true });

  const { hash: codeHash } = await hashPaths(feature.code || [], projectRoot);
  const { hash: contractHash } = await hashPaths([project.configPath, project.mapPath], projectRoot);

  const result = {
    feature: featureKey,
    level: effectiveLevel,
    status: 'pass',
    started_at: new Date().toISOString(),
    finished_at: null,
    base_url: config.app.base_url,
    credentials_ready: ready,
    code_hash: codeHash,
    contract_hash: contractHash,
    steps: [],
    notes: [],
    consoleErrors: [],
    pageErrors: [],
    networkFailures: [],
    apiCalls: [],
    screenshots: [],
    secrets: [],
  };

  if (level === 'smoke' && !hasSmoke) {
    result.notes.push('Feature chưa có kịch bản smoke, tự động dùng full.');
  }

  const startedServices = [];
  let browser;
  let context;

  try {
    for (const service of config.app.start || []) {
      const port = servicePort(service);
      if (port && (await isPortOpen(port.host, port.port))) {
        result.notes.push(`service "${service.name}" đã chạy sẵn (${port.host}:${port.port})`);
        continue;
      }

      log(`[chef] start ${service.name}: ${service.command} (${service.cwd})`);
      let stdout = '';
      let stderr = '';
      const child = spawn(service.command, {
        cwd: path.resolve(projectRoot, service.cwd || '.'),
        shell: true,
        windowsHide: true,
        env,
      });
      child.stdout.on('data', (chunk) => {
        stdout = (stdout + chunk.toString()).slice(-8000);
      });
      child.stderr.on('data', (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-8000);
      });
      startedServices.push({ child, service });
      await waitServiceReady(service, child, () => `${stderr}\n${stdout}`.trim());
    }

    browser = await launchBrowser();
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'vi-VN',
    });
    const page = await context.newPage();

    page.on('console', (message) => {
      if (message.type() === 'error') {
        result.consoleErrors.push(sanitize(message.text(), result.secrets));
      }
    });
    page.on('pageerror', (error) => {
      result.pageErrors.push(sanitize(error.message, result.secrets));
    });
    page.on('requestfailed', (request) => {
      result.networkFailures.push({
        url: sanitizeUrl(request.url()),
        error: request.failure()?.errorText || 'requestfailed',
      });
    });
    page.on('response', (response) => {
      const url = response.url();
      if (!url.includes('/api/')) return;
      result.apiCalls.push({
        method: response.request().method(),
        status: response.status(),
        url: sanitizeUrl(url),
      });
      if (response.status() >= 400) {
        result.networkFailures.push({ url: sanitizeUrl(url), status: response.status() });
      }
    });

    const ctx = { page, env, config, map, result, runDir, credentials, authProfile };

    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      const label = `${index + 1}. ${step.action}${step.by ? ` [${step.by}]` : ''}${step.name ? ` (${step.name})` : ''}`;
      try {
        await executeStep(ctx, step);
        result.steps.push({ step: label, ok: true });
        log(`[chef] OK ${label}`);
      } catch (error) {
        if (error instanceof UnverifiedError) {
          result.status = 'unverified';
          result.notes.push(error.message);
          result.steps.push({ step: label, ok: false, skipped: true, error: error.message });
          await safeScreenshot(page, runDir, 'unverified', result);
          break;
        }
        if (step.optional) {
          result.steps.push({ step: label, ok: false, skipped: true, error: sanitize(error.message, result.secrets) });
          result.notes.push(`bước optional bị bỏ qua: ${label} — ${step.optional_reason || 'không có lý do'}`);
          log(`[chef] SKIP ${label}`);
          continue;
        }
        result.status = 'fail';
        const message = sanitize(error.message, result.secrets);
        result.steps.push({ step: label, ok: false, error: message });
        result.notes.push(`bước thất bại: ${label}`);
        await safeScreenshot(page, runDir, `failed-step-${index + 1}`, result);
        log(`[chef] FAIL ${label}: ${message}`);
        break;
      }
    }

    const consoleAllow = allowlistPatterns(config.app.allow_console_error_patterns);
    const unexpectedConsole = result.consoleErrors.filter(
      (message) => !allowlisted(consoleAllow, message),
    );
    if (unexpectedConsole.length && result.status !== 'unverified') {
      result.status = 'fail';
      result.notes.push('Có console error không nằm trong allowlist.');
    }

    if (result.pageErrors.length && result.status !== 'unverified') {
      result.status = 'fail';
      result.notes.push('Có pageerror không nằm trong allowlist.');
    }

    const networkAllow = allowlistPatterns(config.app.allow_network_failure_patterns);
    const unexpectedNetwork = result.networkFailures.filter((failure) => {
      const probe = `${failure.status || ''} ${failure.error || ''} ${failure.url}`;
      return !allowlisted(networkAllow, probe, failure.url);
    });
    if (unexpectedNetwork.length && result.status !== 'unverified') {
      result.status = 'fail';
      result.notes.push('Có network failure không nằm trong allowlist.');
    }
  } catch (error) {
    result.status = error instanceof EnvError ? 'unverified' : 'fail';
    result.notes.push(sanitize(error.message, result.secrets));
    if (error.details) {
      result.notes.push(sanitize(error.details, result.secrets).slice(0, 4000));
    }
  } finally {
    try {
      await context?.close();
    } catch {
      // ignore
    }
    try {
      await browser?.close();
    } catch {
      // ignore
    }
    for (const item of startedServices) killTree(item.child);
    for (const item of startedServices) {
      const port = servicePort(item.service);
      if (port) await waitForPortClosed(port.host, port.port, 5000);
    }

    result.finished_at = new Date().toISOString();
    const { secrets, ...persisted } = result;
    persisted.redacted_values = secrets.length;
    await fsp.writeFile(path.join(runDir, 'meta.json'), `${JSON.stringify(persisted, null, 2)}\n`);
    await fsp.writeFile(path.join(runDir, 'report.md'), renderReport(result, feature));
    log(`[chef] evidence: ${path.relative(projectRoot, runDir)} (${result.status})`);
  }

  return result;
}
