<script setup lang="ts">
import AutoGrowTextarea from '@/shared/ui/forms/AutoGrowTextarea.vue';
import FormFieldLabel from '@/shared/ui/forms/FormFieldLabel.vue';
import PeriodDetails from './PeriodDetails.vue';

defineProps<{ open: boolean; hasContext: boolean }>();
defineEmits<{ toggle: [event: Event] }>();
const results = defineModel<string[]>('results', { required: true });
const highlights = defineModel<string[]>('highlights', { required: true });
const stateContext = defineModel<string>('stateContext', { required: true });
const support = defineModel<string>('support', { required: true });
const obstacle = defineModel<string>('obstacle', { required: true });
</script>

<template>
  <PeriodDetails
    class="review-context-details"
    :title="hasContext ? 'Дела и события' : 'Добавить дела и события'"
    :open="open"
    @toggle="$emit('toggle', $event)"
  >
    <FormFieldLabel for="week-result-0">До трёх итогов или сделанных дел</FormFieldLabel>
    <input
      v-for="(_, index) in results"
      :id="`week-result-${index}`"
      :key="index"
      v-model="results[index]"
      :aria-label="`Итог недели ${index + 1}`"
      type="text"
      :placeholder="`${index + 1}. Сделанное дело или результат`"
    />
    <FormFieldLabel for="week-highlight-0">До трёх событий, решений или мыслей</FormFieldLabel>
    <input
      v-for="(_, index) in highlights"
      :id="`week-highlight-${index}`"
      :key="`highlight-${index}`"
      v-model="highlights[index]"
      :aria-label="`Событие, решение или мысль ${index + 1}`"
      type="text"
      :placeholder="`${index + 1}. Что важно запомнить`"
    />
    <FormFieldLabel for="week-context">Обстоятельства недели</FormFieldLabel>
    <AutoGrowTextarea id="week-context" v-model="stateContext" :rows="2" placeholder="Что повлияло на эту неделю" />
    <FormFieldLabel for="week-support">Что помогало?</FormFieldLabel
    ><AutoGrowTextarea id="week-support" v-model="support" :rows="2" placeholder="Например: режим или помощь близких" />
    <FormFieldLabel for="week-obstacle">Что мешало?</FormFieldLabel
    ><AutoGrowTextarea id="week-obstacle" v-model="obstacle" :rows="2" placeholder="Например: шум" />
  </PeriodDetails>
</template>

<style scoped>
.review-context-details input,
.review-context-details textarea {
  margin-bottom: 9px;
}
</style>
