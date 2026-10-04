export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDays(key: string, days: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function addMonths(key: string, months: number): string {
  const date = fromDateKey(key);
  date.setMonth(date.getMonth() + months, 1);
  return toDateKey(date);
}

export function startOfWeek(key: string): string {
  const date = fromDateKey(key);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return toDateKey(date);
}

export function endOfWeek(key: string): string {
  return addDays(startOfWeek(key), 6);
}

export function startOfMonth(key: string): string {
  const date = fromDateKey(key);
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function endOfMonth(key: string): string {
  const date = fromDateKey(key);
  return toDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function monthKey(key: string): string {
  return key.slice(0, 7);
}

export function monthsBetween(start: string, end: string): string[] {
  const result: string[] = [];
  for (let current = startOfMonth(start); current <= startOfMonth(end); current = addMonths(current, 1)) {
    result.push(current);
  }
  return result;
}

export function dateRange(start: string, end: string): string[] {
  const result: string[] = [];
  for (let current = start; current <= end; current = addDays(current, 1)) {
    result.push(current);
  }
  return result;
}

export function formatDate(key: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }): string {
  return new Intl.DateTimeFormat('ru-RU', options).format(fromDateKey(key));
}

export function formatMinutes(value: number | null): string {
  if (value === null) {
    return '—';
  }
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`;
}
