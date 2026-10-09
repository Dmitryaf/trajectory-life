<script setup lang="ts">
import { RouterLink } from 'vue-router';
import BrandMark from '@/shared/ui/branding/BrandMark.vue';
import { LEGAL_DOCUMENT_DATE } from '@/model/legalDocuments';
</script>

<template>
  <div class="data-policy-page">
    <header class="data-policy-header">
      <RouterLink class="data-policy-brand" to="/" aria-label="Траектория — главная страница"
        ><BrandMark /><strong>Траектория</strong></RouterLink
      >
      <RouterLink to="/">← На главную</RouterLink>
    </header>
    <main class="data-policy-content" aria-labelledby="terms-title">
      <h1 id="terms-title">Условия использования</h1>
      <p class="data-policy-date">Редакция от {{ LEGAL_DOCUMENT_DATE }}</p>
      <div class="data-policy-body">
        <p>Траектория — личный дневник для пользователей от 18 лет.</p>
        <h2>Аккаунт</h2>
        <p>При создании аккаунта вы принимаете эти условия.</p>
        <h2>Ваши записи</h2>
        <p>
          Созданные вами записи остаются вашими. Приложение сохраняет и обрабатывает их, чтобы показывать историю, обзоры и синхронизировать
          данные между вашими устройствами.
        </p>
        <p>Не используйте приложение для незаконных действий или попыток получить доступ к чужим аккаунтам.</p>
        <h2>Сохранение и управление данными</h2>
        <p>В настройках можно скачать копию записей, очистить данные или удалить аккаунт.</p>
        <p>Порядок обработки и сроки хранения описаны в <RouterLink to="/data-policy">Политике конфиденциальности</RouterLink>.</p>
        <h2>Внешний анализ</h2>
        <p>
          Вы сами выбираете, какие записи скачать или скопировать и куда их передать. Траектория не отправляет содержимое дневника в
          нейросети автоматически.
        </p>
        <h2>Изменения и связь</h2>
        <p>
          Текущая редакция условий доступна на этой странице. При изменении условий, влияющем на использование аккаунта или обработку
          записей, мы сообщим об этом в приложении.
        </p>
        <p>По вопросам работы приложения можно написать на <a href="mailto:trajectory-life@mail.ru">trajectory-life@mail.ru</a>.</p>
      </div>
    </main>
  </div>
</template>

<style scoped src="./DataPolicy.css"></style>
