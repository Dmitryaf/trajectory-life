export function pageCount(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, totalItems) / pageSize));
}

export function pageItems<T>(items: T[], currentPage: number, pageSize: number): T[] {
  const safePage = Math.max(1, currentPage);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
