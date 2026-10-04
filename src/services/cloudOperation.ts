export class CloudOperationCancelledError extends Error {
  constructor() {
    super('Аккаунт изменился. Предыдущая синхронизация остановлена.');
    this.name = 'CloudOperationCancelledError';
  }
}

export type CloudOperationScope = {
  userId: string | undefined;
  assertCurrent: () => void;
};
