// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '../browser';

describe('manual AI text copying', () => {
  afterEach(() => vi.restoreAllMocks());

  it('copies through Clipboard API when it is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    await copyText('Текст для анализа');

    expect(writeText).toHaveBeenCalledWith('Текст для анализа');
  });

  it('reports a clear error when Clipboard API and fallback both reject copying', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) });

    await expect(copyText('Текст для анализа')).rejects.toThrow('Браузер не разрешил скопировать текст');
    expect(document.querySelector('textarea')).toBeNull();
  });
});
