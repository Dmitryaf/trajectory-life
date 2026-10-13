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
  {
    title: 'Записи дня',
    text: 'Сохраните мысль или событие. По желанию отмечайте сон, энергию, активность и условия дня. Состав разделов можно настроить.',
  },
  {
    title: 'Неделя и месяц',
    text: 'Вернитесь к записям, событиям и итогам. Сохранённые выводы недель соберутся в месяце. Обзор можно заполнить и по памяти.',
  },
  { title: 'История изменений', text: 'События, решения и графики за 3–12 месяцев. Можно выбрать период для сравнения.' },
  {
    title: 'Цель и личный эксперимент',
    text: 'Если хотите что-то изменить, выберите цель или попробуйте одно условие в личном эксперименте. Запишите, что заметили. Эти возможности необязательны.',
  },
  { title: 'Журнал', text: 'Храните отдельные итоги, события и мысли. Находите их по словам, датам и категориям.' },
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
          <p class="landing-kicker">Траектория · личный дневник</p>
          <h1 id="landing-title">Из чего складываются ваши дни</h1>
          <p class="landing-hero__lead">
            Сохраняйте события, мысли и итоги. Возвращайтесь к ним в обзорах недели и месяца, чтобы вспомнить важное и увидеть, что
            меняется.
          </p>
          <p class="landing-hero__note">
            Можно начать с одной заметки. Заполнять дневник каждый день, следить за показателями или ставить цель необязательно.
          </p>
          <div class="landing-actions">
            <ActionButton as="a" variant="primary" href="#product">Посмотреть примеры</ActionButton
            ><RouterLink v-if="signupAvailable" :to="signUpLocation">Создать аккаунт</RouterLink
            ><a v-else href="#features">Все возможности</a>
          </div>
        </div>
      </section>
      <section class="landing-section landing-example" aria-labelledby="example-title">
        <div class="landing-section__heading">
          <p class="landing-kicker">Вымышленный пример записей</p>
          <h2 id="example-title">От записи дня к картине месяца</h2>
          <p>Со временем рядом оказываются события и ваши собственные выводы о них.</p>
        </div>
        <ol class="landing-example__steps">
          <li>
            <span class="landing-example__period">День</span>
            <h3>Сохранить момент</h3>
            <blockquote>После работы встретились с друзьями. Давно так спокойно не разговаривали.</blockquote>
            <p>Одна заметка — чтобы потом вспомнить этот вечер.</p>
          </li>
          <li>
            <span class="landing-example__period">Неделя</span>
            <h3>Вернуться к важному</h3>
            <blockquote>Неделя запомнилась спешкой. Но были ещё встреча, прогулка и законченная книга.</blockquote>
            <p>Записи помогают увидеть больше, чем последнее впечатление.</p>
          </li>
          <li>
            <span class="landing-example__period">Месяц</span>
            <h3>Собрать общую картину</h3>
            <blockquote>В нескольких обзорах я вспоминал встречи. Хочу чаще оставлять для них свободный вечер.</blockquote>
            <p>Выводы недель остаются рядом. Решение о следующем шаге — за вами.</p>
          </li>
        </ol>
      </section>
      <section id="product" class="landing-section landing-product" aria-labelledby="product-title">
        <div class="landing-section__heading">
          <h2 id="product-title">Как это выглядит</h2>
          <p>Реальные экраны приложения с вымышленными записями. Переключайте разделы, чтобы рассмотреть каждый.</p>
        </div>
        <LandingGallery />
      </section>
      <section id="features" class="landing-section" aria-labelledby="features-title">
        <div class="landing-section__heading">
          <h2 id="features-title">Что можно делать</h2>
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
            <p>В настройках можно скачать резервную копию, очистить записи или удалить аккаунт.</p>
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
        <RouterLink to="/data-policy">Политика конфиденциальности</RouterLink><RouterLink to="/terms">Условия использования</RouterLink
        ><a href="https://github.com/Dmitryaf/trajectory-life" rel="noreferrer">GitHub</a>
      </div>
    </footer>
  </div>
</template>

<style scoped src="./LandingPage.css"></style>
