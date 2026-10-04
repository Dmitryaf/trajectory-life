<script setup lang="ts">
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import { RouterLink } from 'vue-router';
import PageShell from '@/shared/ui/layout/PageShell.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
</script>

<template>
  <PageShell aria-labelledby="not-found-title">
    <SurfaceCard kind="form" class="not-found-card">
      <EyebrowText tag="p">Страница не найдена</EyebrowText>
      <h1 id="not-found-title">Такой страницы нет</h1>
      <p>Возможно, адрес устарел или был скопирован не полностью.</p>
      <ActionButton :as="RouterLink" variant="primary" to="/today">Перейти к «Сегодня»</ActionButton>
    </SurfaceCard>
  </PageShell>
</template>

<style scoped>
.not-found-card {
  max-width: 620px;
  display: grid;
  gap: 14px;
  margin: 48px auto 0;
}
.not-found-card .eyebrow,
.not-found-card h1,
.not-found-card p {
  margin-bottom: 0;
}
.not-found-card .primary-button {
  width: fit-content;
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 4px;
  text-align: center;
}
@media (max-width: 720px) {
  .not-found-card {
    margin-top: 24px;
  }
  .not-found-card .primary-button {
    width: 100%;
  }
}
</style>
