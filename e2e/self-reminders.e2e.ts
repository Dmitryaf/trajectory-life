import { expect, test } from './fixtures';
import { expectPageFitsViewport } from './layout-assertions';

test.use({ confirmBackupImports: false });

test('saves a personal reminder offline and rereads it while reviewing a month without daily entries', async ({ page, context }, info) => {
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00.000Z'));
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

  await page.getByRole('link', { name: 'Сегодня', exact: true }).click();
  await expect(page.getByRole('link', { name: /Вспомнить неделю/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Вспомнить месяц/ }).click();
  await expect(page).toHaveURL(/\/month\?month=2026-10-01$/);
  await expect(page.getByText('За этот месяц пока нет записей')).toBeVisible();
  await page.getByText('Перечитать напоминания', { exact: true }).click();
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
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await page.getByLabel('Категория').selectOption('lesson');
  const editedText = 'После разговора стало понятнее, что проверить дальше.';
  await page.getByLabel('Текст записи').fill(editedText);
  await page.getByRole('link', { name: 'К журналу' }).click();
  await page.getByRole('link', { name: /Напоминания себе/ }).click();
  await expect(page.getByLabel('Текст записи')).toHaveValue(editedText);
  await page.getByRole('button', { name: 'Сохранить запись' }).click();
  await expect(page.getByRole('heading', { name: 'Уроки прошлого' })).toBeVisible();
  await expect(page.getByText(editedText, { exact: true })).toBeVisible();
  await expectPageFitsViewport(page, 'journal with a saved reminder');
  await page.screenshot({ path: info.outputPath('journal-self-reminders.png'), animations: 'disabled' });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Удалить' }).click();
  await expect(page.getByText(editedText, { exact: true })).toHaveCount(0);
});
