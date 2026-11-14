<script setup lang="ts">
import { RouterLink } from 'vue-router';
import PeriodEmptyGuide from '@/shared/ui/content/PeriodEmptyGuide.vue';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
defineProps<{ period: 'week' | 'month'; available: boolean }>();
</script>
<template>
  <PeriodEmptyGuide>
    <strong>{{ period === 'week' ? 'За эту неделю пока нет записей' : 'За этот месяц пока нет записей' }}</strong>
    <p>Здесь соберутся дневные записи, итоги и события из Журнала.</p>
    <p v-if="available">Можно записать обзор по памяти — ежедневные записи для этого не нужны.</p>
    <ActionButton :as="RouterLink" variant="secondary" to="/today">Перейти к записи за день</ActionButton>
  </PeriodEmptyGuide>
</template>
