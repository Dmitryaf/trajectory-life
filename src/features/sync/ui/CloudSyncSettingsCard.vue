<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import FormCardHeading from '@/shared/ui/forms/FormCardHeading.vue';
import SettingsCard from '@/features/settings/ui/SettingsCard.vue';
import CloudConflictActions from './CloudConflictActions.vue';

const emit = defineEmits<{ resolved: [] }>();
const store = useAppStore();
const auth = useAuthStore();
const cloudStatusTitle = computed(() => {
  if (store.cloudSyncStatus === 'synced') {
    return 'Облако синхронизировано';
  }
  if (store.cloudSyncStatus === 'syncing') {
    return 'Идёт синхронизация';
  }
  if (store.cloudSyncStatus === 'pending') {
    return 'Есть локальные изменения';
  }
  if (store.cloudSyncStatus === 'conflict') {
    return 'Обнаружены разные версии';
  }
  return 'Статус облака';
});
const cloudStatusText = computed(() => store.cloudSyncMessage || 'Синхронизация готова.');
</script>

<template>
  <SettingsCard id="cloud-settings" class="settings-card--cloud" tone="success">
    <FormCardHeading icon="sync" tone="green">
      <div>
        <h2>Автоматическая облачная копия</h2>
        <p>
          После каждого изменения приложение сохраняет данные на устройстве и обновляет облачную копию. Экспортировать их вручную не нужно.
        </p>
      </div>
    </FormCardHeading>
    <div v-if="!auth.configured" class="cloud-sync-note">
      <strong>Облачная копия недоступна</strong>
      <p>В этой сборке синхронизация не настроена.</p>
    </div>
    <template v-else>
      <div v-if="auth.session" class="cloud-sync-note" :class="`cloud-sync-note--${store.cloudSyncStatus}`">
        <strong>{{ cloudStatusTitle }}</strong>
        <p>{{ cloudStatusText }}</p>
        <p v-if="store.cloudSyncError">Ошибка: {{ store.cloudSyncError }}</p>
        <CloudConflictActions v-if="store.cloudSyncStatus === 'conflict' && store.cloudConflictSnapshot" @resolved="emit('resolved')" />
      </div>
      <div v-else class="cloud-sync-note">
        <strong>Сессия не найдена</strong>
        <p>Обнови страницу и войди снова. До входа приложение не загружает записи.</p>
      </div>
      <p v-if="auth.session" class="muted">Изменения с других устройств появляются автоматически, когда приложение открыто.</p>
    </template>
  </SettingsCard>
</template>

<style scoped>
.cloud-sync-note {
  padding: 14px 16px;
  border: 1px solid var(--account-settings-info-border);
  border-radius: 15px;
  background: var(--account-settings-info-surface);
}
.cloud-sync-note strong {
  color: var(--navy);
}
.cloud-sync-note > p {
  margin: 4px 0 0;
  font-size: 13px;
}
</style>
