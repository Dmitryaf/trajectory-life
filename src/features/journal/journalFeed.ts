import type { DailyEntry, LifeEventRecord, ResultRecord } from '@/types';
import { selfReminderCategories, type SelfReminder } from '@/model/selfReminder';
import { toDateKey } from '@/services/dates';

export const journalTypes = [
  { id: 'day', label: 'Заметки дня' },
  { id: 'result', label: 'Итоги' },
  { id: 'event', label: 'События и мысли' },
  { id: 'reminder', label: 'Напоминания себе' },
] as const;

type JournalItem = {
  key: string;
  type: (typeof journalTypes)[number]['id'];
  label: string;
  date: string;
  timestamp: string;
  title: string;
  text: string;
  to: string;
};

export function journalFeed(data: {
  dailyEntries: readonly DailyEntry[];
  results: readonly ResultRecord[];
  lifeEvents: readonly LifeEventRecord[];
  selfReminders: readonly SelfReminder[];
}): JournalItem[] {
  const items: JournalItem[] = [];
  for (const entry of data.dailyEntries) {
    if (entry.importantFact.trim()) {
      items.push({
        key: `day:${entry.date}`,
        type: 'day',
        label: 'Заметка дня',
        date: entry.date,
        timestamp: entry.updatedAt,
        title: entry.importantFact,
        text: '',
        to: `/today?date=${entry.date}`,
      });
    }
  }
  for (const [type, records, path, label] of [
    ['result', data.results, '/results', 'Итог'],
    ['event', data.lifeEvents, '/events', 'Событие или мысль'],
  ] as const) {
    for (const record of records) {
      items.push({
        key: `${type}:${record.id ?? record.createdAt}`,
        type,
        label,
        date: record.date,
        timestamp: record.createdAt,
        title: record.title || record.note,
        text: record.note,
        to: record.id === undefined ? `${path}?from=${record.date}&to=${record.date}` : `${path}?entry=${record.id}`,
      });
    }
  }
  for (const reminder of data.selfReminders) {
    items.push({
      key: `reminder:${reminder.id}`,
      type: 'reminder',
      label: selfReminderCategories.find((category) => category.value === reminder.category)!.label,
      date: toDateKey(new Date(reminder.createdAt)),
      timestamp: reminder.createdAt,
      title: reminder.title || reminder.text,
      text: reminder.text,
      to: `/self-reminders?entry=${encodeURIComponent(reminder.id)}`,
    });
  }
  return items.sort(
    (left, right) =>
      right.date.localeCompare(left.date) || right.timestamp.localeCompare(left.timestamp) || left.key.localeCompare(right.key),
  );
}
