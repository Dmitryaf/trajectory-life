import { expect, test } from './fixtures';
import { expectPageFitsViewport } from './layout-assertions';
import { readDemoPayload, visualDemoFilePath } from './demo-data';

test.use({ confirmBackupImports: false });

test('saves a personal reminder offline and rereads it while reviewing a month without daily entries', async ({ page, context }, info) => {
  await page.clock.setFixedTime(new Date('2026-10-31T12:00:00.000Z'));
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/more');
  await page.getByRole('link', { name: /Напоминания себе/ }).click();
  await expect(page.getByRole('heading', { name: 'Напоминания себе' })).toBeVisible();
  await page.getByRole('button', { name: 'Добавить запись' }).click();
  await page.getByLabel('Категория').selectOption('question');
  const firstText = 'Какое решение я откладываю?';
  await page.getByLabel('Текст записи').fill(firstText);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Сохранить запись' }).click();
  await expect(page.getByText(firstText, { exact: true })).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText(firstText, { exact: true })).toBeVisible();

  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00.000Z'));
  await page.getByRole('link', { name: 'Сегодня', exact: true }).click();
  await expect(page.getByRole('link', { name: /Вспомнить неделю/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Вспомнить месяц/ }).click();
  await expect(page).toHaveURL(/\/month\?month=2026-10-01#month-review$/);
  await expect(page.getByText('За этот месяц пока нет записей')).toBeVisible();
  await page.getByText('Вопросы месяца', { exact: true }).click();
  await expect(page.getByText(firstText, { exact: true })).toBeVisible();
  await expectPageFitsViewport(page, 'month with expanded self-reminders');
  await page.locator('#month-review').screenshot({ path: info.outputPath('month-self-reminders.png'), animations: 'disabled' });
  const nextStep = page.getByPlaceholder('Что стоит продолжить, изменить или проверить');
  await expect(nextStep).toHaveValue('');
  await nextStep.fill('В четверг назначу разговор');
  await page.getByRole('button', { name: 'Сохранить обзор месяца' }).click();
  await expect(page.getByText('Итог месяца сохранён', { exact: true })).toBeVisible();
  await page.reload();
  await expect(nextStep).toHaveValue('В четверг назначу разговор');

  await page.getByRole('link', { name: 'Журнал', exact: true }).click();
  await page.getByRole('link', { name: /Напоминания себе/ }).click();
  await page.getByText(firstText, { exact: true }).click();
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await page.getByLabel('Категория').selectOption('lesson');
  await page.getByLabel('Заголовок').fill('Проверка идеи');
  const editedText = 'После разговора стало понятнее, что проверить дальше.';
  await page.getByLabel('Текст записи').fill(editedText);
  await page.getByRole('link', { name: 'К журналу' }).click();
  await page.getByRole('link', { name: /Напоминания себе/ }).click();
  await expect(page.getByLabel('Текст записи')).toHaveValue(editedText);
  await expect(page.getByLabel('Заголовок')).toHaveValue('Проверка идеи');
  await page.getByRole('button', { name: 'Сохранить запись' }).click();
  await expect(page.getByRole('heading', { name: 'Уроки прошлого' })).toBeVisible();
  await page.getByText('Проверка идеи', { exact: true }).click();
  await expect(page.getByText(editedText, { exact: true })).toBeVisible();
  await expect(page.getByText('Проверка идеи', { exact: true })).toBeVisible();
  const edit = page.getByRole('button', { name: 'Редактировать' });
  const remove = page.getByRole('button', { name: 'Удалить' });
  await expect(edit).toHaveCSS('text-decoration-line', 'none');
  await expect(remove).toHaveCSS('border-top-style', 'solid');
  for (const button of [edit, remove]) {
    const initialFill = await button.evaluate((element) => getComputedStyle(element).backgroundColor);
    await button.hover();
    await expect(button).not.toHaveCSS('background-color', initialFill);
  }
  await expectPageFitsViewport(page, 'journal with a saved reminder');
  await page.screenshot({ path: info.outputPath('journal-self-reminders.png'), animations: 'disabled' });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Удалить' }).click();
  await expect(page.getByText(editedText, { exact: true })).toHaveCount(0);
});

test('keeps all principles on wide Today and shows the same optional topics across monthly reviews', async ({ page }, info) => {
  const createdAt = '2026-08-01T12:00:00Z';
  const selfReminders = [
    ...Array.from({ length: 26 }, (_, index) => ({
      id: `sample-principle-${index}`,
      category: 'principle',
      title: `Принцип ${index + 1}`,
      text: `Подробности принципа ${index + 1}`,
      createdAt: new Date(Date.parse(createdAt) - index * 1000).toISOString(),
    })),
    { id: 'sample-topic', category: 'question', title: 'Тема месяца', text: 'Первый вопрос\nВторой вопрос', createdAt },
  ];
  const payload = { ...readDemoPayload(visualDemoFilePath), selfReminders };
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00.000Z'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/settings');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('input[type=file]').setInputFiles({
    name: 'reminders.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(page.locator('input[type=file]')).toHaveValue('');
  await page.getByRole('link', { name: 'Сегодня', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Мои принципы' });
  const list = panel.getByRole('list');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS('position', 'sticky');
  await expect(list.getByRole('listitem')).toHaveCount(26);
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expectPageFitsViewport(page, 'Today with all principles');
  await page.screenshot({ path: info.outputPath('today-principles.png'), animations: 'disabled' });
  await page.evaluate(() => window.scrollTo(0, 240));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await expect.poll(async () => (await panel.boundingBox())?.y).toBeGreaterThanOrEqual(64);
  await panel.getByText('Принцип 26', { exact: true }).click();
  await expect(panel.getByText('Подробности принципа 26', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toBeHidden();
  await expectPageFitsViewport(page, 'mobile Today with existing principles');
  await page.getByRole('link', { name: 'Мои принципы', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Редактировать' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Вопросы к себе', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Вопросы к себе' })).toBeVisible();
  await page.goto('/self-reminders?entry=sample-topic');
  await expect(page.getByText('Первый вопрос', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Редактировать' })).toBeVisible();

  for (const month of ['2026-10-01', '2026-09-01']) {
    await page.goto(`/month?month=${month}`);
    const questions = page.locator('#month-review').getByText('Вопросы месяца', { exact: true });
    await expect(questions).toBeVisible();
    await expect(page.getByText('Тема месяца', { exact: true })).toBeHidden();
    await questions.click();
    await expect(page.getByText('Тема месяца', { exact: true })).toBeVisible();
    await expect(page.getByText('Первый вопрос', { exact: false })).toBeHidden();
    await page.getByText('Тема месяца', { exact: true }).click();
    await expect(page.getByText('Первый вопрос', { exact: false })).toBeVisible();
    await expect(page.getByPlaceholder('Что стоит продолжить, изменить или проверить')).toHaveValue('');
    await page.getByText('Перечитать напоминания', { exact: true }).click();
    await expect(page.getByText('Принцип 26', { exact: true })).toBeVisible();
    await expect(page.getByText('Подробности принципа 26', { exact: true })).toBeHidden();
    await expectPageFitsViewport(page, 'month with expanded questions');
  }
});

test('returns to a weekly decision, a due goal and an ended experiment from the current day', async ({ page }) => {
  const payload = readDemoPayload(visualDemoFilePath);
  const today = '2026-08-31';
  await page.clock.setFixedTime(new Date(today + 'T12:00:00Z'));
  const sampleReview = payload.weeklyReviews[0] as Record<string, unknown>;
  payload.weeklyReviews = [{ ...sampleReview, weekStart: '2026-08-24', nextLever: 'Выделить вечер на чтение', ifThenPlan: '' }];
  payload.dailyEntries = payload.dailyEntries.filter((entry) => entry.date < '2026-08-30');
  payload.settings = {
    ...payload.settings,
    activeFocusTitle: 'Прочитать книгу',
    focusReviewDate: '2026-08-30',
    experiment: {
      ...(payload.settings.experiment as Record<string, unknown>),
      active: true,
      title: 'Читать вечером',
      startDate: '2026-08-01',
      endDate: '2026-08-29',
    },
  };
  await page.goto('/settings');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('input[type=file]').setInputFiles({
    name: 'sample.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(page.locator('input[type=file]')).toHaveValue('');
  await page.goto('/today');
  await expect(page.getByText('Выделить вечер на чтение', { exact: true })).toBeVisible();
  const note = await page.getByRole('textbox', { name: 'Заметка дня' }).boundingBox();
  const followUps = await page.getByRole('region', { name: 'Пора пересмотреть' }).boundingBox();
  expect(note!.y + note!.height).toBeLessThan(followUps!.y);
  await page.getByRole('button', { name: 'Пересмотреть цель' }).click();
  await page.getByLabel('Когда вернуться к цели').fill('2026-09-30');
  await page.getByRole('button', { name: 'Сохранить цель' }).click();
  await expect(page.getByRole('button', { name: 'Пересмотреть цель' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Подвести итог эксперимента' }).click();
  await expect(page.getByRole('button', { name: 'Завершить эксперимент' })).toBeVisible();
  await page.goto('/today?date=2026-08-20');
  await expect(page.getByRole('heading', { name: /20 августа/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Подвести итог эксперимента' })).toHaveCount(0);
  await expect(page.getByText('Выделить вечер на чтение')).toHaveCount(0);
});
