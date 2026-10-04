export type SettingsGroup = 'daily' | 'experiment' | 'data' | 'account';

export const settingsGroups: Array<{ id: SettingsGroup; label: string; hash: string }> = [
  { id: 'daily', label: 'Ежедневная запись', hash: 'daily-settings' },
  { id: 'experiment', label: 'Эксперимент', hash: 'experiment-settings' },
  { id: 'data', label: 'Данные и синхронизация', hash: 'data-settings' },
  { id: 'account', label: 'Аккаунт и безопасность', hash: 'account-settings' },
];

const dailySectionHashes = new Set([
  'daily-settings',
  'daily-blocks',
  'movement-options',
  'life-areas',
  'context-options',
  'work-settings',
  'nutrition-settings',
]);
const dataSectionHashes = new Set(['data-settings', 'install-settings', 'backup-settings', 'cloud-settings', 'analysis-settings']);

export function settingsGroupForHash(hash: string): SettingsGroup | null {
  const id = hash.replace(/^#/, '');
  if (dailySectionHashes.has(id)) {
    return 'daily';
  }
  if (id === 'experiment-settings' || id === 'experiment-settings-group') {
    return 'experiment';
  }
  if (dataSectionHashes.has(id)) {
    return 'data';
  }
  return id === 'account-settings' ? 'account' : null;
}
