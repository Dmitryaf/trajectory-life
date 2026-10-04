import { expect, type Locator, type Page } from '@playwright/test';

export type LayoutBox = NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>;

export function breakpointProbeWidths(breakpoint: number) {
  return [breakpoint - 1, breakpoint, breakpoint + 1];
}

export function uniqueWidths(...groups: number[][]) {
  return [...new Set(groups.flat())].sort((left, right) => left - right);
}

export async function readLayoutBox(locator: Locator, context: string): Promise<LayoutBox> {
  const box = await locator.boundingBox();
  expect(box, `${context} should have measurable geometry`).not.toBeNull();
  return box!;
}

export async function readDocumentLayoutBox(locator: Locator, context: string): Promise<LayoutBox> {
  const box = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  });
  expect(box.width, `${context} should have measurable width`).toBeGreaterThan(0);
  expect(box.height, `${context} should have measurable height`).toBeGreaterThan(0);
  return box;
}

export function expectBoxInside(inner: LayoutBox, outer: LayoutBox, context: string, tolerance = 0) {
  expect(inner.x, `${context} should stay inside the left edge`).toBeGreaterThanOrEqual(outer.x - tolerance);
  expect(inner.y, `${context} should stay inside the top edge`).toBeGreaterThanOrEqual(outer.y - tolerance);
  expect(inner.x + inner.width, `${context} should stay inside the right edge`).toBeLessThanOrEqual(outer.x + outer.width + tolerance);
  expect(inner.y + inner.height, `${context} should stay inside the bottom edge`).toBeLessThanOrEqual(outer.y + outer.height + tolerance);
}

export function expectHorizontalSeparation(left: LayoutBox, right: LayoutBox, gap: number, context: string) {
  expect(left.x + left.width + gap, `${context} should not overlap horizontally`).toBeLessThanOrEqual(right.x);
}

export function expectVerticalSeparation(upper: LayoutBox, lower: LayoutBox, gap: number, context: string) {
  expect(upper.y + upper.height + gap, `${context} should not overlap vertically`).toBeLessThanOrEqual(lower.y);
}

export function expectSamePosition(before: LayoutBox, after: LayoutBox, context: string, tolerance = 1) {
  expect(Math.abs(after.x - before.x), `${context} should keep its horizontal position`).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(after.y - before.y), `${context} should keep its vertical position`).toBeLessThanOrEqual(tolerance);
}

export async function expectPageFitsViewport(page: Page, context: string, tolerance = 0) {
  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  const offenders =
    layout.content > layout.viewport + tolerance
      ? await page.evaluate(
          (viewport) =>
            [...document.querySelectorAll<HTMLElement>('body *')]
              .map((element) => {
                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                const selector = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${[...element.classList]
                  .slice(0, 3)
                  .map((name) => `.${name}`)
                  .join('')}`;
                return {
                  selector,
                  left: Math.round(rect.left * 10) / 10,
                  right: Math.round(rect.right * 10) / 10,
                  width: Math.round(rect.width * 10) / 10,
                  clientWidth: element.clientWidth,
                  scrollWidth: element.scrollWidth,
                  overflowX: style.overflowX,
                };
              })
              .filter(
                (item) =>
                  item.left < -0.5 ||
                  item.right > viewport + 0.5 ||
                  (item.overflowX === 'visible' && item.scrollWidth > item.clientWidth + 1),
              )
              .slice(0, 12),
          layout.viewport,
        )
      : [];

  expect(layout.content, `${context} should not scroll horizontally; offenders: ${JSON.stringify(offenders)}`).toBeLessThanOrEqual(
    layout.viewport + tolerance,
  );
}

export async function expectBoxInsideViewport(page: Page, locator: Locator, context: string) {
  const viewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, height: window.innerHeight }));
  expectBoxInside(await readLayoutBox(locator, context), { x: 0, y: 0, ...viewport }, context);
}

export async function expectElementHasNoHorizontalOverflow(locator: Locator, context: string, tolerance = 0) {
  const widths = await locator.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(widths.scroll, `${context} should not overflow horizontally`).toBeLessThanOrEqual(widths.client + tolerance);
}

export async function sampleHeights(locator: Locator, duration = 400) {
  return locator.evaluate(
    (element, sampleDuration) =>
      new Promise<number[]>((resolve) => {
        const heights: number[] = [];
        const startedAt = performance.now();
        let animationFrame = 0;
        let finished = false;

        const finish = () => {
          if (finished) {
            return;
          }
          finished = true;
          window.cancelAnimationFrame(animationFrame);
          window.clearTimeout(deadline);
          resolve(heights);
        };

        const deadline = window.setTimeout(finish, sampleDuration + 500);
        const sample = () => {
          if (finished) {
            return;
          }
          heights.push(element.getBoundingClientRect().height);
          if (performance.now() - startedAt >= sampleDuration) {
            finish();
            return;
          }
          animationFrame = requestAnimationFrame(sample);
        };
        sample();
      }),
    duration,
  );
}
