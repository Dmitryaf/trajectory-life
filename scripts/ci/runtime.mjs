import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, appendFileSync, realpathSync, statSync, accessSync, constants, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join, sep } from 'node:path';
import { createRequire } from 'node:module';
import { browserContainerImage, browserContainerTag, browserPlaywrightVersion } from './policy.mjs';

const require = createRequire(import.meta.url);

export function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

export function runtimeIdentity() {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  assert.equal(lock.packages['node_modules/@playwright/test'].version, browserPlaywrightVersion, 'Playwright must match the baked image');
  if (process.env.GITHUB_ACTIONS === 'true') {
    assert.equal(process.env.ImageOS, 'ubuntu24', 'Actual runner image metadata is required');
    assert.ok(process.env.ImageVersion?.trim() && process.env.ImageVersion !== 'local', 'Actual runner image version is required');
  }
  if (process.env.BROWSER_JOB) {
    assertBrowserContainerMetadata(readBrowserContainerMetadata(lock));
  }
  return {
    schema: 2,
    tree: git('rev-parse', 'HEAD^{tree}'),
    image: process.env.ImageOS || process.platform,
    imageVersion: process.env.ImageVersion || 'local',
    // Expected image is pinned by the workflow; browser jobs also verify the baked runtime.
    browserContainer: browserContainerImage,
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

export function assertBrowserContainerMetadata(metadata) {
  assert.equal(metadata.platform, 'linux', 'Browser container must run Linux');
  assert.equal(metadata.arch, 'x64', 'Browser container must run amd64');
  assert.match(metadata.node, /^v22\./, 'Browser container must use project Node 22');
  assert.equal(metadata.containerImage, browserContainerImage, 'Workflow browser image differs');
  assert.equal(metadata.imageOS, 'ubuntu24', 'Actual runner image metadata is required');
  assert.ok(
    typeof metadata.imageVersion === 'string' && metadata.imageVersion.trim() && metadata.imageVersion !== 'local',
    'Actual runner image version is required',
  );
  assert.equal(metadata.browsersPath, '/ms-playwright', 'Use baked browser executables');
  assert.equal(metadata.dockerPresent, true, 'Browser reports require the job container');
  assert.equal(metadata.playwrightVersion, browserPlaywrightVersion, 'Locked Playwright differs');
  assert.equal(metadata.coreVersion, browserPlaywrightVersion, 'Locked Playwright core differs');
  assert.equal(metadata.dockerInfo.driverVersion, browserPlaywrightVersion, 'Baked Playwright differs');
  assert.equal(metadata.dockerInfo.dockerImageName, browserContainerTag, 'Baked image tag differs');
}

function readBrowserContainerMetadata(lock) {
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    containerImage: process.env.BROWSER_CONTAINER_IMAGE,
    imageOS: process.env.ImageOS,
    imageVersion: process.env.ImageVersion,
    browsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH,
    dockerPresent: existsSync('/.dockerenv'),
    playwrightVersion: lock.packages['node_modules/@playwright/test'].version,
    coreVersion: lock.packages['node_modules/playwright-core'].version,
    dockerInfo: JSON.parse(readFileSync('/ms-playwright/.docker-info', 'utf8')),
  };
}

export function assertBakedExecutable(browsersPath, path) {
  const root = realpathSync(browsersPath);
  const executable = realpathSync(path);
  assert.ok(executable.startsWith(root + sep), 'Browser executable escaped the baked registry');
  assert.ok(statSync(executable).isFile(), 'Browser executable is not a file');
  accessSync(executable, constants.X_OK);
}

export async function verifyBrowserContainer() {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const metadata = readBrowserContainerMetadata(lock);
  assertBrowserContainerMetadata(metadata);
  for (const name of ['playwright', 'playwright-core']) {
    assert.equal(
      JSON.parse(readFileSync(require.resolve(name + '/package.json'), 'utf8')).version,
      browserPlaywrightVersion,
      'Installed Playwright differs',
    );
  }
  assert.ok(['chromium', 'webkit'].includes(process.env.ENGINE), 'Unknown browser engine');
  const sdk = await import('playwright');
  const engine = sdk[process.env.ENGINE];
  assertBakedExecutable('/ms-playwright', engine.executablePath());
  const expectedVersion = JSON.parse(
    readFileSync(join(dirname(require.resolve('playwright-core/package.json')), 'browsers.json'), 'utf8'),
  ).browsers.find((browser) => browser.name === process.env.ENGINE)?.browserVersion;
  assert.ok(expectedVersion, 'Missing baked browser version');
  const browser = await engine.launch({ timeout: 30_000 });
  try {
    assert.equal(browser.version(), expectedVersion, 'Launched browser version differs');
  } finally {
    await browser.close();
  }
  console.log('Verified pinned browser container, Node 22, baked executable and browser version.');
}
