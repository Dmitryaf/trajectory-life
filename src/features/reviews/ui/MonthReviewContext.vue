<script setup lang="ts">
import AutoGrowTextarea from '@/shared/ui/forms/AutoGrowTextarea.vue';
import FormFieldLabel from '@/shared/ui/forms/FormFieldLabel.vue';
import PeriodDetails from './PeriodDetails.vue';

defineProps<{ open: boolean; hasContext: boolean }>();
defineEmits<{ toggle: [event: Event] }>();
const mainPattern = defineModel<string>('mainPattern', { required: true });
const support = defineModel<string>('support', { required: true });
const obstacle = defineModel<string>('obstacle', { required: true });
const courseChange = defineModel<string>('courseChange', { required: true });
</script>

<template>
  <PeriodDetails
    class="month-review-context"
    :title="hasContext ? 'Разбор месяца' : 'Добавить разбор месяца'"
    :open="open"
    @toggle="$emit('toggle', $event)"
  >
    <FormFieldLabel for="month-mainPattern">Что чаще всего повторялось?</FormFieldLabel>
    <AutoGrowTextarea
      id="month-mainPattern"
      v-model="mainPattern"
      :rows="2"
      placeholder="Например: часто гулял по вечерам и легче засыпал"
    />
    <FormFieldLabel for="month-support">Что помогало?</FormFieldLabel>
    <AutoGrowTextarea id="month-support" v-model="support" :rows="2" placeholder="Условия, решения или люди, которые помогали" />
    <FormFieldLabel for="month-obstacle">Что мешало сильнее всего?</FormFieldLabel>
    <AutoGrowTextarea id="month-obstacle" v-model="obstacle" :rows="2" placeholder="Например: частые переработки" />
    <FormFieldLabel for="month-courseChange">После какого события вы заметили изменения?</FormFieldLabel>
    <AutoGrowTextarea
      id="month-courseChange"
      v-model="courseChange"
      :rows="2"
      placeholder="Например: смена работы, поездка или завершение большого дела"
    />
  </PeriodDetails>
</template>

<style scoped>
.month-review-context textarea {
  margin-bottom: 9px;
}
</style>
