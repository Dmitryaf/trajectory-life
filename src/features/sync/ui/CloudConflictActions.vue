<script setup lang="ts">
import { ref } from 'vue';
import { useAppStore } from '@/stores/app';
import { normalizeSnapshot } from '@/features/backup/snapshot';
import { downloadJson } from '@/features/export/browser';
import { notifyInfo, notifySaved, notifyUnknownError } from '@/services/notifications';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';

const emit = defineEmits<{ resolved: [] }>();
const store = useAppStore();
const resolving = ref(false);

function exportCloudConflictCopy() {
  try {
    const conflict = store.cloudConflictSnapshot;
    if (!conflict) {
      throw new Error('Облачная версия недоступна');
    }
    downloadJson(normalizeSnapshot(conflict.payload), `trajectory-cloud-conflict-${new Date().toISOString().slice(0, 10)}.json`);
    notifyInfo('Скачивание облачной версии начато');
  } catch (error) {
    notifyUnknownError(error, 'Не удалось скачать облачную версию');
  }
}

async function resolveCloudConflict(choice: 'local' | 'cloud') {
  if (resolving.value) {
    return;
  }
  const confirmed = window.confirm(
    choice === 'local'
      ? 'Заменить облачную версию данными этого устройства? Перед выбором можно скачать обе копии.'
      : 'Заменить данные этого устройства облачной версией? Перед выбором можно скачать обе копии.',
  );
  if (!confirmed) {
    return;
  }

  resolving.value = true;
  try {
    const result = await store.resolveCloudConflict(choice);
    if (result.status === 'synced') {
      emit('resolved');
      notifySaved(choice === 'local' ? 'Облачная копия заменена локальной версией' : 'На устройство загружена облачная версия');
    }
  } catch (error) {
    notifyUnknownError(error, 'Не удалось применить выбранную версию');
  } finally {
    resolving.value = false;
  }
}
</script>

<template>
  <p>Перед выбором скачайте локальную копию выше и облачную версию здесь. Содержимое записей никуда не отправляется дополнительно.</p>
  <div class="data-actions">
    <ActionButton variant="secondary" type="button" @click="exportCloudConflictCopy">Скачать облачную версию</ActionButton>
    <ActionButton variant="secondary" type="button" :disabled="resolving" @click="resolveCloudConflict('cloud')">
      Загрузить облачную версию
    </ActionButton>
    <ActionButton variant="primary" type="button" :disabled="resolving" @click="resolveCloudConflict('local')">
      Оставить версию устройства
    </ActionButton>
  </div>
</template>

<style scoped>
p {
  margin: 4px 0 0;
  font-size: 13px;
}
.data-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}
</style>
