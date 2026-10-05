<script setup lang="ts">
import SurfaceCard from '@/shared/ui/layout/SurfaceCard.vue';
import SectionHeading from '@/shared/ui/layout/SectionHeading.vue';
import DataNote from '@/shared/ui/content/DataNote.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';
import { formatDate } from '@/services/dates';
import type { DecisionFollowUp } from '../decisionFollowUp';

defineProps<{ followUp: DecisionFollowUp }>();
</script>

<template>
  <SurfaceCard kind="dashboard" class="decision-follow-up" aria-labelledby="decision-follow-up-title">
    <SectionHeading>
      <div>
        <EyebrowText>Две последовательные недели</EyebrowText>
        <h2 id="decision-follow-up-title">Решение и что было дальше</h2>
      </div>
    </SectionHeading>

    <div class="decision-follow-up__step">
      <span>1</span>
      <div>
        <small>Решение прошлого обзора</small>
        <p v-if="followUp.decision">{{ followUp.decision }}</p>
        <p v-if="followUp.ifThenPlan"><strong>План:</strong> {{ followUp.ifThenPlan }}</p>
      </div>
    </div>

    <div class="decision-follow-up__step">
      <span>2</span>
      <div>
        <small>Что было записано на следующей неделе</small>
        <ul v-if="followUp.facts.length">
          <li v-for="fact in followUp.facts" :key="fact.id">
            <time>{{ formatDate(fact.date, { day: 'numeric', month: 'short' }) }}</time>
            <strong>{{ fact.label }}</strong>
            <p>{{ fact.text }}</p>
          </li>
        </ul>
        <p v-else class="decision-follow-up__missing">Отдельных итогов, событий или важных условий за неделю не сохранено.</p>
        <DataNote
          >Это записи за неделю после вашего решения. По ним нельзя точно сказать, что изменения произошли именно из-за него.</DataNote
        >
      </div>
    </div>

    <div class="decision-follow-up__step decision-follow-up__step--outcome">
      <span>3</span>
      <div>
        <small>Что получилось по вашим словам</small>
        <p>{{ followUp.userOutcome }}</p>
      </div>
    </div>

    <div class="decision-follow-up__step">
      <span>4</span>
      <div>
        <small>Следующее решение</small>
        <p v-if="followUp.nextDecision">{{ followUp.nextDecision }}</p>
        <p v-if="followUp.nextIfThenPlan"><strong>План:</strong> {{ followUp.nextIfThenPlan }}</p>
        <p v-if="!followUp.nextDecision && !followUp.nextIfThenPlan" class="decision-follow-up__missing">
          Следующее решение пока не сохранено.
        </p>
      </div>
    </div>
  </SurfaceCard>
</template>

<style scoped>
.decision-follow-up__step {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
  background: var(--decision-follow-up-surface);
}
.decision-follow-up__step > span {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  background: var(--decision-follow-up-status-surface);
  color: var(--decision-follow-up-status-text);
  font-weight: 850;
}
.decision-follow-up__step p {
  overflow-wrap: anywhere;
}
.decision-follow-up__step li time {
  color: var(--muted);
  font-size: 12px;
}
.decision-follow-up__step--outcome {
  border: 1px solid var(--decision-follow-up-border);
  background: var(--surface-success);
}
.decision-follow-up__missing {
  color: var(--muted);
}
</style>
