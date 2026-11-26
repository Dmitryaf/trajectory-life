<script setup lang="ts">
import UiIcon from '@/shared/ui/icons/UiIcon.vue';

defineProps<{ title: string; subtitle?: string; hint?: string; returnLabel?: string }>();
defineEmits<{ previous: []; next: []; current: [] }>();
</script>

<template>
  <div class="period-nav" :class="{ 'period-nav--with-hint': hint }">
    <button class="icon-button" type="button" aria-label="Предыдущий период" @click="$emit('previous')">
      <UiIcon name="arrow-left" />
    </button>
    <button v-if="returnLabel" class="period-nav__label" type="button" @click="$emit('current')">
      <strong>{{ title }}</strong>
      <span>{{ returnLabel }}</span>
    </button>
    <div v-else class="period-nav__label">
      <strong>{{ title }}</strong>
      <span v-if="subtitle">{{ subtitle }}</span>
    </div>
    <button class="icon-button" type="button" aria-label="Следующий период" @click="$emit('next')">
      <UiIcon name="arrow-right" />
    </button>
  </div>
  <p v-if="hint" class="period-nav__hint">{{ hint }}</p>
</template>

<style scoped>
.period-nav {
  display: grid;
  grid-template-columns: 46px 1fr 46px;
  gap: 8px;
  align-items: center;
  max-width: 560px;
  margin: 0 auto 22px;
  padding: 7px;
  border-radius: 20px;
  background: var(--navy);
  box-shadow: 0 14px 32px var(--period-navigator-shadow);
}
.icon-button {
  display: grid;
  place-items: center;
  height: 46px;
  padding: 0;
  border: 0;
  border-radius: 14px;
  background: var(--period-navigator-control-surface);
  color: var(--period-navigator-control-text);
  cursor: pointer;
  font-size: 18px;
  transition:
    background-color 0.15s,
    color 0.15s;
}
.icon-button:hover {
  background: var(--period-navigator-control-hover);
  color: var(--text-inverse);
}
.period-nav__label {
  display: grid;
  align-content: center;
  min-width: 0;
  min-height: 46px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--text-inverse);
  text-align: center;
}
button.period-nav__label {
  cursor: pointer;
}
button.period-nav__label span {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.period-nav__label strong,
.period-nav__label span {
  display: block;
}
.period-nav.period-nav--with-hint {
  margin-bottom: 6px;
}
.period-nav__hint {
  margin: 0 0 16px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}
.period-nav__label strong {
  font-size: 17px;
  text-transform: capitalize;
}
.period-nav__label span {
  margin-top: 3px;
  color: var(--text-inverse-muted);
  font-size: 11px;
}

@media (max-width: 720px) {
  .period-nav {
    grid-template-columns: 42px minmax(0, 1fr) 42px;
    margin-bottom: 16px;
    padding: 6px;
    border-radius: 18px;
  }
  .icon-button,
  .period-nav__label {
    min-height: 42px;
    height: 42px;
  }
  .period-nav__label strong {
    font-size: 16px;
  }
}
</style>
