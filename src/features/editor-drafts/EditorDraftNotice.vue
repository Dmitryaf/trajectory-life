<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
defineProps<{ notice: string; error: boolean }>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <div v-if="notice" class="editor-draft-notice" role="status">
    <p>{{ notice }}</p>
    <ActionButton v-if="error" variant="secondary" @click="$emit('retry')">Повторить сохранение черновика</ActionButton>
  </div>
</template>
<style scoped>
.editor-draft-notice {
  margin-block: 12px;
  color: var(--muted);
  font-size: 14px;
}
</style>
