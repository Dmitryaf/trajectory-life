import { expect, test, type Page } from './fixtures';
import { demoFilePath } from './demo-data';
import { expectPageFitsViewport } from './layout-assertions';

async function openComposer(page: Page) {
  if ((await page.locator('.archive-add').getAttribute('open')) === null) {
    await page.locator('.archive-add > summary').click();
  }
}

test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/settings');
  await page.locator('input[type="file"]').setInputFiles(demoFilePath);
  await expect(page.locator('input[type="file"]')).toHaveValue('');
});

test('adds both journal entry types through their direct section links', async ({ page }) => {
  await page.goto('/more');
  await expect(page.getByRole('button', { name: 'Добавить запись' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Что хотите сохранить?' })).toHaveCount(0);
  await expect(page.locator('.journal-guide-card')).toHaveCount(0);

  const resultsLink = page.locator('a.more-card[href="/results"]');
  await resultsLink.focus();
  await expect(resultsLink).toBeFocused();
  await resultsLink.press('Enter');
  await expect(page).toHaveURL(/\/results$/);
  await openComposer(page);
  const resultTitle = page.getByPlaceholder('Что вы сделали или какой результат получили');
  await resultTitle.fill('Завершил проверку прямого добавления');
  await page
    .getByPlaceholder('Что произошло, почему это важно и какие подробности хочется запомнить')
    .fill('Проверен прямой путь из Журнала');
  await page.getByRole('button', { name: 'Добавить итог' }).click();
  await expect(page.getByText('Итог добавлен', { exact: true })).toBeVisible();
  await expect(page.locator('.result-item').filter({ hasText: 'Завершил проверку прямого добавления' })).toBeVisible();

  await page.goto('/more');
  const eventsLink = page.locator('a.more-card[href="/events"]');
  await eventsLink.focus();
  await expect(eventsLink).toBeFocused();
  await eventsLink.press('Enter');
  await expect(page).toHaveURL(/\/events$/);
  await openComposer(page);
  const eventTitle = page.getByPlaceholder('Короткое название');
  await page.getByRole('button', { name: /Мысль или наблюдение/ }).click();
  await eventTitle.fill('Заметил прямой путь к новой записи');
  await page.getByPlaceholder('Что произошло или что вы поняли и почему это важно').fill('Тип выбирается в форме раздела');
  await page.locator('.result-composer .primary-button').click();
  await expect(page.getByText('Событие добавлено', { exact: true })).toBeVisible();
  await expect(page.locator('.timeline-item').filter({ hasText: 'Заметил прямой путь к новой записи' })).toBeVisible();
});

test('does not revive the removed journal modal or composer return from legacy queries', async ({ page }) => {
  await page.goto('/more?add=1');
  await expect(page.locator('a.more-card[href="/results"]')).toBeVisible();
  await expect(page.locator('a.more-card[href="/events"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить запись' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Что хотите сохранить?' })).toHaveCount(0);

  for (const route of ['/results?compose=journal', '/events?compose=journal']) {
    await page.goto(route);
    await expect(page.locator('.archive-add > summary')).toBeVisible();
    await openComposer(page);
    await expect(page.locator('.archive-composer')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Отменить добавление' })).toHaveCount(0);
  }
});

test('keeps cancellation for the remaining archive edit scenarios', async ({ page }) => {
  await page.goto('/results');
  await openComposer(page);
  const resultTitle = page.getByPlaceholder('Что вы сделали или какой результат получили');
  await page.getByRole('button', { name: 'Редактировать итог' }).first().click();
  await resultTitle.fill('Изменение, которое не нужно сохранять');
  await page.getByRole('button', { name: 'Отменить редактирование' }).click();
  await expect(resultTitle).toHaveValue('');
  await expect(page.getByText('Изменение, которое не нужно сохранять', { exact: true })).toHaveCount(0);

  await page.goto('/events');
  await openComposer(page);
  const eventTitle = page.getByPlaceholder('Короткое название');
  await page.getByRole('button', { name: 'Редактировать событие' }).first().click();
  await eventTitle.fill('Другое несохранённое изменение');
  await page.getByRole('button', { name: 'Отменить редактирование' }).click();
  await expect(eventTitle).toHaveValue('');
  await expect(page.getByText('Другое несохранённое изменение', { exact: true })).toHaveCount(0);
});

test('opens edits with Enter without saving on key release and returns focus after cancellation', async ({ page }) => {
  for (const scenario of [
    { route: '/results', card: '.result-item', edit: 'Редактировать итог', toast: 'Итог обновлён' },
    { route: '/events', card: '.timeline-item', edit: 'Редактировать событие', toast: 'Событие обновлено' },
  ]) {
    await page.goto(scenario.route);
    const card = page.locator(scenario.card).first();
    const originalTitle = await card.locator('strong').first().innerText();
    const edit = card.getByRole('button', { name: scenario.edit });
    await edit.focus();
    await page.keyboard.press('Enter');
    const input = page.locator('.result-composer input[type="text"]');
    await expect(page.locator('.archive-add')).toHaveAttribute('open', '');
    await expect(input).toBeFocused();
    await expect(input).toBeInViewport();
    await expect(page.getByText(scenario.toast, { exact: true })).toHaveCount(0);
    await input.fill('Отменённое редактирование клавиатурой');
    await expect(card.locator('strong').first()).toHaveText(originalTitle);
    await page.getByRole('button', { name: 'Отменить редактирование' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.archive-add')).not.toHaveAttribute('open', '');
    await expect(edit).toBeFocused();
    await expect(edit).toBeInViewport();
    await expect(card.locator('strong').first()).toHaveText(originalTitle);
  }
});

test('contains the longest supported journal titles without shrinking primary actions', async ({ page }) => {
  await page.goto('/results');
  await openComposer(page);
  await page.getByPlaceholder('Что вы сделали или какой результат получили').fill('И'.repeat(160));
  await page.getByRole('button', { name: 'Добавить итог' }).click();
  await expect(page.getByText('Итог добавлен', { exact: true })).toBeVisible();
  await expectPageFitsViewport(page, 'result with a maximum-length title');

  await page.goto('/events');
  await openComposer(page);
  await page.getByPlaceholder('Короткое название').fill('С'.repeat(140));
  await page.locator('.result-composer .primary-button').click();
  await expect(page.getByText('Событие добавлено', { exact: true })).toBeVisible();
  await expectPageFitsViewport(page, 'event with a maximum-length title');
});

test('shows note disclosure only for measured overflow at mobile and desktop widths', async ({ page }) => {
  // Import, two saves and disclosure toggles at both widths exceeded 30s on hosted Mobile WebKit.
  test.slow();
  await page.goto('/results');
  await openComposer(page);
  const title = page.getByPlaceholder('Что вы сделали или какой результат получили');
  const note = page.getByPlaceholder('Что произошло, почему это важно и какие подробности хочется запомнить');

  await title.fill('Короткая заметка для проверки раскрытия');
  await note.fill('Короткий контекст.');
  await page.getByRole('button', { name: 'Добавить итог' }).click();
  await expect(page.getByText('Итог добавлен', { exact: true })).toBeVisible();

  await title.fill('Длинная заметка для проверки раскрытия');
  await note.fill('Подробный синтетический контекст результата. '.repeat(30));
  await page.getByRole('button', { name: 'Добавить итог' }).click();
  await expect(page.locator('.result-item').filter({ hasText: 'Длинная заметка для проверки раскрытия' })).toBeVisible();

  const shortCard = page.locator('.result-item').filter({ hasText: 'Короткая заметка для проверки раскрытия' });
  const longCard = page.locator('.result-item').filter({ hasText: 'Длинная заметка для проверки раскрытия' });

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(shortCard.getByRole('button', { name: 'Показать полностью' })).toHaveCount(0);

    const toggle = longCard.getByRole('button', { name: 'Показать полностью' });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(longCard.getByRole('button', { name: 'Свернуть' })).toBeVisible();
    await longCard.getByRole('button', { name: 'Свернуть' }).click();
    await expect(toggle).toBeVisible();
  }
});
