import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import {
  assertBrowserContainerMetadata,
  assertBakedExecutable,
  assertBrowserFontConfigEvidence,
  browserFontConfigSha256,
  assertBrowserFontRendering,
  browserFontSample,
} from './runtime.mjs';
import { browserContainerImage, browserContainerTag, browserPlaywrightVersion } from './policy.mjs';

const metadata = {
  platform: 'linux',
  arch: 'x64',
  node: 'v22.23.3',
  containerImage: browserContainerImage,
  imageOS: 'ubuntu24',
  imageVersion: '20260927.320.1',
  browsersPath: '/ms-playwright',
  dockerPresent: true,
  playwrightVersion: browserPlaywrightVersion,
  coreVersion: browserPlaywrightVersion,
  dockerInfo: { driverVersion: browserPlaywrightVersion, dockerImageName: browserContainerTag },
};
test('the baked container contract accepts the pinned runtime without rewriting host metadata', () => {
  const copy = structuredClone(metadata);
  assert.doesNotThrow(() => assertBrowserContainerMetadata(copy));
  assert.deepEqual(copy, metadata);
});
for (const patch of [
  { platform: 'darwin' },
  { arch: 'arm64' },
  { node: 'v24.0.0' },
  { containerImage: browserContainerTag },
  { containerImage: undefined },
  { imageOS: undefined },
  { imageVersion: undefined },
  { imageVersion: '' },
  { imageVersion: 'local' },
  { browsersPath: '/root/.cache/ms-playwright' },
  { dockerPresent: false },
  { playwrightVersion: '1.61.0' },
  { coreVersion: '1.61.0' },
  { dockerInfo: { driverVersion: '1.61.0', dockerImageName: browserContainerTag } },
  { dockerInfo: { driverVersion: browserPlaywrightVersion, dockerImageName: 'mcr.microsoft.com/playwright:v1.61.1-jammy' } },
]) {
  test(`baked runtime refuses incompatible or missing evidence ${JSON.stringify(patch)}`, () => {
    assert.throws(() => assertBrowserContainerMetadata({ ...metadata, ...patch }));
  });
}
test('baked executable checks real files and refuses a sibling registry, directories and missing files', () => {
  const work = mkdtempSync(join(tmpdir(), 'trajectory-browser-path-'));
  try {
    const registry = join(work, 'ms-playwright'),
      sibling = join(work, 'ms-playwright-other');
    mkdirSync(registry);
    mkdirSync(sibling);
    const launcher = join(registry, 'pw_run.sh'),
      outside = join(sibling, 'pw_run.sh');
    writeFileSync(launcher, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(outside, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    assert.doesNotThrow(() => assertBakedExecutable(registry, launcher));
    assert.throws(() => assertBakedExecutable(registry, outside));
    assert.throws(() => assertBakedExecutable(registry, registry));
    assert.throws(() => assertBakedExecutable(registry, join(registry, '..', 'ms-playwright-other', 'pw_run.sh')));
    assert.throws(() => assertBakedExecutable(registry, join(registry, 'missing')));
  } finally {
    assert.equal(dirname(realpathSync(work)), realpathSync(tmpdir()), 'Cleanup must stay in the owned temp directory');
    assert.match(basename(work), /^trajectory-browser-path-/);
    rmSync(work, { recursive: true, force: true });
  }
});

const fontEvidence = {
  configFile: '/workspace/scripts/ci/browser-fontconfig.conf',
  expectedConfigFile: '/workspace/scripts/ci/browser-fontconfig.conf',
  configSha256: browserFontConfigSha256,
  matches: Object.fromEntries(
    ['system-ui', 'ui-sans-serif', 'sans-serif'].map((family) => [
      family,
      {
        regular: 'Liberation Sans\nRegular\n/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        bold: 'Liberation Sans\nBold\n/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
      },
    ]),
  ),
};
test('CI font evidence requires real regular and bold faces for all three generic families', () => {
  assert.doesNotThrow(() => assertBrowserFontConfigEvidence(fontEvidence));
});
for (const field of ['configFile', 'configSha256', 'regular', 'bold']) {
  test(`CI font evidence rejects changed ${field}`, () => {
    const changed = structuredClone(fontEvidence);
    if (field === 'regular' || field === 'bold') {
      changed.matches['system-ui'][field] = 'WenQuanYi Zen Hei\nRegular\n/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc';
    } else {
      changed[field] = 'foreign';
    }
    assert.throws(() => assertBrowserFontConfigEvidence(changed));
  });
}
test('a regular file posing as bold and a missing generic family both refuse', () => {
  const sameFace = structuredClone(fontEvidence);
  sameFace.matches['ui-sans-serif'].bold = sameFace.matches['ui-sans-serif'].regular;
  assert.throws(() => assertBrowserFontConfigEvidence(sameFace));
  const missing = structuredClone(fontEvidence);
  delete missing.matches['sans-serif'];
  assert.throws(() => assertBrowserFontConfigEvidence(missing));
});

test('actual rendered regular/bold metrics must remain distinct despite declared CSS weights', () => {
  assert.doesNotThrow(() =>
    assertBrowserFontRendering({ regular: { weight: '400', width: 627.953125 }, bold: { weight: '700', width: 669.609375 } }),
  );
  assert.throws(() =>
    assertBrowserFontRendering({ regular: { weight: '400', width: 651.09375 }, bold: { weight: '700', width: 651.09375 } }),
  );
  assert.throws(() => assertBrowserFontRendering({ regular: { weight: '400', width: NaN }, bold: { weight: '700', width: 669.609375 } }));
});

test('the browser rendering fixture has decoded Cyrillic text and ASCII-safe source bytes', () => {
  assert.equal(
    browserFontSample,
    '\u0421\u0435\u0433\u043e\u0434\u043d\u044f \u041f\u0440\u043e\u0432\u0435\u0440\u044f\u044e \u0434\u043e\u0441\u0442\u0443\u043f \u0438 \u0422\u0440\u0430\u0435\u043a\u0442\u043e\u0440\u0438\u044f',
  );
  assert.match(browserFontSample, /[\u0400-\u04ff]/);
  assert.ok(!browserFontSample.includes('\ufffd'));
  const source = readFileSync(new URL('./runtime.mjs', import.meta.url), 'utf8');
  assert.ok(!source.includes('\ufffd'));
  assert.ok([...source].every((character) => character.codePointAt(0) < 128));
});
