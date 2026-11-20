import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { sha256, toPosix, walkFiles } from './util.mjs';

function baselinePath(projectRoot, config) {
  return path.resolve(projectRoot, config.rules_baseline || '.chef/baseline.json');
}

function loadBaseline(projectRoot, config) {
  const file = baselinePath(projectRoot, config);
  if (!fs.existsSync(file)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new Set(Array.isArray(data) ? data : []);
  } catch {
    return new Set();
  }
}

async function scan(projectRoot, config) {
  const matches = [];
  for (const rule of config.rules || []) {
    const flags = (rule.flags || '').replace(/g/g, '');
    let regex;
    try {
      regex = new RegExp(rule.pattern, flags);
    } catch (error) {
      matches.push({
        ruleId: rule.id || 'invalid-rule',
        file: '(config)',
        line: 0,
        message: `Regex không hợp lệ: ${error.message}`,
        fingerprint: null,
      });
      continue;
    }

    for (const root of rule.roots || []) {
      const abs = path.resolve(projectRoot, root);
      if (!fs.existsSync(abs)) continue;
      const files = await walkFiles(abs, {
        extensions: rule.extensions || ['.js', '.jsx', '.ts', '.tsx'],
      });
      for (const file of files) {
        const rel = toPosix(path.relative(projectRoot, file));
        let content;
        try {
          content = await fsp.readFile(file, 'utf8');
        } catch {
          continue;
        }
        const lines = content.split(/\r?\n/);
        lines.forEach((line, index) => {
          if (!regex.test(line)) return;
          matches.push({
            ruleId: rule.id,
            file: rel,
            line: index + 1,
            message: rule.message || rule.id,
            fingerprint: `${rule.id}|${rel}|${sha256(line.trim()).slice(0, 16)}`,
          });
        });
      }
    }
  }
  return matches;
}

export async function scanRules(projectRoot, config) {
  const baseline = loadBaseline(projectRoot, config);
  const matches = await scan(projectRoot, config);
  const violations = matches.filter((match) => !match.fingerprint || !baseline.has(match.fingerprint));
  return {
    violations,
    baselined: matches.length - violations.length,
    total: matches.length,
  };
}

export async function writeBaseline(projectRoot, config) {
  const matches = await scan(projectRoot, config);
  const fingerprints = [...new Set(matches.map((match) => match.fingerprint).filter(Boolean))].sort();
  const file = baselinePath(projectRoot, config);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(fingerprints, null, 2)}\n`);
  return { count: fingerprints.length, file };
}
