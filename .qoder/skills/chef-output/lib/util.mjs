import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.cache',
  '.vite',
]);

export function toPosix(value) {
  return value.split(path.sep).join('/');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function walkFiles(root, { extensions = null } = {}) {
  const found = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (extensions && !extensions.includes(path.extname(entry.name))) continue;
      found.push(full);
    }
  }

  await walk(root);
  return found.sort();
}

export async function hashPaths(entries, baseDir) {
  const files = new Set();

  for (const entry of entries || []) {
    const abs = path.resolve(baseDir, entry);
    let stat;
    try {
      stat = await fsp.stat(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      for (const file of await walkFiles(abs)) files.add(file);
    } else if (stat.isFile()) {
      files.add(abs);
    }
  }

  const hash = crypto.createHash('sha256');
  for (const file of [...files].sort()) {
    hash.update(toPosix(path.relative(baseDir, file)));
    hash.update('\0');
    hash.update(await fsp.readFile(file));
    hash.update('\0');
  }

  return { hash: hash.digest('hex'), files: files.size };
}

export function stamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('') + '-' + String(date.getMilliseconds()).padStart(3, '0');
}

export function sanitize(text, secrets = []) {
  let out = String(text ?? '');
  for (const secret of secrets) {
    if (secret && String(secret).length >= 4) {
      out = out.split(String(secret)).join('***');
    }
  }
  return out.replace(
    /("?(?:password|matKhau|token|secret)"?\s*[:=]\s*")[^"]*(")/gi,
    '$1***$2',
  );
}

export function parseDotEnv(text) {
  const env = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalIndex = line.indexOf('=');
    if (equalIndex <= 0) continue;
    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export async function readDotEnv(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  return parseDotEnv(await fsp.readFile(filePath, 'utf8'));
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isPortOpen(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

export async function waitForPort(host, port, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(host, port)) return true;
    await delay(500);
  }
  return false;
}

export async function waitForPortClosed(host, port, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!(await isPortOpen(host, port))) return true;
    await delay(200);
  }
  return false;
}

export async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok || response.status < 500) return true;
    } catch {
      // server chưa lên, thử lại
    }
    await delay(500);
  }
  return false;
}

export function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    child.kill('SIGTERM');
  }
}

export async function runCommand({ command, cwd, timeoutMs = 120000, env = process.env }) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      env,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}
