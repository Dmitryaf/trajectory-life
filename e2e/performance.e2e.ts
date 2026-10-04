import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { demoFilePath } from './demo-data';

const rounds = 3;
const budgets = {
  landingOpenMs: 4_000,
  firstOpenMs: 6_000,
  repeatOpenMs: 3_000,
  monthTransitionMs: 5_000,
};

type RoundResult = {
  firstOpenMs: number;
  repeatOpenMs: number;
  monthTransitionMs: number;
  todayLoadedCharts: boolean;
  monthLoadedCharts: boolean;
};

type LandingRoundResult = {
  landingOpenMs: number;
  loadedProductRuntime: boolean;
  serviceWorkerRegistrations: number;
  indexedDatabases: string[];
};

const analyticsChunkPatternSource = String.raw`/assets/analytics-charts-[^/]+\.js(?:$|\?)`;

async function throttleLikeMidRangeMobile(page: Page) {
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    connectionType: 'cellular3g',
  });
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

async function elapsed(action: () => Promise<unknown>) {
  const startedAt = performance.now();
  await action();
  return Math.round(performance.now() - startedAt);
}

async function runLandingRound(browser: Browser): Promise<LandingRoundResult> {
  const context = await browser.newContext({
    ...devices['Pixel 5'],
    baseURL: 'http://127.0.0.1:4284',
    serviceWorkers: 'allow',
  });
  const page = await context.newPage();
  await throttleLikeMidRangeMobile(page);

  const landingOpenMs = await elapsed(async () => {
    await page.goto('/');
    await page.locator('.landing-hero h1').waitFor();
  });
  await page.waitForLoadState('networkidle');
  const loadedProductRuntime = await page.evaluate(() =>
    performance.getEntriesByType('resource').some((entry) => /analytics-charts|ProductShell|auth-[^/]+\.js/.test(entry.name)),
  );
  const serviceWorkerRegistrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  const indexedDatabases = await page.evaluate(async () =>
    typeof indexedDB.databases === 'function'
      ? (await indexedDB.databases()).map((database) => database.name).filter((name): name is string => Boolean(name))
      : [],
  );

  await context.close();
  return { landingOpenMs, loadedProductRuntime, serviceWorkerRegistrations, indexedDatabases };
}

async function runRound(browser: Browser): Promise<RoundResult> {
  const context = await browser.newContext({
    ...devices['Pixel 5'],
    baseURL: 'http://127.0.0.1:4284',
    serviceWorkers: 'allow',
  });
  const page = await context.newPage();
  await throttleLikeMidRangeMobile(page);

  const firstOpenMs = await elapsed(async () => {
    await page.goto('/today');
    await page.locator('.page--today').waitFor();
  });
  const todayLoadedCharts = await page.evaluate(
    (pattern) => performance.getEntriesByType('resource').some((entry) => new RegExp(pattern, 'i').test(entry.name)),
    analyticsChunkPatternSource,
  );
  const repeatOpenMs = await elapsed(async () => {
    await page.reload();
    await page.locator('.page--today').waitFor();
  });

  await page.goto('/settings');
  await page.locator('input[type="file"]').setInputFiles(demoFilePath);
  await expect(page.locator('input[type="file"]')).toHaveValue('');
  await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Обзор' }).click();
  await page.locator('.page--week').waitFor();
  await page.evaluate(() => performance.clearResourceTimings());
  const monthTransitionMs = await elapsed(async () => {
    await page.getByRole('navigation', { name: 'Период обзора' }).getByRole('link', { name: 'Месяц' }).click();
    await page.locator('.page--month').waitFor();
    await page.locator('.month-analysis-details > summary').click();
    await page.locator('.echart-panel').first().waitFor();
  });
  const monthLoadedCharts = await page.evaluate(
    (pattern) => performance.getEntriesByType('resource').some((entry) => new RegExp(pattern, 'i').test(entry.name)),
    analyticsChunkPatternSource,
  );

  await context.close();
  return { firstOpenMs, repeatOpenMs, monthTransitionMs, todayLoadedCharts, monthLoadedCharts };
}

function median(values: number[]) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
}

test('measures production PWA entry and the analytics route on a mid-range mobile profile', async ({ browser }, testInfo) => {
  const landingResults: LandingRoundResult[] = [];
  const results: RoundResult[] = [];
  for (let round = 0; round < rounds; round += 1) {
    landingResults.push(await runLandingRound(browser));
    results.push(await runRound(browser));
  }

  const medians = {
    landingOpenMs: median(landingResults.map((result) => result.landingOpenMs)),
    firstOpenMs: median(results.map((result) => result.firstOpenMs)),
    repeatOpenMs: median(results.map((result) => result.repeatOpenMs)),
    monthTransitionMs: median(results.map((result) => result.monthTransitionMs)),
  };
  await testInfo.attach('mobile-performance.json', {
    body: JSON.stringify(
      { profile: 'Pixel 5, Fast 3G, CPU x4, production build', landingRounds: landingResults, rounds: results, medians, budgets },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  console.log(`Mobile performance medians: ${JSON.stringify(medians)}`);

  expect(
    landingResults.every((result) => !result.loadedProductRuntime),
    'Landing must not download the product runtime',
  ).toBe(true);
  expect(
    landingResults.every((result) => result.serviceWorkerRegistrations === 0),
    'Landing must not register the product PWA',
  ).toBe(true);
  expect(
    landingResults.every((result) => result.indexedDatabases.length === 0),
    'Landing must not open IndexedDB',
  ).toBe(true);
  expect(
    results.every((result) => !result.todayLoadedCharts),
    `Today must not download ${analyticsChunkPatternSource}`,
  ).toBe(true);
  expect(medians.landingOpenMs).toBeLessThanOrEqual(budgets.landingOpenMs);
  expect(
    results.every((result) => result.monthLoadedCharts),
    `Month must lazy-load ${analyticsChunkPatternSource} when needed`,
  ).toBe(true);
  expect(medians.firstOpenMs).toBeLessThanOrEqual(budgets.firstOpenMs);
  expect(medians.repeatOpenMs).toBeLessThanOrEqual(budgets.repeatOpenMs);
  expect(medians.monthTransitionMs).toBeLessThanOrEqual(budgets.monthTransitionMs);
});
