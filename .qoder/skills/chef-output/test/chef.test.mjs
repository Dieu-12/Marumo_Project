import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkEvidence } from '../lib/evidence.mjs';
import { hashPaths, runCommand } from '../lib/util.mjs';
import { checkMap } from '../lib/map-check.mjs';
import { initProject } from '../lib/init.mjs';

async function fixture({ featureAuth, credentials = {}, contractText = 'map-v1' } = {}) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chef-output-test-'));
  const chefDir = path.join(projectRoot, '.chef');
  const codePath = path.join(projectRoot, 'feature.js');
  const mapPath = path.join(chefDir, 'app-map.yaml');
  const configPath = path.join(chefDir, 'config.yaml');
  await fs.mkdir(path.join(chefDir, 'evidence', 'feature'), { recursive: true });
  await fs.writeFile(codePath, 'export const feature = true;\n');
  await fs.writeFile(mapPath, contractText);
  await fs.writeFile(configPath, 'project:\n  name: fixture\n');

  const config = {
    app: {
      accounts: {
        admin: { email_env: 'CHEF_ADMIN_EMAIL', password_env: 'CHEF_ADMIN_PASSWORD' },
      },
    },
    evidence: { dir: '.chef/evidence', enforce: true },
  };
  const map = {
    features: {
      feature: {
        title: 'Fixture feature',
        code: ['feature.js'],
        ...(featureAuth ? { auth: featureAuth } : {}),
      },
    },
  };
  const env = { ...credentials };
  const { hash: codeHash } = await hashPaths(['feature.js'], projectRoot);
  const { hash: contractHash } = await hashPaths([configPath, mapPath], projectRoot);
  const runDir = path.join(chefDir, 'evidence', 'feature', '20261114-120000-000');
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, 'meta.json'),
    `${JSON.stringify({
      feature: 'feature',
      status: 'pass',
      level: 'full',
      code_hash: codeHash,
      contract_hash: contractHash,
      finished_at: new Date().toISOString(),
    })}\n`,
  );

  return {
    projectRoot,
    config,
    map,
    env,
    contractPaths: [configPath, mapPath],
    codePath,
    mapPath,
  };
}

test('map contract changes invalidate otherwise matching code evidence', async () => {
  const fixtureData = await fixture();
  await fs.writeFile(fixtureData.mapPath, 'map-v2');

  const result = await checkEvidence(fixtureData);

  assert.equal(result.rows[0].state, 'stale');
  assert.match(result.errors[0], /contract|map|evidence/i);
});

test('public features can pass without admin credentials', async () => {
  const fixtureData = await fixture({ featureAuth: 'public' });

  const result = await checkEvidence(fixtureData);

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].state, 'pass');
});

test('protected features are unverified when credentials are missing', async () => {
  const fixtureData = await fixture();

  const result = await checkEvidence(fixtureData);

  assert.equal(result.rows[0].state, 'unverified');
  assert.match(result.errors[0], /credential|UNVERIFIED/i);
});

test('named auth profiles use their own credentials', async () => {
  const fixtureData = await fixture({ featureAuth: 'reviewer', credentials: {
    CHEF_REVIEWER_EMAIL: 'reviewer@example.test',
    CHEF_REVIEWER_PASSWORD: 'password',
  }});
  fixtureData.config.app.accounts.reviewer = {
    email_env: 'CHEF_REVIEWER_EMAIL',
    password_env: 'CHEF_REVIEWER_PASSWORD',
  };

  const result = await checkEvidence(fixtureData);

  assert.equal(result.rows[0].state, 'pass');
  assert.deepEqual(result.errors, []);
});

test('enforce false keeps missing protected credentials advisory', async () => {
  const fixtureData = await fixture();
  fixtureData.config.evidence.enforce = false;

  const result = await checkEvidence(fixtureData);

  assert.equal(result.rows[0].state, 'unverified');
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings[0], /UNVERIFIED/i);
});

test('named auth profile is required in project accounts', async () => {
  const fixtureData = await fixture({ featureAuth: 'reviewer' });
  const result = await checkMap(fixtureData.projectRoot, fixtureData.config, fixtureData.map);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /auth profile "reviewer"/i);
});

test('service/check command receives environment loaded by the kit', async () => {
  const result = await runCommand({
    command: 'node -e "process.stdout.write(process.env.CHEF_FIXTURE_ENV || \'\')"',
    cwd: process.cwd(),
    env: { ...process.env, CHEF_FIXTURE_ENV: 'loaded' },
  });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'loaded');
});

test('optional navigation assertions require an explicit reason', async () => {
  const fixtureData = await fixture();
  fixtureData.config.project = { source_roots: [] };
  fixtureData.map.version = 1;
  fixtureData.map.features.feature.taste = [
    { action: 'expectUrl', contains: '/optional', optional: true },
  ];
  const result = await checkMap(fixtureData.projectRoot, fixtureData.config, fixtureData.map);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /optional expectUrl.*optional_reason/i);
});

test('init does not create an npm package in a non-Node repo', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chef-init-test-'));
  const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  await initProject({ projectRoot, kitRoot, log: () => {} });

  assert.equal(await fs.stat(path.join(projectRoot, 'package.json')).then(() => true, () => false), false);
  assert.equal(await fs.stat(path.join(projectRoot, '.chef/config.yaml')).then(() => true, () => false), true);
});
