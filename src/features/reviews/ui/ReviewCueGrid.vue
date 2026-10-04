<script setup lang="ts">
import type { ReviewCue } from '@/features/analytics/reviewCues';

defineProps<{ cues: ReviewCue[] }>();
</script>

<template>
  <div class="review-cue-grid review-cue-grid--primary">
    <article v-for="cue in cues" :key="cue.id" class="review-cue" :class="`review-cue--${cue.tone}`">
      <strong>{{ cue.title }}</strong>
      <p>{{ cue.text }}</p>
    </article>
  </div>
</template>

<style scoped>
.review-cue-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.review-cue {
  position: relative;
  overflow: hidden;
  padding: 16px 16px 16px 19px;
  border: 1px solid var(--review-cue-border);
  border-radius: 16px;
  background: var(--review-cue-surface);
}
.review-cue::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--review-cue-marker);
}
.review-cue strong {
  display: block;
  margin-bottom: 6px;
  color: var(--review-cue-title);
  font-size: 13px;
}
.review-cue p {
  margin: 0;
  color: var(--review-cue-text);
  font-size: 13px;
  line-height: 1.45;
}
.review-cue--good {
  border-color: var(--review-cue-positive-border);
  background: var(--review-cue-positive-surface);
}
.review-cue--good::before {
  background: var(--review-cue-positive-marker);
}
.review-cue--good strong {
  color: var(--review-cue-positive-text);
}
.review-cue--warning {
  border-color: var(--review-cue-warning-border);
  background: var(--surface-warning);
}
.review-cue--warning::before {
  background: var(--review-cue-warning-marker);
}
.review-cue--warning strong {
  color: var(--review-cue-warning-text);
}
@media (max-width: 720px) {
  .review-cue-grid {
    grid-template-columns: 1fr;
  }
}
</style>
