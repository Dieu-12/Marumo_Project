import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { hashPaths, toPosix } from './util.mjs';

const LEVEL_RANK = { smoke: 1, full: 2 };

export function credentialsReady(config, env, profile = 'admin') {
  const account = config.app?.accounts?.[profile];
  if (!account?.email_env || !account?.password_env) return false;
  return Boolean(env[account.email_env] && env[account.password_env]);
}

export function featureAuthProfile(feature) {
  if (feature?.auth === 'public' || feature?.auth === 'none') return 'public';
  if (typeof feature?.auth === 'string') return feature.auth;
  if (feature?.auth?.profile) return feature.auth.profile;
  return 'admin';
}

function featureCredentialsReady(feature, config, env) {
  const profile = featureAuthProfile(feature);
  return profile === 'public' || credentialsReady(config, env, profile);
}

export async function latestEvidence(projectRoot, config, featureKey) {
  const dir = path.resolve(
    projectRoot,
    config.evidence?.dir || '.chef/evidence',
    featureKey,
  );
  if (!fs.existsSync(dir)) return null;
  const runs = (await fsp.readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const run of runs) {
    const metaPath = path.join(dir, run, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    try {
      return {
        runDir: path.join(dir, run),
        run: toPosix(path.relative(projectRoot, path.join(dir, run))),
        ...JSON.parse(await fsp.readFile(metaPath, 'utf8')),
      };
    } catch {
      continue;
    }
  }
  return null;
}

function featureSupportsSmoke(feature) {
  return Array.isArray(feature.smoke) && feature.smoke.length > 0;
}

function requiredLevelFor(requiredLevel, feature) {
  if (requiredLevel === 'smoke' && featureSupportsSmoke(feature)) return 'smoke';
  return 'full';
}

function evidenceLevelFor(latest, feature) {
  const level = latest?.level === 'smoke' ? 'smoke' : 'full';
  if (level === 'smoke' && !featureSupportsSmoke(feature)) return 'full';
  return level;
}

function tasteHint(key, feature, requiredLevel) {
  return `npm run chef:taste -- ${key} --level=${requiredLevelFor(requiredLevel, feature)}`;
}

export async function checkEvidence({
  projectRoot,
  config,
  map,
  env,
  contractPaths = [],
  requiredLevel = 'full',
}) {
  const rows = [];
  const errors = [];
  const warnings = [];
  const enforce = config.evidence?.enforce !== false;
  const contractHash = contractPaths.length
    ? (await hashPaths(contractPaths, projectRoot)).hash
    : null;

  for (const [key, feature] of Object.entries(map.features || {})) {
    if (!Array.isArray(feature.code) || feature.code.length === 0) continue;

    const required = requiredLevelFor(requiredLevel, feature);
    const hint = tasteHint(key, feature, requiredLevel);
    const { hash } = await hashPaths(feature.code, projectRoot);
    const ready = featureCredentialsReady(feature, config, env);
    const latest = await latestEvidence(projectRoot, config, key);
    const row = {
      feature: key,
      state: 'unknown',
      level: latest ? evidenceLevelFor(latest, feature) : null,
      run: latest?.run || null,
    };

    if (!latest) {
      row.state = 'missing';
      const message = `${key}: chưa có evidence. Chạy: ${hint}`;
      if (enforce) errors.push(ready ? message : `UNVERIFIED (thiếu credential .chef/.env.local): ${message}`);
      else warnings.push(message);
      rows.push(row);
      continue;
    }

    if (latest.code_hash !== hash || (contractHash && latest.contract_hash !== contractHash)) {
      row.state = 'stale';
      const changed = latest.code_hash !== hash ? 'code' : 'contract (config/map)';
      const message = `${key}: ${changed} đã đổi sau evidence ${latest.finished_at}. Chạy lại: ${hint}`;
      if (enforce) errors.push(ready ? message : `UNVERIFIED (thiếu credential): ${message}`);
      else warnings.push(message);
      rows.push(row);
      continue;
    }

    if (latest.status === 'pass') {
      if (!ready) {
        row.state = 'unverified';
        const message = `${key}: UNVERIFIED (thiếu credential hoặc auth profile chưa sẵn sàng). Chạy lại khi môi trường sẵn sàng: ${hint}`;
        if (enforce) errors.push(message);
        else warnings.push(message);
        rows.push(row);
        continue;
      }
      const level = evidenceLevelFor(latest, feature);
      if (LEVEL_RANK[level] < LEVEL_RANK[required]) {
        row.state = 'insufficient';
        const message =
          `${key}: evidence hiện có level "${level}" nhưng cần "${required}" trước khi hoàn tất. ` +
          `Chạy: ${hint}`;
        if (enforce) errors.push(ready ? message : `UNVERIFIED (thiếu credential): ${message}`);
        else warnings.push(message);
      } else {
        row.state = 'pass';
      }
      row.level = level;
      rows.push(row);
      continue;
    }

    if (latest.status === 'unverified') {
      row.state = 'unverified';
      const reason = (latest.notes || []).join('; ') || 'không rõ lý do';
      const message = `${key}: evidence UNVERIFIED (${reason}). Chạy lại khi môi trường sẵn sàng: ${hint}`;
      if (enforce) errors.push(message);
      else warnings.push(message);
      rows.push(row);
      continue;
    }

    row.state = 'fail';
    const reason = (latest.notes || []).join('; ') || 'xem report.md';
    errors.push(`${key}: evidence FAIL (${reason}). Chạy lại: ${hint}`);
    rows.push(row);
  }

  return { rows, errors, warnings };
}
