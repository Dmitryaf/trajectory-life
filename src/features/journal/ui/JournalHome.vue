<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useAppStore } from '@/stores/app';
import PageHeading from '@/shared/ui/layout/PageHeading.vue';
import PageShell from '@/shared/ui/layout/PageShell.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
import type { UiIconName } from '@/shared/ui/icons/icons';

const store = useAppStore();
const sections = computed<Array<{ to: string; icon: UiIconName; tone: string; count: number; title: string; text: string }>>(() => [
  {
    to: '/results',
    icon: 'result',
    tone: 'mint',
    count: store.results.length,
    title: 'Итоги',
    text: 'Сделанное дело, полученный ответ или другой завершённый результат.',
  },
  {
    to: '/events',
    icon: 'event',
    tone: 'amber',
    count: store.lifeEvents.length,
    title: 'События и наблюдения',
    text: 'Ситуация, важная мысль или деталь, к которой хочется вернуться.',
  },
]);
</script>

<template>
  <PageShell class="page--journal">
    <PageHeading>
      <div>
        <EyebrowText>Важное отдельно</EyebrowText>
        <h1>Журнал</h1>
        <p>Выберите, что хотите сохранить отдельно: завершённый итог или событие и наблюдение.</p>
      </div>
    </PageHeading>
    <div class="more-grid">
      <RouterLink v-for="section in sections" :key="section.to" :to="section.to" class="more-card" :class="`more-card--${section.tone}`">
        <span><UiIcon :name="section.icon" /></span>
        <div>
          <small>{{ section.count }} в журнале</small>
          <h2>{{ section.title }}</h2>
          <p>{{ section.text }}</p>
        </div>
        <i><UiIcon name="arrow-right" /></i>
      </RouterLink>
    </div>
    <RouterLink to="/settings" class="journal-settings-card">
      <span><UiIcon name="settings" /></span>
      <div>
        <small>Управление приложением</small>
        <h2>Настройки</h2>
        <p>Поля ежедневной записи, текущая цель, эксперимент и копии данных.</p>
      </div>
      <i><UiIcon name="arrow-right" /></i>
    </RouterLink>
  </PageShell>
</template>

<style scoped src="./JournalHome.css"></style>
