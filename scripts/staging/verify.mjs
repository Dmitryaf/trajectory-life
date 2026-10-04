import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { chromium } from '@playwright/test';
import { connectClient, STAGING_ORIGIN, requireStaging, requireDistinctClients } from './session.mjs';
import { defaultSuites, runSuites } from './runner.mjs';

const usage = `Usage: npm run test:staging -- --confirm-test-accounts
Only ${STAGING_ORIGIN} is allowed.
Sign in manually to two disposable test accounts. Do not use these accounts elsewhere during the run.
The run creates/removes synthetic results, tests cross-user snapshot access, and withdraws test-account telemetry consent.
No server flags, passwords, accounts or production deployments are changed.
No passwords, tokens, browser profiles or journal exports are saved by this runner.
Exit codes: 0 passed, 1 failed, 2 blocked/incomplete. Reports: qa/staging-verification-*.json.`;

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log(usage);
    return 0;
  }
  if (args.length !== 1 || args[0] !== '--confirm-test-accounts') {
    console.log(usage);
    return 2;
  }
  requireStaging(STAGING_ORIGIN, true);
  const browser = await chromium.launch({ headless: false, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  const input = createInterface({ input: process.stdin, output: process.stdout });
  const clients = [];
  try {
    const pages = [];
    for (const label of ['A', 'B']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.goto(`${STAGING_ORIGIN}/today`, { waitUntil: 'domcontentloaded' });
      await page.bringToFront();
      await input.question(`Sign in to test account ${label} in the new window, then press Enter here. `);
      pages.push(page);
    }
    for (const [index, page] of pages.entries()) {
      clients.push(await connectClient(page, STAGING_ORIGIN, index === 0 ? 'A' : 'B'));
    }
    requireDistinctClients(clients);
    const report = await runSuites(clients, await defaultSuites(), {
      confirmed: true,
      onProgress: (name) => console.log(`Checking ${name}...`),
    });
    await mkdir('qa', { recursive: true });
    const path = `qa/staging-verification-${Date.now()}.json`;
    await writeFile(path, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(
      JSON.stringify({ report: path, suites: report.suites.map(({ name, status }) => ({ name, status })), exitCode: report.exitCode }),
    );
    return report.exitCode;
  } finally {
    for (const client of clients) {
      client.dispose();
    }
    input.close();
    await browser.close();
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(`Staging verification stopped (${error instanceof Error ? error.name : 'UnknownError'}). Raw session data suppressed.`);
  process.exitCode = 1;
}
