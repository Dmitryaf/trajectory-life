import { expect, test } from './fixtures';
import { expectPageFitsViewport, expectVerticalSeparation, readLayoutBox } from './layout-assertions';

test.use({ reducedMotion: 'reduce' });

test('separates password recovery actions with and without a validation message', async ({ page }) => {
  await page.goto('/password-reset');
  await page.locator('.password-reset-card').waitFor();
  await page.evaluate(() => {
    type AppElement = HTMLElement & {
      __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { session: unknown }> } } } };
    };
    const auth = (document.getElementById('app') as AppElement).__vue_app__.config.globalProperties.$pinia._s.get('auth')!;
    auth.session = { user: { id: 'synthetic-recovery-user' } };
  });
  await page.getByLabel('Новый пароль', { exact: true }).fill('safe-password');
  await page.getByLabel('Повторите пароль').fill('different-password');
  const submit = page.getByRole('button', { name: 'Сохранить новый пароль', exact: true });
  const back = page.getByRole('button', { name: 'Вернуться ко входу', exact: true });
  for (const width of [390, 768, 980, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expectVerticalSeparation(
      await readLayoutBox(submit, 'save password'),
      await readLayoutBox(back, 'return to sign-in'),
      8,
      'reset actions',
    );
    await expectPageFitsViewport(page, `password reset at ${width}px`);
  }
  await submit.click();
  const status = page.getByText('Пароли не совпадают.', { exact: true });
  await expect(status).toBeVisible();
  expectVerticalSeparation(
    await readLayoutBox(status, 'validation message'),
    await readLayoutBox(back, 'return to sign-in'),
    8,
    'reset status',
  );
  await expect(page.getByLabel('Новый пароль', { exact: true })).toHaveValue('safe-password');
});

test('keeps the optional first review actions below the period choices', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z'));
  await page.goto('/today');
  await page.getByRole('button', { name: 'Начать с сегодняшнего дня' }).click();
  await page.getByRole('textbox', { name: 'Заметка дня' }).fill('Сохранил первую заметку.');
  await page.getByRole('button', { name: 'Сохранить день', exact: true }).click();
  const prompt = page.getByRole('region', { name: 'Первый обзор недели' });
  await expect(prompt).toBeVisible();
  for (const width of [390, 720, 768, 980, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const periods = await readLayoutBox(prompt.getByRole('radiogroup'), 'period choices');
    const actions = await readLayoutBox(prompt.locator('.first-use-card__actions'), 'review actions');
    expectVerticalSeparation(periods, actions, 8, `first review actions at ${width}px`);
    expect(Math.abs(actions.x - periods.x), 'Choices and actions should share a left edge').toBeLessThanOrEqual(1);
    await expectPageFitsViewport(page, `first review prompt at ${width}px`);
  }
  await prompt.getByRole('radio', { name: /Прошлая неделя/ }).click();
  await expect(prompt.getByRole('radio', { name: /Прошлая неделя/ })).toBeChecked();
  await prompt.getByRole('button', { name: 'Открыть обзор', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Что вам удалось закончить или получить?' })).toBeVisible();
});

test('shows yesterday recovery and journal shortcuts before the daily note', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-05T12:00:00Z'));
  await page.goto('/today');
  await page.getByRole('button', { name: 'Начать с сегодняшнего дня' }).click();
  await page.getByRole('textbox', { name: 'Заметка дня' }).fill('Сохранил первую заметку.');
  await page.getByRole('button', { name: 'Сохранить день', exact: true }).click();
  await page.getByRole('region', { name: 'Первый обзор недели' }).getByRole('button', { name: 'Больше не показывать' }).click();
  const recovery = page.getByRole('region', { name: 'Вчера без записи' });
  const shortcuts = page.getByRole('navigation', { name: 'Быстрые записи' });
  await expect(recovery).toBeVisible();
  for (const width of [390, 768, 980, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const recoveryBox = await readLayoutBox(recovery, 'yesterday recovery');
    const headingBox = await readLayoutBox(page.locator('.page--today > .page-heading'), 'Today heading');
    const shortcutsBox = await readLayoutBox(shortcuts, 'journal shortcuts');
    const noteBox = await readLayoutBox(page.locator('.form-card--daily-summary'), 'daily note');
    expectVerticalSeparation(headingBox, recoveryBox, 8, 'heading before recovery');
    expectVerticalSeparation(recoveryBox, shortcutsBox, 8, 'recovery before journal');
    expectVerticalSeparation(shortcutsBox, noteBox, 12, 'journal before daily note');
    await expectPageFitsViewport(page, `restored Today order at ${width}px`);
  }
  await expect(shortcuts.getByRole('link', { name: 'Записать итог' })).toHaveAttribute('href', '/results');
  await expect(shortcuts.getByRole('link', { name: 'Записать мысль или событие' })).toHaveAttribute('href', '/events');
  await recovery.getByRole('button', { name: 'Добавить запись' }).click();
  await expect(page.getByLabel('Дата записи', { exact: true })).toHaveValue('2026-10-04');
});
