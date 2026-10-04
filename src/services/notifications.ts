import { toast } from 'vue-sonner';
import { reportClientError } from './errorMonitoring';

const toastOptions = {
  duration: 2600,
};

export function notifySaved(message = 'Сохранено') {
  toast.success(message, toastOptions);
}

export function notifyInfo(message: string) {
  toast.info(message, toastOptions);
}

export function notifyWarning(message: string) {
  toast.warning(message, toastOptions);
}

export function notifyError(message = 'Действие не выполнено') {
  toast.error(message, { ...toastOptions, duration: 4200 });
}

export function notifyUnknownError(error: unknown, fallback = 'Действие не выполнено') {
  reportClientError('ACTION_FAILED');
  notifyError(error instanceof Error ? error.message : fallback);
}
