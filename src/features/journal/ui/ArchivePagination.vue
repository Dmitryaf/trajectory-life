<script setup lang="ts">
import { nextTick, ref } from 'vue';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
const props = defineProps<{
  page: number;
  pageCount: number;
  contextLabel: string;
  preserveControlPosition?: boolean;
}>();

const navigation = ref<HTMLElement>();

const emit = defineEmits<{
  'update:page': [value: number];
}>();

async function changePage(nextPage: number) {
  const scrollPosition = { left: window.scrollX, top: window.scrollY };
  const previousTop = navigation.value?.getBoundingClientRect().top ?? 0;
  emit('update:page', Math.min(Math.max(1, nextPage), props.pageCount));
  await nextTick();
  const offset = props.preserveControlPosition ? (navigation.value?.getBoundingClientRect().top ?? previousTop) - previousTop : 0;
  const top = props.preserveControlPosition ? window.scrollY + offset : scrollPosition.top;
  window.scrollTo({ left: scrollPosition.left, top, behavior: 'auto' });
}
</script>

<template>
  <nav v-if="pageCount > 1" ref="navigation" class="archive-pagination" :aria-label="`Страницы ${contextLabel}`">
    <ActionButton variant="secondary" type="button" :disabled="page === 1" @click="changePage(page - 1)">Назад</ActionButton>
    <span>{{ page }} из {{ pageCount }}</span>
    <ActionButton variant="secondary" type="button" :disabled="page === pageCount" @click="changePage(page + 1)">Дальше</ActionButton>
  </nav>
</template>

<style scoped>
.archive-pagination {
  display: grid;
  grid-template-columns: 110px 1fr 110px;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--archive-pagination-divider);
}
.archive-pagination span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 750;
  text-align: center;
}
</style>
