import { expect, test, type Page } from './fixtures';
import { readFile } from 'node:fs/promises';
import type { ExportPayload } from '../src/features/backup/snapshot';
import { readLayoutBox } from './layout-assertions';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

async function openDailyEntry(page: Page) {
  await page.goto('/today');
  const introClose = page.getByRole('button', { name: 'Закрыть объяснение' });
  if (await introClose.isVisible()) {
    await introClose.click();
  }
  const startToday = page.getByRole('button', { name: 'Начать с сегодняшнего дня' });
  await expect(startToday).toBeVisible();
  await startToday.click();
}

async function selectEntryDate(page: Page, value: string) {
  const dateInput = page.getByLabel('Дата записи');
  await dateInput.evaluate((input, nextValue) => {
    const dateField = input as HTMLInputElement;
    dateField.value = nextValue;
    dateField.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await expect(dateInput).toHaveValue(value);
}

async function openAdditionalBlocks(page: Page) {
  const disclosure = page.locator('.daily-additional-blocks');
  await expect(disclosure).toBeVisible();
  if (!(await disclosure.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await disclosure.locator('summary').click();
  }
  await expect(disclosure).toHaveAttribute('open', '');
}

function addDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function startOfWeek(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  const weekday = date.getUTCDay() || 7;
  return addDays(dateKey, 1 - weekday);
}

async function emulateSafeViewport(
  page: Page,
  insets: { top: number; right: number; bottom: number; left: number },
  viewportHeight: number,
) {
  await page.evaluate(
    ({ top, right, bottom, left, height }) => {
      const root = document.documentElement.style;
      root.setProperty('--safe-top', `${top}px`);
      root.setProperty('--safe-right', `${right}px`);
      root.setProperty('--safe-bottom', `${bottom}px`);
      root.setProperty('--safe-left', `${left}px`);
      root.setProperty('--viewport-height', `${height}px`);
    },
    { ...insets, height: viewportHeight },
  );
}

test('uses the full visible date control as the pointer and keyboard target', async ({ page }) => {
  test.slow();
  await openDailyEntry(page);

  const control = page.locator('.entry-date-control');
  const trigger = page.getByRole('button', { name: 'Выбрать дату записи' });
  const [controlBox, triggerBox] = await Promise.all([control.boundingBox(), trigger.boundingBox()]);
  expect(controlBox).not.toBeNull();
  expect(triggerBox).not.toBeNull();
  expect(triggerBox!.x).toBeCloseTo(controlBox!.x, 0);
  expect(triggerBox!.y).toBeCloseTo(controlBox!.y, 0);
  expect(triggerBox!.width).toBeCloseTo(controlBox!.width, 0);
  expect(triggerBox!.height).toBeCloseTo(controlBox!.height, 0);
  expect(triggerBox!.height).toBeGreaterThanOrEqual(44);

  await trigger.focus();
  await expect(trigger).toBeFocused();
  await trigger.evaluate((element) => {
    element.addEventListener('click', () => element.setAttribute('data-click-observed', 'true'), { once: true });
  });
  await trigger.click({ position: { x: 2, y: 2 } });
  await expect(trigger).toHaveAttribute('data-click-observed', 'true');
});

test('keeps native mobile date and time inputs inside their cards', async ({ page }) => {
  test.slow();
  await openDailyEntry(page);

  const sleepCard = page.locator('.form-card--sleep');
  const timeInputs = sleepCard.locator('input[type="time"]');
  await expect(timeInputs).toHaveCount(2);

  const overflow = await sleepCard.evaluate((card) => {
    const cardBox = card.getBoundingClientRect();
    return Array.from(card.querySelectorAll<HTMLInputElement>('input[type="time"]')).filter((input) => {
      const box = input.getBoundingClientRect();
      return box.left < cardBox.left + 12 || box.right > cardBox.right - 12;
    }).length;
  });
  expect(overflow).toBe(0);

  await page.goto('/settings#experiment-settings');
  await page.getByRole('button', { name: 'Эксперимент', exact: true }).click();
  const experimentCard = page.locator('.settings-card--experiment');
  const dateOverflow = await experimentCard.evaluate((card) => {
    const cardBox = card.getBoundingClientRect();
    return Array.from(card.querySelectorAll<HTMLInputElement>('input[type="date"]')).filter((input) => {
      const box = input.getBoundingClientRect();
      return box.left < cardBox.left + 12 || box.right > cardBox.right - 12;
    }).length;
  });
  expect(dateOverflow).toBe(0);
});

test('does not move the daily form while a native time picker is active', async ({ page }) => {
  await openDailyEntry(page);

  const timeInput = page.getByLabel('Лёг спать');
  const sleepCard = page.locator('.form-card--sleep');
  await timeInput.focus();
  const initialTop = (await sleepCard.boundingBox())?.y;
  expect(initialTop).toBeDefined();

  await timeInput.evaluate((input) => {
    const field = input as HTMLInputElement;
    field.value = '23:00';
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await expect(page.locator('.entry-change-notice')).toBeHidden();
  await expect(page.locator('.floating-save-button')).toBeHidden();
  expect((await sleepCard.boundingBox())?.y).toBeCloseTo(initialTop!, 0);

  await timeInput.blur();
  await expect(page.locator('.entry-change-notice')).toBeVisible();
  await expect(page.locator('.floating-save-button')).toBeVisible();
});

test('keeps iPhone text and the current-goal placeholder inside their blocks', async ({ page }) => {
  await openDailyEntry(page);
  await page.getByRole('button', { name: 'Выбрать цель' }).first().click();

  const criterion = page.getByLabel('Что считать шагом к цели');
  const placeholderOverflow = await criterion.evaluate((field) => field.scrollHeight - field.clientHeight);
  expect(placeholderOverflow).toBeLessThanOrEqual(2);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/settings#daily-settings');
  const settingsHeading = page.locator('.page--settings > .page-heading');
  await expect(settingsHeading).toBeVisible();
  expect(await settingsHeading.evaluate((heading) => getComputedStyle(heading, '::after').content)).toBe('none');

  const movementTextSize = await page
    .locator('.settings-card--movement .form-card__heading p')
    .evaluate((text) => getComputedStyle(text).fontSize);
  const lifeAreasTextSize = await page
    .locator('.settings-card--areas .form-card__heading p')
    .evaluate((text) => getComputedStyle(text).fontSize);
  expect(movementTextSize).toBe(lifeAreasTextSize);
});

test('moves mobile navigation away while a form field is being edited', async ({ page }) => {
  await openDailyEntry(page);
  const navigation = page.locator('.bottom-nav');
  const note = page.getByPlaceholder('Например: после прогулки стало легче собраться с мыслями');

  await note.focus();
  await expect(navigation).toHaveCSS('opacity', '0');
  await expect(navigation).toHaveCSS('pointer-events', 'none');

  await note.blur();
  await expect(navigation).toHaveCSS('opacity', '1');
});

test('keeps the core entry before keyboard-accessible additional blocks', async ({ page }) => {
  await openDailyEntry(page);
  const noteHeading = page.locator('.form-card--daily-summary h2');
  const headingBox = await noteHeading.boundingBox();
  const navigationBox = await page.locator('.bottom-nav').boundingBox();
  expect(headingBox).not.toBeNull();
  expect(navigationBox).not.toBeNull();
  expect(headingBox!.y).toBeLessThan(navigationBox!.y);

  const disclosure = page.locator('.daily-additional-blocks');
  const summary = disclosure.locator('summary');
  await expect(disclosure).not.toHaveAttribute('open', '');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(page.locator('#movement')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(disclosure).not.toHaveAttribute('open', '');
});

test('saves a dirty daily entry from the mobile action', async ({ page }) => {
  test.slow();
  await openDailyEntry(page);
  const floatingSave = page.locator('.floating-save-button');
  await expect(floatingSave).toBeHidden();

  await page.getByPlaceholder('Например: после прогулки стало легче собраться с мыслями').fill('Проверка мобильного сохранения');
  await expect(floatingSave).toBeVisible();
  await expect(floatingSave).toHaveCSS('position', 'fixed');
  const saveBox = await floatingSave.boundingBox();
  const navigationBox = await page.locator('.bottom-nav').boundingBox();
  expect(saveBox).not.toBeNull();
  expect(navigationBox).not.toBeNull();
  expect(saveBox!.y + saveBox!.height).toBeLessThan(navigationBox!.y);

  await expect(page.getByText('Черновик сохранён на этом устройстве', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByPlaceholder('Например: после прогулки стало легче собраться с мыслями')).toHaveValue(
    'Проверка мобильного сохранения',
  );
  await expect(page.getByText('Восстановлены несохранённые изменения', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Выбрать цель' }).first().click();
  await page.getByLabel('Что хотите изменить или закончить').fill('Подготовить релиз');
  await page.getByLabel('Как понять, что получилось').fill('Пройти проверку основного сценария');
  await page.getByLabel('Что считать шагом к цели').fill('Проверенный сценарий на staging');
  await page.getByRole('button', { name: 'Сохранить цель' }).click();
  await expect(page.getByLabel('Текущая цель')).toContainText('Подготовить релиз');
  await expect(page.getByPlaceholder('Например: после прогулки стало легче собраться с мыслями')).toHaveValue(
    'Проверка мобильного сохранения',
  );

  await floatingSave.click();
  await expect(page.getByText('День сохранён на устройстве', { exact: true })).toBeVisible();
  await expect(floatingSave).toBeHidden();

  await openAdditionalBlocks(page);
  const weight = page.getByLabel('Вес');
  await weight.fill('88,2');
  const additionalBlocks = page.locator('.daily-additional-blocks');
  await additionalBlocks.locator('summary').click();
  await expect(additionalBlocks).not.toHaveAttribute('open', '');
  await expect(floatingSave).toContainText('Сохранить изменения');
  await floatingSave.click();
  await expect(page.getByText(/Запись за .* обновлена на устройстве/)).toBeVisible();
  await page.reload();
  await openAdditionalBlocks(page);
  await expect(weight).toHaveValue('88.2');
});

test('keeps a long current goal contained and does not dismiss an edited dialog on a stray pointer gesture', async ({ page }) => {
  test.slow();
  await openDailyEntry(page);
  await page.getByRole('button', { name: 'Выбрать цель' }).first().click();

  const dialog = page.getByRole('dialog', { name: 'Над чем вы сейчас работаете' });
  const titleInput = page.getByLabel('Что хотите изменить или закончить');
  const longGoal = 'ц'.repeat(100);
  await titleInput.fill(longGoal);

  const closeButton = page.getByRole('button', { name: 'Закрыть выбор цели' });
  const closeIcon = closeButton.locator('svg');
  await expect(closeIcon).toBeVisible();
  const closeButtonBox = await closeButton.boundingBox();
  const closeIconBox = await closeIcon.boundingBox();
  expect(closeButtonBox).not.toBeNull();
  expect(closeIconBox).not.toBeNull();
  expect(closeButtonBox!.width).toBeGreaterThanOrEqual(44);
  expect(closeButtonBox!.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(closeButtonBox!.x + closeButtonBox!.width / 2 - (closeIconBox!.x + closeIconBox!.width / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs(closeButtonBox!.y + closeButtonBox!.height / 2 - (closeIconBox!.y + closeIconBox!.height / 2))).toBeLessThanOrEqual(1);

  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  await page.mouse.move(dialogBox!.x + dialogBox!.width / 2, dialogBox!.y + 20);
  await page.mouse.down();
  await page.mouse.move(5, 5);
  await page.mouse.up();

  await expect(dialog).toBeVisible();
  await expect(titleInput).toHaveValue(longGoal);
  await page.getByRole('button', { name: 'Сохранить цель' }).click();

  const summary = page.getByLabel('Текущая цель');
  await expect(summary).toContainText(longGoal);
  await summary.getByRole('button', { name: 'Изменить' }).click();
  await page.locator('.goal-dialog-backdrop').click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeHidden();

  const assertContained = async () => {
    const layout = await summary.evaluate((element) => {
      const title = element.querySelector('.form-card__heading p')!;
      const action = element.querySelector('button')!;
      const summaryBox = element.getBoundingClientRect();
      const titleBox = title.getBoundingClientRect();
      const actionBox = action.getBoundingClientRect();
      return {
        summaryOverflow: element.scrollWidth - element.clientWidth,
        titleOverlapsAction:
          titleBox.left < actionBox.right &&
          titleBox.right > actionBox.left &&
          titleBox.top < actionBox.bottom &&
          titleBox.bottom > actionBox.top,
        titleLeft: titleBox.left - summaryBox.left,
        titleRight: summaryBox.right - titleBox.right,
        actionLeft: actionBox.left - summaryBox.left,
        actionRight: summaryBox.right - actionBox.right,
      };
    });
    expect(layout.summaryOverflow).toBeLessThanOrEqual(1);
    expect(layout.titleOverlapsAction).toBe(false);
    expect(layout.titleLeft).toBeGreaterThanOrEqual(-1);
    expect(layout.titleRight).toBeGreaterThanOrEqual(-1);
    expect(layout.actionLeft).toBeGreaterThanOrEqual(-1);
    expect(layout.actionRight).toBeGreaterThanOrEqual(-1);
  };

  for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await assertContained();
  }

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await assertContained();
});

test('keeps navigation, fixed actions and dialogs inside safe areas and a reduced visual viewport', async ({ page }) => {
  await openDailyEntry(page);
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await emulateSafeViewport(page, { top: 24, right: 18, bottom: 34, left: 18 }, viewport.height);
    await page.evaluate(() => window.scrollTo(0, 0));

    const brandBox = await page.locator('.brand').boundingBox();
    const navigationBox = await page.locator('.bottom-nav').boundingBox();
    expect(brandBox).not.toBeNull();
    expect(navigationBox).not.toBeNull();
    expect(brandBox!.y).toBeGreaterThanOrEqual(24);
    expect(navigationBox!.x).toBeGreaterThanOrEqual(18);
    expect(navigationBox!.x + navigationBox!.width).toBeLessThanOrEqual(viewport.width - 18);
    expect(navigationBox!.y + navigationBox!.height).toBeLessThanOrEqual(viewport.height - 34);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await emulateSafeViewport(page, { top: 24, right: 18, bottom: 34, left: 18 }, 844);
  const navigationBox = await page.locator('.bottom-nav').boundingBox();
  expect(navigationBox).not.toBeNull();

  await page.getByPlaceholder('Например: после прогулки стало легче собраться с мыслями').fill('Проверка safe area');
  const saveBox = await page.locator('.floating-save-button').boundingBox();
  expect(saveBox).not.toBeNull();
  expect(saveBox!.x).toBeGreaterThanOrEqual(18);
  expect(saveBox!.x + saveBox!.width).toBeLessThanOrEqual(390 - 18);
  expect(saveBox!.y + saveBox!.height).toBeLessThan(navigationBox!.y);

  await page.getByRole('button', { name: 'Выбрать цель' }).click();
  await emulateSafeViewport(page, { top: 24, right: 18, bottom: 34, left: 18 }, 520);
  const goalBackdrop = page.locator('.goal-dialog-backdrop');
  const goalDialog = page.getByRole('dialog', { name: 'Над чем вы сейчас работаете' });
  const backdropBox = await goalBackdrop.boundingBox();
  const goalDialogBox = await goalDialog.boundingBox();
  expect(backdropBox).not.toBeNull();
  expect(goalDialogBox).not.toBeNull();
  expect(backdropBox!.height).toBeCloseTo(520, 0);
  expect(goalDialogBox!.y).toBeGreaterThanOrEqual(24);
  expect(goalDialogBox!.y + goalDialogBox!.height).toBeLessThanOrEqual(520);
  expect(await goalDialog.evaluate((dialog) => parseFloat(getComputedStyle(dialog).paddingBottom))).toBeGreaterThanOrEqual(56);
  await expect(page.getByRole('button', { name: 'Закрыть выбор цели' })).toBeVisible();
  await goalDialog.evaluate((dialog) => dialog.scrollTo({ top: dialog.scrollHeight }));
  const goalSaveBox = await page.getByRole('button', { name: 'Сохранить цель' }).boundingBox();
  expect(goalSaveBox).not.toBeNull();
  expect(goalSaveBox!.y + goalSaveBox!.height).toBeLessThanOrEqual(520 - 34);
  await page.getByRole('button', { name: 'Закрыть выбор цели' }).click();

  await page.setViewportSize({ width: 844, height: 390 });
  await emulateSafeViewport(page, { top: 0, right: 44, bottom: 21, left: 44 }, 390);
  await page.locator('.app-header').getByRole('button', { name: 'Как работает приложение' }).click();
  const helpDialog = page.getByRole('dialog', { name: 'Зачем нужна «Траектория»' });
  const helpBox = await helpDialog.boundingBox();
  expect(helpBox).not.toBeNull();
  expect(helpBox!.x).toBeGreaterThanOrEqual(44);
  expect(helpBox!.x + helpBox!.width).toBeLessThanOrEqual(844 - 44);
  expect(helpBox!.y + helpBox!.height).toBeLessThanOrEqual(390 - 21);
  await expect(page.getByRole('button', { name: 'Закрыть объяснение' })).toBeVisible();

  const widths = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
});

test('selects and preserves a past daily entry on mobile', async ({ page }) => {
  await openDailyEntry(page);
  const dateInput = page.getByLabel('Дата записи');
  const today = await dateInput.getAttribute('max');
  expect(today).not.toBeNull();
  await expect(page.locator('.entry-date-control')).toContainText(today!.split('-').reverse().join('.'));
  const dateControlBox = await page.locator('.entry-date-control').boundingBox();
  expect(dateControlBox).not.toBeNull();
  expect(dateControlBox!.width).toBeGreaterThanOrEqual(132);
  const pastDate = new Date(`${today}T12:00:00`);
  pastDate.setDate(pastDate.getDate() - 1);
  const pastDateKey = pastDate.toISOString().slice(0, 10);

  await selectEntryDate(page, pastDateKey);
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeHidden();

  const note = page.getByPlaceholder('Например: после прогулки стало легче собраться с мыслями');
  await note.fill('Запись за выбранную дату');
  await page.locator('.floating-save-button').click();
  await expect(page.getByText('День сохранён на устройстве', { exact: true })).toBeVisible();

  await selectEntryDate(page, today!);
  await expect(note).toHaveValue('');
  await selectEntryDate(page, pastDateKey);
  await expect(note).toHaveValue('Запись за выбранную дату');
});

for (const width of [390, 1440]) {
  test(`completes an experiment early and preserves its observations at ${width}px`, async ({ page }, testInfo) => {
    // Covers creation, a daily observation, completion, reload and a backup round trip.
    test.slow();
    await page.setViewportSize({ width, height: 900 });
    await openDailyEntry(page);
    const today = (await page.getByLabel('Дата записи').getAttribute('max'))!;

    await page.goto('/settings#experiment-settings');
    await page.getByRole('button', { name: 'Эксперимент', exact: true }).click();
    const card = page.locator('.settings-card--experiment');
    await card.getByRole('checkbox', { name: 'Включить эксперимент' }).check();
    await card.getByLabel('Что хотите попробовать').fill('Не читать новости вечером');
    await card.locator('input[type="date"]').nth(0).fill(today);
    await card.locator('input[type="date"]').nth(1).fill(addDays(today, 14));
    await card.getByRole('button', { name: 'Сохранить настройки' }).click();
    await expect(page.getByText('Эксперимент сохранён', { exact: true })).toBeVisible();

    await page.goto('/today');
    await expect(page.getByLabel('Дата записи')).toHaveAttribute('max', today);
    const startToday = page.getByRole('button', { name: 'Начать с сегодняшнего дня' });
    if (await startToday.isVisible()) {
      await startToday.click();
    }
    await openAdditionalBlocks(page);
    await page.locator('#experiment').getByRole('button', { name: 'Да', exact: true }).click();
    await page.getByLabel('Что помогло или помешало?').fill('Стало проще засыпать');
    await page.locator('.floating-save-button').click();
    await expect(page.getByText('День сохранён на устройстве', { exact: true })).toBeVisible();

    await page.goto('/settings#experiment-settings');
    await page.getByRole('button', { name: 'Эксперимент', exact: true }).click();
    await expect(card.getByLabel('Что хотите попробовать')).toHaveAttribute('readonly', '');
    await card.getByLabel('Что вы заметили?').fill('Эксперимент больше не актуален');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const saveBox = await readLayoutBox(card.getByRole('button', { name: 'Сохранить настройки' }), 'Save experiment');
    const completeBox = await readLayoutBox(
      card.getByRole('button', { name: 'Завершить эксперимент', exact: true }),
      'Complete experiment',
    );
    const actionGap = Math.max(completeBox.x - saveBox.x - saveBox.width, completeBox.y - saveBox.y - saveBox.height);
    expect(actionGap, 'Experiment actions stay separated both in a row and when wrapped').toBeGreaterThanOrEqual(12);
    await card.screenshot({ path: testInfo.outputPath('early-completion.png') });
    await card.getByRole('button', { name: 'Завершить эксперимент', exact: true }).click();
    await expect(page.getByText('Эксперимент добавлен в историю', { exact: true })).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Эксперимент', exact: true }).click();
    await expect(card.getByRole('checkbox', { name: 'Включить эксперимент' })).not.toBeChecked();
    await expect(card).toContainText('Завершённые эксперименты можно посмотреть в разделе «История»: 1');
    await page.getByRole('button', { name: 'Данные и синхронизация' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Скачать копию', exact: true }).click();
    const download = await downloadPromise;
    const backupPath = (await download.path())!;
    const backup = JSON.parse(await readFile(backupPath, 'utf8')) as ExportPayload;
    expect(backup.settings.experimentHistory).toHaveLength(1);
    expect(backup.settings.experimentHistory[0]).toMatchObject({
      startDate: today,
      endDate: today,
      conclusion: 'Эксперимент больше не актуален',
    });
    expect(backup.dailyEntries).toEqual([
      expect.objectContaining({
        experimentId: backup.settings.experimentHistory[0]!.id,
        experimentCompleted: true,
        experimentNote: 'Стало проще засыпать',
      }),
    ]);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'early-experiment-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.getByText('Резервная копия восстановлена на этом устройстве', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'История', exact: true }).click();
    const history = page.locator('.history-timeline__item--experiment');
    await expect(history).toContainText('Эксперимент больше не актуален');
    await expect(history).toContainText('Условие выполнено в 1 из 1 отмеченных дней');
  });
}

test('keeps one experiment identity while extending it across weekly slices', async ({ page }) => {
  test.slow();
  await openDailyEntry(page);
  const today = await page.getByLabel('Дата записи').getAttribute('max');
  expect(today).not.toBeNull();
  const currentWeekStart = startOfWeek(today!);
  const previousWeekStart = addDays(currentWeekStart, -7);
  const previousEntryDate = addDays(previousWeekStart, 2);
  const extendedEnd = addDays(today!, 5);

  await page.goto('/settings#experiment-settings');
  await page.getByRole('button', { name: 'Эксперимент', exact: true }).click();
  const settingsCard = page.locator('.settings-card--experiment');
  await settingsCard.getByRole('checkbox', { name: 'Включить эксперимент' }).check();
  await settingsCard.getByLabel('Что хотите попробовать').fill('Начинать важное действие сразу');
  const dates = settingsCard.locator('input[type="date"]');
  await dates.nth(0).fill(previousEntryDate);
  await dates.nth(1).fill(today!);
  await settingsCard.getByRole('button', { name: 'Сохранить настройки' }).click();
  await expect(page.getByText('Эксперимент сохранён', { exact: true })).toBeVisible();

  const saveExperimentDay = async (date: string, answer: 'Да' | 'Нет', note: string) => {
    if (new URL(page.url()).pathname !== '/') {
      await page.goto('/today');
    }
    await selectEntryDate(page, date);
    const startToday = page.getByRole('button', { name: 'Начать с сегодняшнего дня' });
    if (await startToday.isVisible()) {
      await startToday.click();
    }
    await openAdditionalBlocks(page);
    const experimentCard = page.locator('#experiment');
    await expect(experimentCard).toBeVisible();
    await experimentCard.getByRole('button', { name: answer, exact: true }).click();
    await experimentCard.getByLabel('Что помогло или помешало?').fill(note);
    const saveButton = page.locator('.floating-save-button');
    await saveButton.click();
    await expect(page.getByText('День сохранён на устройстве', { exact: true })).toBeVisible();
  };

  await saveExperimentDay(previousEntryDate, 'Нет', 'В прошлой неделе долго готовился');
  await saveExperimentDay(today!, 'Да', 'Сегодня начал сразу');

  await page.goto('/settings#experiment-settings');
  await page.getByRole('button', { name: 'Эксперимент', exact: true }).click();
  const lockedCard = page.locator('.settings-card--experiment');
  await expect(lockedCard.getByLabel('Что хотите попробовать')).toHaveAttribute('readonly', '');
  await expect(lockedCard.locator('input[type="date"]').nth(0)).toBeDisabled();
  await lockedCard.locator('input[type="date"]').nth(1).fill(extendedEnd);
  await lockedCard.getByRole('button', { name: 'Продлить эксперимент' }).click();
  await expect(page.getByText('Эксперимент продлён', { exact: true })).toBeVisible();

  await page.locator('.bottom-nav a[href="/week"]').click();
  await expect(page).toHaveURL(/\/week/);
  const currentCard = page.locator('.experiment-period-card');
  await expect(currentCard).toContainText('Идёт сейчас');
  await expect(currentCard).toContainText('За неделю: получилось · 1');
  await expect(currentCard).toContainText('За весь период: получилось 1, не получилось 1');
  await expect(currentCard).toContainText('Заметки этой недели · 1');

  await page.getByRole('button', { name: 'Предыдущий период' }).click();
  const previousCard = page.locator('.experiment-period-card');
  await expect(previousCard).toContainText('Шёл в эту неделю');
  await expect(previousCard).toContainText('Не получилось · 1');
  await expect(previousCard).toContainText('Заметки этой недели · 1');
});
