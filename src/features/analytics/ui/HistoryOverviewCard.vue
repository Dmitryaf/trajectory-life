<script setup lang="ts">
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import SectionHeading from '@/shared/ui/layout/SectionHeading.vue';
import DataNote from '@/shared/ui/content/DataNote.vue';
import type { ReviewCue } from '@/features/analytics/reviewCues';
import ReviewCueGrid from '@/features/reviews/ui/ReviewCueGrid.vue';

defineProps<{ cues: ReviewCue[]; coveredEntries: number }>();
</script>

<template>
  <SurfaceCard kind="dashboard" class="dashboard-card--insights history-overview-card">
    <SectionHeading>
      <div>
        <h2>Что стоит заметить</h2>
      </div>
    </SectionHeading>

    <ReviewCueGrid :cues="cues" />
    <DataNote class="history-coverage-note"> Дней с записями за период: {{ coveredEntries }}. Пропуски не заполняются. </DataNote>
  </SurfaceCard>
</template>

<style scoped>
.history-overview-card {
  --section-accent: var(--brand-strong);
  position: relative;
  margin-bottom: 16px;
  border-color: var(--line-success);
  background: var(--surface);
}
.history-overview-card > .section-heading {
  padding-bottom: 15px;
  border-bottom: 1px solid var(--review-section-divider);
}
.data-note {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
@media (max-width: 720px) {
  .section-heading:has(.period-actions) {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
