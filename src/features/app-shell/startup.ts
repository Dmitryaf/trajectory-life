export async function startApplication(load: () => Promise<void>, timeoutMs = 12_000): Promise<void> {
  const showMessage = (message: string) => {
    const status = document.getElementById('startup-status');
    if (status) {
      status.textContent = message;
    }
  };
  const timer = window.setTimeout(() => {
    showMessage('Загрузка занимает больше времени, чем обычно. Проверьте соединение и обновите страницу.');
  }, timeoutMs);
  try {
    await load();
  } catch {
    showMessage('Не удалось загрузить приложение. Проверьте соединение и попробуйте обновить страницу.');
  } finally {
    window.clearTimeout(timer);
  }
}
