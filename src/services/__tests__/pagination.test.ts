import { describe, expect, it } from 'vitest';
import { pageCount, pageItems } from '../pagination';

describe('archive pagination', () => {
  it('keeps long collections on bounded pages', () => {
    const items = Array.from({ length: 21 }, (_, index) => index + 1);
    expect(pageCount(items.length, 8)).toBe(3);
    expect(pageItems(items, 1, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(pageItems(items, 3, 8)).toEqual([17, 18, 19, 20, 21]);
  });

  it('keeps an empty collection on the first page', () => {
    expect(pageCount(0, 8)).toBe(1);
    expect(pageItems([], 1, 8)).toEqual([]);
  });
});
