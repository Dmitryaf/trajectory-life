import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, appendFileSync, realpathSync, statSync, accessSync, constants, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join, sep, resolve } from 'node:path';
import { createHash } from 'node:crypto';
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
    verifyBrowserFontConfig();
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
  verifyBrowserFontConfig();
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
    await verifyBrowserFontRendering(browser);
  } finally {
    await browser.close();
  }
  console.log('Verified pinned browser container, Node 22, baked executable and browser version.');
}

export const browserFontSample =
  '\u0421\u0435\u0433\u043e\u0434\u043d\u044f \u041f\u0440\u043e\u0432\u0435\u0440\u044f\u044e \u0434\u043e\u0441\u0442\u0443\u043f \u0438 \u0422\u0440\u0430\u0435\u043a\u0442\u043e\u0440\u0438\u044f';

export const browserFontConfigSha256 = '0c7848870ba6ead56bcb7f2f74552f8ccb706451e6c7ea8fb9439aa8efa285c9';
const fontDirectory = '/usr/share/fonts/truetype/liberation/';

export function assertBrowserFontConfigEvidence(evidence) {
  assert.equal(evidence.configFile, evidence.expectedConfigFile, 'Browser fontconfig path differs');
  assert.equal(evidence.configSha256, browserFontConfigSha256, 'Browser fontconfig bytes differ');
  for (const family of ['system-ui', 'ui-sans-serif', 'sans-serif']) {
    assert.equal(
      evidence.matches[family].regular,
      `Liberation Sans\nRegular\n${fontDirectory}LiberationSans-Regular.ttf`,
      `Browser regular font differs: ${family}`,
    );
    assert.equal(
      evidence.matches[family].bold,
      `Liberation Sans\nBold\n${fontDirectory}LiberationSans-Bold.ttf`,
      `Browser bold font differs: ${family}`,
    );
  }
}

export function verifyBrowserFontConfig() {
  const expectedConfigFile = resolve('scripts/ci/browser-fontconfig.conf');
  assert.equal(process.env.FONTCONFIG_FILE, expectedConfigFile, 'Use the checked-in browser fontconfig');
  const configSha256 = createHash('sha256').update(readFileSync(expectedConfigFile)).digest('hex');
  const matches = Object.fromEntries(
    ['system-ui', 'ui-sans-serif', 'sans-serif'].map((family) => [
      family,
      Object.fromEntries(
        ['Regular', 'Bold'].map((style) => [
          style.toLowerCase(),
          execFileSync(
            'fc-match',
            [
              '--format',
              '%{family}\n%{style}\n%{file}',
              `${family.replaceAll('-', '\\-')}:style=${style}:weight=${style === 'Bold' ? 200 : 80}`,
            ],
            {
              encoding: 'utf8',
              timeout: 5000,
            },
          ).trim(),
        ]),
      ),
    ]),
  );
  assertBrowserFontConfigEvidence({ configFile: process.env.FONTCONFIG_FILE, expectedConfigFile, configSha256, matches });
  for (const name of ['LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf']) {
    assert.ok(statSync(fontDirectory + name).isFile(), 'Baked browser font file is missing');
  }
}

export function assertBrowserFontRendering(rendering) {
  assert.equal(rendering.regular.weight, '400', 'Browser regular weight differs');
  assert.equal(rendering.bold.weight, '700', 'Browser bold weight differs');
  assert.ok(Number.isFinite(rendering.regular.width) && Number.isFinite(rendering.bold.width), 'Invalid font metrics');
  assert.ok(Math.abs(rendering.regular.width - rendering.bold.width) > 1, 'Browser renders the same regular and bold face');
}

export async function verifyBrowserFontRendering(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  try {
    await page.setContent(
      `<meta charset="utf-8"><style>span{display:inline-block;font:36px system-ui;font-synthesis:none}#bold{font-weight:700}</style><span id="regular">${browserFontSample}</span><span id="bold">${browserFontSample}</span>`,
    );
    await page.waitForFunction(() => globalThis.document.fonts.status === 'loaded', undefined, { timeout: 5000 });
    const rendering = await page.evaluate(() =>
      Object.fromEntries(
        ['regular', 'bold'].map((id) => {
          const element = globalThis.document.getElementById(id);
          return [id, { weight: globalThis.getComputedStyle(element).fontWeight, width: element.getBoundingClientRect().width }];
        }),
      ),
    );
    assertBrowserFontRendering(rendering);
  } finally {
    await page.close();
  }
}
