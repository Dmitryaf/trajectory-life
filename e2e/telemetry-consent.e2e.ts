import { expect, test } from './fixtures';

// The offline withdrawal scenario deliberately aborts only the telemetry endpoint.
test.use({ allowedBrowserErrors: [/net::ERR_INTERNET_DISCONNECTED|The Internet connection appears to be offline/] });

for (const width of [1440, 390]) {
  test(`consent is optional and its action stays stable through grant and withdrawal at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let enabled = false;
    let revision = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const operations: string[] = [];
    await page.route('**/functions/v1/product-events', async (route) => {
      const body = route.request().postDataJSON();
      operations.push(body.operation);
      if (body.operation === 'grant') {
        enabled = true;
        revision = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      }
      if (body.operation === 'withdraw') {
        enabled = false;
        revision = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      }
      await route.fulfill({ json: { enabled, revision, policy_version: 1, server_time: new Date().toISOString() } });
    });
    await page.goto('/today');
    await expect(page.locator('.app-main')).toBeVisible();
    // Mount the production consent component with the real queue; only the external Edge response is simulated.
    await page.evaluate(async () => {
      const vuePath = '/node_modules/.vite/deps/vue.js';
      const componentPath = '/src/features/telemetry/ui/TelemetryConsent.vue';
      const telemetryPath = '/src/features/telemetry/productTelemetry.ts';
      const [{ createApp }, { default: component }, { productTelemetry }] = await Promise.all([
        import(vuePath),
        import(componentPath),
        import(telemetryPath),
      ]);
      const host = document.createElement('div');
      host.id = 'telemetry-test-host';
      host.style.cssText = 'max-width: 600px; margin: 20px auto; padding: 12px';
      document.getElementById('app')!.style.display = 'none';
      document.body.prepend(host);
      createApp(component).mount(host);
      productTelemetry.setSession('synthetic-account', 'synthetic-access-token');
    });
    const panel = page.locator('#telemetry-test-host');
    await expect(panel).toContainText('Сбор на этом устройстве выключен');
    expect(operations).not.toContain('grant');
    const grant = panel.getByRole('switch', { name: 'Помогать улучшать Траекторию' });
    await expect(grant).toBeEnabled();
    const initial = await grant.boundingBox();
    await grant.click();
    const withdraw = panel.getByRole('switch', { name: 'Помогать улучшать Траекторию' });
    await expect(withdraw).toBeEnabled();
    await expect(withdraw).toHaveAttribute('aria-checked', 'true');
    const allowed = await withdraw.boundingBox();
    expect(Math.abs(allowed!.y - initial!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(allowed!.height - initial!.height)).toBeLessThanOrEqual(1);
    await withdraw.click();
    await expect(panel).toContainText('персональные продуктовые события удалены с сервера');
    await expect(grant).toBeEnabled();
    const revoked = await grant.boundingBox();
    expect(Math.abs(revoked!.y - initial!.y)).toBeLessThanOrEqual(1);
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(operations).toContain('withdraw');
  });
}

for (const width of [1440, 390]) {
  test(`first contact, later, one reminder, decline and offline retry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let enabled = false;
    let decision = 'undecided';
    let firstOfferedAt: string | null = null;
    let snoozedUntil: string | null = null;
    let reminderCount = 0;
    let now = Date.now();
    let offline = false;
    const operations: string[] = [];
    const revision = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await page.route('**/functions/v1/product-events', async (route) => {
      if (offline) {
        await route.abort('internetdisconnected');
        return;
      }
      const { operation } = route.request().postDataJSON();
      operations.push(operation);
      let offered = false;
      if (operation === 'offer' && !firstOfferedAt && decision === 'undecided') {
        offered = true;
        firstOfferedAt = new Date(now).toISOString();
      }
      if (operation === 'snooze') {
        enabled = false;
        decision = 'snoozed';
        snoozedUntil = new Date(now + 7 * 86_400_000).toISOString();
      }
      if (operation === 'reminder' && reminderCount === 0 && decision === 'snoozed') {
        offered = true;
        reminderCount = 1;
      }
      if (operation === 'withdraw') {
        enabled = false;
        decision = 'declined';
      }
      if (operation === 'grant') {
        enabled = true;
        decision = 'allowed';
      }
      await route.fulfill({
        json: {
          enabled,
          decision,
          revision,
          policy_version: 1,
          first_offered_at: firstOfferedAt,
          snoozed_until: snoozedUntil,
          reminder_count: reminderCount,
          offered,
          server_time: new Date(now).toISOString(),
        },
      });
    });
    async function mountExperience(componentName = 'ConsentExperience', experienced = false) {
      await page.goto('/today');
      await expect(page.locator('.bottom-nav')).toBeVisible();
      await page.evaluate(
        async ({ componentName, experienced }) => {
          const path = '/e2e/telemetry-harness.ts';
          const { mountConsentExperience } = await import(path);
          await mountConsentExperience(componentName, experienced);
        },
        { componentName, experienced },
      );
    }
    async function expectSettledDecision(expected: string) {
      await expect
        .poll(async () =>
          page.evaluate(async () => {
            const path = '/src/features/telemetry/productTelemetry.ts';
            const { telemetryState } = await import(path);
            return { decision: telemetryState.decision, busy: telemetryState.busy, pending: telemetryState.pendingWithdrawal };
          }),
        )
        .toEqual({ decision: expected, busy: false, pending: false });
    }
    await mountExperience();
    const host = page.locator('#telemetry-experience-test');
    await expect(host.getByRole('heading', { name: 'Помочь улучшать Траекторию?' })).toBeVisible();
    expect(operations).not.toContain('grant');
    expect(operations).not.toContain('ingest');
    const allow = host.getByRole('button', { name: 'Разрешить', exact: true });
    const later = host.getByRole('button', { name: 'Не сейчас', exact: true });
    expect((await allow.boundingBox())!.height).toBe((await later.boundingBox())!.height);
    await later.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#next-heading')).toBeFocused();
    await expect.poll(() => decision).toBe('snoozed');
    await expectSettledDecision('snoozed');
    await mountExperience();
    await expect(host.locator('.consent-experience')).toHaveCount(0);
    await expectSettledDecision('snoozed');
    now += 8 * 86_400_000;
    await mountExperience('ConsentExperience', true);
    await expect(host).toContainText('последнее автоматическое предложение');
    expect(operations.filter((op) => op === 'reminder')).toHaveLength(1);
    offline = true;
    await host.getByRole('button', { name: 'Не предлагать' }).click();
    await expect(host.locator('.consent-experience')).toHaveCount(0);
    await mountExperience('TelemetryConsent');
    const toggle = host.getByRole('switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).toBeDisabled();
    const retry = host.getByRole('button', { name: 'Повторить удаление событий' });
    await expect(retry).toBeEnabled();
    offline = false;
    await retry.click();
    await expect.poll(() => decision).toBe('declined');
    await expect(toggle).toBeEnabled();
    await mountExperience('ConsentExperience', true);
    await expect(host.locator('.consent-experience')).toHaveCount(0);
    expect(operations.filter((op) => op === 'reminder')).toHaveLength(1);
    expect(await host.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
}
