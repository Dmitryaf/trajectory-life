// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startApplication } from '../startup';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('startup recovery', () => {
  it('keeps a retryable message when loading the application fails', async () => {
    document.body.innerHTML = '<p id="startup-status">Загружаем приложение</p><a href="">Обновить страницу</a>';
    await startApplication(() => Promise.reject(new Error('Chunk unavailable')));
    expect(document.getElementById('startup-status')?.textContent).toContain('Не удалось загрузить приложение');
    expect(document.querySelector('a')?.getAttribute('href')).toBe('');
  });

  it('bounds silent loading while still allowing a late successful mount', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<p id="startup-status">Загружаем приложение</p>';
    let finish!: () => void;
    const pending = startApplication(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      100,
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(document.getElementById('startup-status')?.textContent).toContain('Загрузка занимает больше времени');
    document.body.innerHTML = '<main>Дневник</main>';
    finish();
    await pending;
    expect(document.body.textContent).toBe('Дневник');
    expect(vi.getTimerCount()).toBe(0);
  });
});
