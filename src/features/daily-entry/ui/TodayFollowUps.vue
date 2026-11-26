<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useAppStore } from '@/stores/app';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';

const props = defineProps<{ today: string }>();
defineEmits<{ reviewGoal: [] }>();
const store = useAppStore();
const goalDue = computed(() => {
  const { activeFocusTitle, focusReviewDate } = store.settings;
  return Boolean(activeFocusTitle.trim() && focusReviewDate && focusReviewDate <= props.today);
});
const experimentDue = computed(() => {
  const { active, endDate } = store.settings.experiment;
  return Boolean(active && endDate && endDate < props.today);
});
</script>

<template>
  <section v-if="goalDue || experimentDue" class="follow-ups" aria-label="Пора пересмотреть">
    <div v-if="goalDue">
      <span>Цель · {{ store.settings.activeFocusTitle }}</span>
      <ActionButton variant="secondary" @click="$emit('reviewGoal')">Пересмотреть цель</ActionButton>
    </div>
    <div v-if="experimentDue">
      <span>Эксперимент · {{ store.settings.experiment.title }}</span>
      <ActionButton :as="RouterLink" variant="secondary" to="/settings#experiment-settings">Подвести итог эксперимента</ActionButton>
    </div>
  </section>
</template>

<style scoped>
.follow-ups {
  grid-column: 1 / -1;
  display: grid;
  gap: 8px;
  min-width: 0;
}
.follow-ups > div {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  overflow-wrap: anywhere;
}
</style>
