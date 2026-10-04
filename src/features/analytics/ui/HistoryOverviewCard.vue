<script setup lang="ts">
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import SectionHeading from '@/shared/ui/layout/SectionHeading.vue';
import DataNote from '@/shared/ui/content/DataNote.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
import AiAnalysisSteps from '@/features/analysis/ui/AiAnalysisSteps.vue';
import type { ReviewCue } from '@/features/analytics/reviewCues';
import PeriodActions from '@/features/reviews/ui/PeriodActions.vue';
import ReviewCueGrid from '@/features/reviews/ui/ReviewCueGrid.vue';

defineProps<{ cues: ReviewCue[]; coveredEntries: number; ordinaryEntries: number }>();
defineEmits<{ copy: []; download: [] }>();
</script>

<template>
  <SurfaceCard kind="dashboard" class="dashboard-card--insights history-overview-card">
    <SectionHeading>
      <div>
        <EyebrowText>Главное за период</EyebrowText>
        <h2>Что стоит заметить</h2>
      </div>
    </SectionHeading>

    <ReviewCueGrid :cues="cues" />
    <DataNote class="history-coverage-note">
      Основа разбора: {{ coveredEntries }} дней с записями, {{ ordinaryEntries }} обычных дней с основными полями. Пропуски не заполняются.
    </DataNote>
    <details class="history-external-analysis">
      <summary>Экспорт для разбора в нейросети</summary>
      <AiAnalysisSteps />
      <PeriodActions @copy="$emit('copy')" @download="$emit('download')" />
    </details>
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
.history-overview-card > .ai-analysis-steps {
  margin-bottom: 16px;
}
.history-external-analysis {
  margin-top: 16px;
  border-top: 1px solid var(--line);
  padding-top: 14px;
}
.history-external-analysis summary {
  cursor: pointer;
  color: var(--brand-strong);
  font-weight: 650;
}
.history-external-analysis :deep(.ai-analysis-steps) {
  margin-top: 16px;
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
