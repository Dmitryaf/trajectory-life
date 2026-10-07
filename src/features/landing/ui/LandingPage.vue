<script setup lang="ts">
import { RouterLink } from 'vue-router';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import BrandMark from '@/shared/ui/branding/BrandMark.vue';
import LandingGallery from './LandingGallery.vue';

const signupAvailable = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY && import.meta.env.VITE_ENABLE_SIGNUP === 'true',
);
const signInLocation = { path: '/access', query: { mode: 'sign-in' } };
const signUpLocation = { path: '/access', query: { mode: 'sign-up' } };
const features = [
  { title: 'Записи дня', text: 'Заметки, сон, самочувствие, занятия и условия дня. Состав разделов можно настроить.' },
  { title: 'Неделя и месяц', text: 'Записи и итоги за период, ваши выводы и планы. Обзор можно заполнить и по памяти.' },
  { title: 'История изменений', text: 'События, решения и графики за 3–12 месяцев. Можно выбрать период для сравнения.' },
  {
    title: 'Цель и личный эксперимент',
    text: 'Сохраните цель и отмечайте шаги к ней. Можно проверить одно изменение, например прогулку перед сном, и описать свои наблюдения.',
  },
  { title: 'Журнал', text: 'Отдельные итоги, события и мысли. Найдите прежнюю запись по словам, категории или датам.' },
  {
    title: 'Копии и внешний анализ',
    text: 'Скачайте резервную копию или восстановите записи из неё. Для разбора в выбранной нейросети можно отдельно подготовить данные и текст с вопросами.',
  },
];
</script>

<template>
  <div class="landing-page">
    <header class="landing-header">
      <a class="landing-brand" href="#top" aria-label="Траектория — начало страницы"><BrandMark /><strong>Траектория</strong></a>
      <nav class="landing-nav" aria-label="Разделы страницы">
        <a href="#product">Примеры</a><a href="#features">Возможности</a><a href="#privacy">Данные</a>
      </nav>
      <ActionButton :as="RouterLink" variant="secondary" :to="signInLocation">Войти</ActionButton>
    </header>
    <main id="top">
      <section class="landing-hero" aria-labelledby="landing-title">
        <div>
          <p class="landing-kicker">Траектория</p>
          <h1 id="landing-title">Дневник дел, событий и самочувствия</h1>
          <p class="landing-hero__lead">Сохраняйте важное за день и возвращайтесь к нему в обзорах недели и месяца.</p>
          <div class="landing-actions">
            <ActionButton as="a" variant="primary" href="#product">Посмотреть примеры</ActionButton
            ><RouterLink v-if="signupAvailable" :to="signUpLocation">Создать аккаунт</RouterLink
            ><a v-else href="#features">Все возможности</a>
          </div>
        </div>
      </section>
      <section id="product" class="landing-section landing-product" aria-labelledby="product-title">
        <div class="landing-section__heading">
          <h2 id="product-title">Как это выглядит</h2>
          <p>От заметки за день до истории за несколько месяцев — посмотрите, как устроено приложение.</p>
        </div>
        <LandingGallery />
      </section>
      <section id="features" class="landing-section" aria-labelledby="features-title">
        <div class="landing-section__heading">
          <h2 id="features-title">Что можно делать</h2>
          <p>Работает в браузере. Можно добавить на домашний экран телефона.</p>
        </div>
        <div class="landing-features">
          <article v-for="feature in features" :key="feature.title">
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.text }}</p>
          </article>
        </div>
      </section>
      <section id="privacy" class="landing-section landing-privacy" aria-labelledby="privacy-title">
        <div class="landing-section__heading">
          <h2 id="privacy-title">Ваши данные</h2>
          <p>Траектория не публикует ваши записи.</p>
        </div>
        <div class="landing-features">
          <article>
            <h3>Устройство и аккаунт</h3>
            <p>Записи сохраняются в браузере и синхронизируются с облачной копией аккаунта. Состояние синхронизации видно в приложении.</p>
          </article>
          <article>
            <h3>Внешний анализ — по вашему действию</h3>
            <p>
              Траектория сама не отправляет ваши записи в нейросети. Вы выбираете, какие данные скачать или скопировать и куда их
              передавать.
            </p>
          </article>
          <article>
            <h3>Копия и удаление</h3>
            <p>
              В настройках можно скачать резервную копию, очистить записи или удалить аккаунт. Скачанные файлы и недоступные копии на других
              устройствах удаляются отдельно.
            </p>
          </article>
        </div>
      </section>
      <section class="landing-final" aria-label="Доступ к приложению">
        <RouterLink v-if="signupAvailable" :to="signUpLocation">Создать аккаунт</RouterLink
        ><RouterLink :to="signInLocation">Войти в Траекторию</RouterLink>
      </section>
    </main>
    <footer class="landing-footer">
      <strong>Траектория</strong>
      <div>
        <RouterLink to="/data-policy">Политика данных</RouterLink
        ><a href="https://github.com/Dmitryaf/trajectory-life" rel="noreferrer">GitHub</a>
      </div>
    </footer>
  </div>
</template>

<style scoped src="./LandingPage.css"></style>
