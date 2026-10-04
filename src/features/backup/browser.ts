import { downloadJson } from '@/features/export/browser';
import { normalizeSnapshot } from './snapshot';

export function confirmBackupImport(payload: unknown, fileName: string, hasCloudSession: boolean): boolean {
  normalizeSnapshot(payload);
  const cloudWarning = hasCloudSession
    ? '\nВосстановленные данные также будут отправлены в аккаунт для замены облачной копии. При ошибке обновление может потребовать повторного действия.'
    : '';
  return window.confirm(
    `Заменить текущие записи и настройки данными из файла «${fileName}»?\nТекущие записи, обзоры, журнал и черновики будут заменены, а не объединены с копией.${cloudWarning}\nЕсли нужна текущая версия, нажмите «Отмена» и сначала скачайте резервную копию.`,
  );
}

export function downloadBackup(payload: unknown): void {
  downloadJson(payload, `trajectory-backup-${new Date().toISOString().slice(0, 10)}.json`);
}
