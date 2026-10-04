import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';

export function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

export function runtimeIdentity() {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  return {
    schema: 1,
    tree: git('rev-parse', 'HEAD^{tree}'),
    image: process.env.ImageOS || process.platform,
    imageVersion: process.env.ImageVersion || 'local',
    node: process.version,
    playwright: lock.packages['node_modules/@playwright/test'].version,
    workers: 1,
    shards: 2,
  };
}

export function writeJson(path, value) {
  mkdirSync('qa/ci', { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function summary(message) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
  }
}
