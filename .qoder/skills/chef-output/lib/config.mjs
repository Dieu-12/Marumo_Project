import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { readDotEnv, toPosix } from './util.mjs';

export async function loadProject(projectRoot, { needMap = true } = {}) {
  const configPath = path.join(projectRoot, '.chef', 'config.yaml');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Chưa có ${toPosix(path.relative(projectRoot, configPath))}. ` +
        'Chạy: node .qoder/skills/chef-output/bin/chef.mjs init',
    );
  }

  const config = YAML.parse(await fsp.readFile(configPath, 'utf8')) || {};
  if (!config.project?.name) {
    throw new Error('config.yaml thiếu project.name');
  }
  if (!config.app?.base_url) {
    throw new Error('config.yaml thiếu app.base_url');
  }

  const mapPath = path.resolve(projectRoot, config.map || '.chef/app-map.yaml');
  let map = null;
  if (needMap) {
    if (!fs.existsSync(mapPath)) {
      throw new Error(
        `Chưa có ${toPosix(path.relative(projectRoot, mapPath))}. ` +
          'Chạy: node .qoder/skills/chef-output/bin/chef.mjs init',
      );
    }
    map = YAML.parse(await fsp.readFile(mapPath, 'utf8')) || {};
  }

  const envFile = config.app.env_file
    ? path.resolve(projectRoot, config.app.env_file)
    : null;
  const fileEnv = await readDotEnv(envFile);
  const env = { ...process.env };
  for (const [key, value] of Object.entries(fileEnv)) {
    if (!env[key]) env[key] = value;
  }

  return { projectRoot, config, configPath, map, mapPath, env, envFile, fileEnv };
}
