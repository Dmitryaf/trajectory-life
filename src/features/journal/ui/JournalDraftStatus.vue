<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import EditorDraftNotice from '@/features/editor-drafts/EditorDraftNotice.vue';
defineProps<{ notice: string; error: boolean; conflict: boolean; saving: boolean; drafts: { key: string; label: string }[] }>();
defineEmits<{ retry: []; reload: []; replace: []; open: [key: string] }>();
</script>
<template>
  <details v-if="drafts.length" class="journal-drafts">
    <summary>Черновики на этом устройстве ({{ drafts.length }})</summary>
    <div class="journal-drafts__actions">
      <ActionButton v-for="draft in drafts" :key="draft.key" variant="secondary" :disabled="saving" @click="$emit('open', draft.key)">{{
        draft.label
      }}</ActionButton>
    </div>
  </details>
  <EditorDraftNotice :notice="notice" :error="error" @retry="$emit('retry')" />
  <div v-if="conflict" role="status" class="journal-conflict">
    <p>Сохранённая запись изменилась или была удалена. Ваш текст остался в форме.</p>
    <div class="journal-drafts__actions">
      <ActionButton variant="secondary" :disabled="saving" @click="$emit('reload')">Загрузить сохранённую версию</ActionButton>
      <ActionButton variant="secondary" :disabled="saving" @click="$emit('replace')">Сохранить мой вариант</ActionButton>
    </div>
  </div>
</template>
<style scoped>
.journal-drafts {
  margin-block: 12px;
}
.journal-drafts__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-block: 12px;
}
.journal-drafts__actions button {
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
