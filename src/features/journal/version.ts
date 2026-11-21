import type { LifeEventRecord, ResultRecord } from '@/types';

export class JournalChangedError extends Error {
  constructor() {
    super('Запись изменилась или была удалена. Ваш текст сохранён в черновике. Выберите версию.');
    this.name = 'JournalChangedError';
  }
}

export function assertJournalVersion<T extends LifeEventRecord | ResultRecord>(current: T | undefined, expected: T | null | undefined) {
  if (expected !== undefined && JSON.stringify(current ?? null) !== JSON.stringify(expected)) {
    throw new JournalChangedError();
  }
}
