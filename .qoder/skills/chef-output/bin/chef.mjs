#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../lib/config.mjs';
import { checkMap } from '../lib/map-check.mjs';
import { scanRules, writeBaseline } from '../lib/rules.mjs';
import { checkEvidence } from '../lib/evidence.mjs';
import { runTaste } from '../lib/taste.mjs';
import { initProject } from '../lib/init.mjs';
import { readWip, startWip, endWip } from '../lib/wip.mjs';
import { runCommand } from '../lib/util.mjs';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = process.cwd();

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      flags[key] = value === undefined ? true : value;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function printHelp() {
  console.log(`chef-output — quy chuẩn đầu ra

Dùng:
  chef.mjs init                      bootstrap .chef, Stop hook, npm scripts
  chef.mjs map-check                 kiểm tra app-map
  chef.mjs guard [--full]            map + rule + evidence (+ lint/build/test)
  chef.mjs guard --mode=stop         chế độ Stop hook (nhanh, exit 2 khi chặn)
  chef.mjs taste <feature> [--level=smoke|full]
  chef.mjs taste --all [--level=smoke|full]
  chef.mjs wip start [--note=...] [--minutes=480]
  chef.mjs wip end | wip status
  chef.mjs baseline                  ghi baseline vi phạm cũ đã chấp thuận

Exit code: 0 OK, 1 lỗi, 2 bị chặn (hook), 4 taste UNVERIFIED.`);
}

async function commandGuard(flags, log) {
  const stopMode = flags.mode === 'stop';
  const fullMode = flags.full === true || flags.mode === 'full';
  const project = await loadProject(projectRoot);
  const { config, map, env } = project;

  const mapResult = await checkMap(projectRoot, config, map);
  const ruleResult = await scanRules(projectRoot, config);

  const requiredLevel = fullMode
    ? config.evidence?.require_level_full || 'full'
    : config.evidence?.require_level_stop || 'smoke';
  const wip = await readWip(projectRoot, config);
  const wipActive = !fullMode && wip && !wip.expired && !wip.invalid;

  const evidenceResult = await checkEvidence({
    projectRoot,
    config,
    map,
    env,
    contractPaths: [project.configPath, project.mapPath],
    requiredLevel,
  });

  const errors = [];
  const warnings = [];

  if (!mapResult.ok) {
    errors.push(...mapResult.errors.map((item) => `[map] ${item}`));
  }
  warnings.push(...mapResult.warnings.map((item) => `[map] ${item}`));

  errors.push(
    ...ruleResult.violations.map(
      (item) => `[rule:${item.ruleId}] ${item.file}:${item.line} — ${item.message}`,
    ),
  );

  warnings.push(...evidenceResult.warnings);
  if (wipActive) {
    log(
      `[chef] WIP đang mở: ${wip.note || 'không ghi chú'} (hết hạn ${wip.expires_at}) — evidence tạm advisory`,
    );
    warnings.push(...evidenceResult.errors.map((item) => `[WIP] ${item}`));
  } else {
    errors.push(...evidenceResult.errors);
  }
  if (wip?.expired) {
    warnings.push(`[chef] WIP đã hết hạn (${wip.expires_at}) — bỏ qua. Chạy wip end hoặc wip start lại.`);
  }
  if (wip?.invalid) {
    warnings.push(`[chef] WIP không đọc được (${wip.error}) — bỏ qua.`);
  }
  if (fullMode && wip && !wip.expired && !wip.invalid) {
    warnings.push('[chef] WIP đang mở nhưng guard --full vẫn enforce evidence.');
  }

  const checks = [];
  if (fullMode) {
    for (const check of config.checks?.commands || []) {
      const startedAt = Date.now();
      const outcome = await runCommand({
        command: check.command,
        cwd: path.resolve(projectRoot, check.cwd || '.'),
        timeoutMs: check.timeout_ms || 120000,
        env,
      });
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const ok = outcome.code === 0 && !outcome.timedOut;
      checks.push({ name: check.name, ok, elapsed, outcome });
      if (!ok) {
        const message = `[check:${check.name}] thất bại (exit ${outcome.code}${outcome.timedOut ? ', timeout' : ''})`;
        if (check.allow_failure) warnings.push(`${message} — advisory, không chặn`);
        else errors.push(message);
      }
      log(`[chef] check ${check.name}: ${ok ? 'OK' : 'FAIL'} (${elapsed}s)`);
      if (!ok) {
        const tail = `${outcome.stderr || outcome.stdout || ''}`.trim().slice(-3000);
        if (tail) log(tail);
      }
    }
  }

  log(
    `[chef] map: ${mapResult.ok ? 'OK' : 'FAIL'} (${mapResult.stats.features} features, ${mapResult.stats.selectors} selectors)`,
  );
  log(
    `[chef] rules: ${ruleResult.violations.length === 0 ? 'OK' : 'FAIL'} (${ruleResult.violations.length} vi phạm, ${ruleResult.baselined} baseline)`,
  );
  log(
    `[chef] evidence: ${evidenceResult.errors.length === 0 ? 'OK' : 'FAIL'} (level: ${requiredLevel})`,
  );
  if (evidenceResult.rows.some((row) => row.state === 'unverified')) {
    log('[chef] Có feature chưa sẵn sàng về auth/môi trường — evidence UNVERIFIED sẽ chặn khi kết thúc.');
  }
  for (const row of evidenceResult.rows) {
    log(
      `  - ${row.feature}: ${row.state}${row.level ? ` (${row.level})` : ''}${row.run ? ` — ${row.run}` : ''}`,
    );
  }
  for (const warning of warnings) log(`[chef] WARN ${warning}`);

  if (errors.length > 0) {
    if (stopMode) {
      console.log('');
      console.log('[chef-output] CHẶN KẾT THÚC — chưa đạt quy chuẩn đầu ra:');
      for (const error of errors) console.log(`  - ${error}`);
      console.log('');
      console.log('Chạy lệnh được gợi ý ở trên, rồi thử lại. Không sửa guard/baseline để né chặn.');
    } else {
      console.log('');
      console.log('[chef-output] FAIL:');
      for (const error of errors) console.log(`  - ${error}`);
    }
    return stopMode ? 2 : 1;
  }

  log('[chef] OK — đạt quy chuẩn đầu ra');
  return 0;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0] || 'help';
  const log = console.log;

  try {
    switch (command) {
      case 'help':
      case '--help':
      case '-h': {
        printHelp();
        return 0;
      }
      case 'init': {
        await initProject({ projectRoot, kitRoot, log });
        return 0;
      }
      case 'map-check': {
        const { config, map } = await loadProject(projectRoot);
        const result = await checkMap(projectRoot, config, map);
        log(
          `[chef] map: ${result.ok ? 'OK' : 'FAIL'} (${result.stats.features} features, ${result.stats.selectors} selectors)`,
        );
        for (const warning of result.warnings) log(`[chef] WARN ${warning}`);
        for (const error of result.errors) log(`[chef] ERROR ${error}`);
        return result.ok ? 0 : 1;
      }
      case 'guard': {
        return await commandGuard(flags, log);
      }
      case 'taste': {
        const level = flags.level === undefined ? 'full' : flags.level;
        if (!['smoke', 'full'].includes(level)) {
          log('Giá trị --level không hợp lệ. Dùng --level=smoke hoặc --level=full.');
          return 1;
        }
        if (flags.all === true) {
          const project = await loadProject(projectRoot);
          const keys = Object.keys(project.map.features || {});
          if (keys.length === 0) {
            log('app-map không có feature nào.');
            return 1;
          }
          let exitCode = 0;
          for (const key of keys) {
            const result = await runTaste({ projectRoot, featureKey: key, level, log });
            log(`[chef] ${key}: ${result.status.toUpperCase()} (${result.level})`);
            if (result.status === 'fail') exitCode = 1;
            else if (result.status === 'unverified' && exitCode === 0) exitCode = 4;
          }
          return exitCode;
        }
        const featureKey = positional[1];
        if (!featureKey) {
          log('Thiếu tên feature. Ví dụ: chef.mjs taste reports-revenue hoặc chef.mjs taste --all');
          return 1;
        }
        const result = await runTaste({ projectRoot, featureKey, level, log });
        if (result.status === 'pass') return 0;
        if (result.status === 'unverified') {
          log('[chef] UNVERIFIED — không được báo hoàn thành khi chưa có môi trường/credential.');
          return 4;
        }
        return 1;
      }
      case 'wip': {
        const action = positional[1] || 'status';
        const { config } = await loadProject(projectRoot, { needMap: false });
        if (action === 'start') {
          const note = typeof flags.note === 'string' ? flags.note : '';
          const { file, data } = await startWip({
            projectRoot,
            config,
            note,
            minutes: flags.minutes,
          });
          log(
            `[chef] WIP mở: ${path.relative(projectRoot, file)} (${data.note || 'không ghi chú'}), hết hạn ${data.expires_at}`,
          );
          return 0;
        }
        if (action === 'end') {
          const file = await endWip({ projectRoot, config });
          log(`[chef] WIP đã đóng: ${path.relative(projectRoot, file)}`);
          return 0;
        }
        if (action === 'status') {
          const wip = await readWip(projectRoot, config);
          if (!wip) {
            log('[chef] Không có WIP.');
            return 0;
          }
          if (wip.invalid) {
            log(`[chef] WIP lỗi: ${wip.error}`);
            return 1;
          }
          log(
            `[chef] WIP: ${wip.note || 'không ghi chú'} | bắt đầu ${wip.started_at} | hết hạn ${wip.expires_at}${wip.expired ? ' (ĐÃ HẾT HẠN)' : ''}`,
          );
          return 0;
        }
        log(`Hành động wip không hỗ trợ: ${action}`);
        return 1;
      }
      case 'baseline': {
        const { config } = await loadProject(projectRoot, { needMap: false });
        const result = await writeBaseline(projectRoot, config);
        log(`[chef] baseline: ${result.count} fingerprint -> ${path.relative(projectRoot, result.file)}`);
        return 0;
      }
      default: {
        log(`Lệnh không hỗ trợ: ${command}`);
        printHelp();
        return 1;
      }
    }
  } catch (error) {
    console.error(`[chef] ERROR: ${error.message}`);
    return 1;
  }
}

main().then((code) => {
  process.exitCode = code;
});
