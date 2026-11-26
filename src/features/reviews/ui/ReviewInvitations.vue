<script setup lang="ts">
import { RouterLink } from 'vue-router';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
import { useReviewReminders } from '../useReviewReminders';

const context = useReviewReminders();
const reminders = context?.reminders;
</script>

<template>
  <section v-if="reminders?.length" class="review-invitations" aria-label="Доступные обзоры">
    <ul>
      <li v-for="reminder in reminders" :key="reminder.period">
        <RouterLink :to="reminder.to">
          <span>
            <strong>{{ reminder.label }}</strong>
            <small>{{ reminder.dates }}</small>
          </span>
          <UiIcon name="arrow-right" />
        </RouterLink>
        <button
          type="button"
          :aria-label="`Скрыть предложение «${reminder.label}» до следующего периода`"
          @click="context?.dismiss(reminder)"
        >
          Скрыть
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.review-invitations {
  margin-block: 0 14px;
  overflow: hidden;
  border: 1px solid var(--review-nudge-border);
  border-radius: 14px;
  background: var(--review-nudge-surface);
}
.review-invitations ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.review-invitations li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
}
.review-invitations li + li {
  border-top: 1px solid var(--review-nudge-border);
}
.review-invitations a {
  display: grid;
  min-height: 48px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  color: var(--review-nudge-title);
  text-decoration: none;
}
.review-invitations a:hover strong {
  text-decoration: underline;
}
.review-invitations strong,
.review-invitations small {
  display: block;
}
.review-invitations small {
  color: var(--review-nudge-text);
  font-size: 0.8125rem;
}
.review-invitations button {
  min-height: 44px;
  padding-inline: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--review-nudge-text);
  font-size: 0.8125rem;
  text-decoration: underline;
  text-underline-offset: 0.15em;
}
</style>
