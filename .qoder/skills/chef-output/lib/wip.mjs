import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export function wipPath(projectRoot, config) {
  return path.resolve(projectRoot, config.wip?.file || '.chef/wip.json');
}

export async function readWip(projectRoot, config) {
  const file = wipPath(projectRoot, config);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(await fsp.readFile(file, 'utf8'));
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
    return {
      ...data,
      file,
      expired: expiresAt ? expiresAt.getTime() < Date.now() : false,
    };
  } catch (error) {
    return { file, invalid: true, error: error.message, expired: false };
  }
}

export async function startWip({ projectRoot, config, note = '', minutes }) {
  const file = wipPath(projectRoot, config);
  const duration = Number(minutes || config.wip?.default_minutes || 480);
  const now = new Date();
  const data = {
    note,
    started_at: now.toISOString(),
    expires_at: new Date(now.getTime() + duration * 60000).toISOString(),
    expires_minutes: duration,
  };
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
  return { file, data };
}

export async function endWip({ projectRoot, config }) {
  const file = wipPath(projectRoot, config);
  if (fs.existsSync(file)) await fsp.rm(file);
  return file;
}
