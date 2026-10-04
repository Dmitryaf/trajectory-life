<script setup lang="ts">
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import SectionHeading from '@/shared/ui/layout/SectionHeading.vue';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import { RouterLink } from 'vue-router';
import AiAnalysisSteps from '@/features/analysis/ui/AiAnalysisSteps.vue';
import PeriodActions from '@/features/reviews/ui/PeriodActions.vue';
import ReviewCueGrid from '@/features/reviews/ui/ReviewCueGrid.vue';
import type { ReviewCue } from '@/features/analytics/reviewCues';
import ReviewNudge from '@/shared/ui/content/ReviewNudge.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';

withDefaults(
  defineProps<{
    title: string;
    cues: ReviewCue[];
    copying: boolean;
    sectionId?: string;
    content?: 'combined' | 'cues' | 'external';
  }>(),
  { content: 'combined', sectionId: undefined },
);

defineEmits<{
  copy: [];
  download: [];
}>();
</script>

<template>
  <SurfaceCard :id="sectionId" kind="dashboard" class="period-analysis-card">
    <template v-if="content !== 'external'">
      <SectionHeading>
        <div>
          <EyebrowText>Короткий разбор</EyebrowText>
          <h2>{{ title }}</h2>
        </div>
      </SectionHeading>
      <ReviewCueGrid :cues="cues" />
    </template>
    <details v-if="content !== 'cues'" class="period-analysis-card__external">
      <summary>{{ content === 'external' ? title : 'Экспорт для разбора в нейросети' }}</summary>
      <div class="period-analysis-card__external-heading">
        <div>
          <EyebrowText>Внешняя помощь</EyebrowText>
          <h2 v-if="content === 'external'">{{ title }}</h2>
          <h3 v-else>Внешний разбор</h3>
        </div>
        <PeriodActions :copying="copying" @copy="$emit('copy')" @download="$emit('download')" />
      </div>
      <AiAnalysisSteps />
      <ReviewNudge class="range-custom-action period-analysis-card__range">
        <div>
          <strong>Данные для анализа за другие даты</strong>
          <p>Выберите точные даты и подготовьте текст в настройках.</p>
        </div>
        <ActionButton :as="RouterLink" variant="secondary" to="/settings#analysis-settings">Перейти к экспорту</ActionButton>
      </ReviewNudge>
    </details>
  </SurfaceCard>
</template>

<style scoped>
.period-analysis-card {
  position: relative;
  margin-bottom: 16px;
  border-color: var(--line-success);
}
.period-analysis-card > .section-heading {
  padding-bottom: 15px;
  border-bottom: 1px solid var(--review-section-divider);
}
.period-analysis-card__external {
  padding-top: 16px;
  border-top: 1px solid var(--review-section-divider);
}
.period-analysis-card__external:first-child {
  padding-top: 0;
  border-top: 0;
}
.period-analysis-card__external summary {
  color: var(--brand-strong);
  cursor: pointer;
  font-weight: 650;
}
.period-analysis-card__external[open] .period-analysis-card__external-heading {
  margin-top: 16px;
}
.period-analysis-card__external-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.period-analysis-card__external-heading h2,
.period-analysis-card__external-heading h3 {
  margin: 4px 0 0;
}
.period-analysis-card__range {
  margin-top: 16px;
}
@media (max-width: 720px) {
  .period-analysis-card__external-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
