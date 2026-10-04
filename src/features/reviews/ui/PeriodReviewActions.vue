<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import ReviewConflictNotice from './ReviewConflictNotice.vue';

defineProps<{
  label: string;
  actions: {
    saving: boolean;
    conflict: boolean;
    save: () => Promise<void>;
    reload: () => void;
    replace: () => Promise<void>;
  };
}>();
</script>

<template>
  <ReviewConflictNotice v-if="actions.conflict" :saving="actions.saving" @reload="actions.reload" @replace="actions.replace" />
  <ActionButton :disabled="actions.conflict" :busy="actions.saving" busy-label="Сохраняю…" @click="actions.save">
    {{ label }}
  </ActionButton>
</template>
