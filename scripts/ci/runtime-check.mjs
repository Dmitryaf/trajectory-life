import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { assertBrowserContainerMetadata, assertBakedExecutable } from './runtime.mjs';
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
