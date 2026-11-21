<script setup lang="ts">
import EditorDraftNotice from '@/features/editor-drafts/EditorDraftNotice.vue';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import ReviewConflictNotice from './ReviewConflictNotice.vue';

defineProps<{
  label: string;
  actions: {
    saving: boolean;
    notice: string;
    draftError: boolean;
    retryDraft: () => Promise<boolean>;
    conflict: boolean;
    save: () => Promise<void>;
    reload: () => void;
    replace: () => Promise<void>;
  };
}>();
</script>

<template>
  <EditorDraftNotice :notice="actions.notice" :error="actions.draftError" @retry="actions.retryDraft" />
  <ReviewConflictNotice v-if="actions.conflict" :saving="actions.saving" @reload="actions.reload" @replace="actions.replace" />
  <ActionButton :disabled="actions.conflict" :busy="actions.saving" busy-label="Сохраняю…" @click="actions.save">
    {{ label }}
  </ActionButton>
</template>
