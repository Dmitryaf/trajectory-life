<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import today from '../assets/today.webp';
import todayDesktop from '../assets/today-desktop.webp';
import week from '../assets/week.webp';
import weekDesktop from '../assets/week-desktop.webp';
import month from '../assets/month.webp';
import monthDesktop from '../assets/month-desktop.webp';
import history from '../assets/history.webp';
import historyDesktop from '../assets/history-desktop.webp';
import journal from '../assets/journal.webp';
import journalDesktop from '../assets/journal-desktop.webp';
import settings from '../assets/settings.webp';
import settingsDesktop from '../assets/settings-desktop.webp';

const screens = [
  {
    title: 'Сегодня',
    heading: 'Сохраните важное за день',
    text: 'Запишите мысль или событие. При желании добавьте сон, самочувствие и занятия.',
    image: today,
    desktop: todayDesktop,
  },
  {
    title: 'Неделя',
    heading: 'Вернитесь к прошедшей неделе',
    text: 'Посмотрите записи по дням, вспомните сделанное и сохраните свои выводы и планы.',
    image: week,
    desktop: weekDesktop,
  },
  {
    title: 'Месяц',
    heading: 'Соберите месяц в одном обзоре',
    text: 'Сравните недели, найдите важные события и запишите, что хотите продолжить или изменить.',
    image: month,
    desktop: monthDesktop,
  },
  {
    title: 'История',
    heading: 'Проследите изменения со временем',
    text: 'Посмотрите графики за несколько месяцев рядом с событиями и решениями из ваших записей.',
    image: history,
    desktop: historyDesktop,
  },
  {
    title: 'Журнал',
    heading: 'Найдите то, что уже сделали',
    text: 'Сохраняйте отдельные итоги и события. Ищите записи по словам, датам и категориям.',
    image: journal,
    desktop: journalDesktop,
  },
  {
    title: 'Настройки',
    heading: 'Настройте дневник под себя',
    text: 'Выберите нужные разделы, сохраните личную цель и скачайте резервную копию записей.',
    image: settings,
    desktop: settingsDesktop,
  },
];
const selectedScreen = ref(0);
const currentScreen = computed(() => screens[selectedScreen.value]!);

function moveScreen(direction: number) {
  selectedScreen.value = (selectedScreen.value + direction + screens.length) % screens.length;
}

async function selectScreenWithKeyboard(event: KeyboardEvent) {
  const targets: Record<string, number> = {
    ArrowRight: (selectedScreen.value + 1) % screens.length,
    ArrowLeft: (selectedScreen.value + screens.length - 1) % screens.length,
    Home: 0,
    End: screens.length - 1,
  };
  const target = targets[event.key];
  if (target === undefined) {
    return;
  }
  event.preventDefault();
  selectedScreen.value = target;
  await nextTick();
  document.getElementById(`screen-tab-${target}`)?.focus();
}
</script>

<template>
  <div class="landing-gallery">
    <div class="landing-screen-options" role="tablist" aria-label="Примеры экранов">
      <button
        v-for="(screen, index) in screens"
        :id="`screen-tab-${index}`"
        :key="screen.title"
        type="button"
        role="tab"
        :aria-selected="selectedScreen === index"
        :tabindex="selectedScreen === index ? 0 : -1"
        aria-controls="screen-example"
        @click="selectedScreen = index"
        @keydown="selectScreenWithKeyboard"
      >
        {{ screen.title }}
      </button>
    </div>
    <div id="screen-example" role="tabpanel" :aria-labelledby="`screen-tab-${selectedScreen}`" tabindex="0">
      <div class="landing-gallery__caption" aria-live="polite" aria-atomic="true">
        <h3>{{ currentScreen.heading }}</h3>
        <p>{{ currentScreen.text }}</p>
      </div>
      <picture class="landing-gallery__screen">
        <source media="(max-width: 720px)" :srcset="currentScreen.image" width="390" height="844" />
        <img
          :src="currentScreen.desktop"
          :alt="`${currentScreen.title} — экран Траектории с примером заполнения`"
          width="1200"
          height="780"
          loading="lazy"
        />
      </picture>
    </div>
    <div class="landing-gallery__controls">
      <button type="button" aria-label="Предыдущий экран" @click="moveScreen(-1)">← Назад</button>
      <span>{{ selectedScreen + 1 }} / {{ screens.length }}</span>
      <button type="button" aria-label="Следующий экран" @click="moveScreen(1)">Далее →</button>
    </div>
  </div>
</template>

<style scoped src="./LandingGallery.css"></style>
