export function confirmDataReset(hasCloudSession: boolean): boolean {
  const cloudWarning = hasCloudSession ? ' Приложение также отправит пустую копию в аккаунт. Проверьте её обновление в настройках.' : '';
  return (
    window.confirm(
      `Удалить записи, журнал, обзоры и настройки на этом устройстве?${cloudWarning} Скачанные файлы не удалятся. Перед этим можно скачать резервную копию.`,
    ) && window.confirm('Это действие нельзя отменить. Точно удалить эти данные?')
  );
}
