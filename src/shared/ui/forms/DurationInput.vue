<script setup lang="ts">
import { ref, watch } from 'vue';
import { combineDuration, splitDuration } from '@/services/duration';

const props = defineProps<{
  id: string;
  modelValue: number | null;
  maxHours: number;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>();
const hours = ref<number | string | null>(null);
const minutes = ref<number | string | null>(null);
let syncing = false;

watch(
  () => props.modelValue,
  (value) => {
    syncing = true;
    const parts = splitDuration(value);
    hours.value = parts.hours;
    minutes.value = parts.minutes;
    syncing = false;
  },
  { immediate: true },
);

watch([hours, minutes], () => {
  if (syncing) {
    return;
  }
  const hourValue = typeof hours.value === 'number' ? hours.value : null;
  const minuteValue = typeof minutes.value === 'number' ? minutes.value : null;
  emit('update:modelValue', combineDuration(hourValue, minuteValue, props.maxHours * 60));
});
</script>

<template>
  <div class="duration-field">
    <label>
      <input
        :id="id"
        v-model.number="hours"
        type="number"
        min="0"
        :max="maxHours"
        step="1"
        inputmode="numeric"
        aria-label="Часы"
        placeholder="7"
      />
      <span>ч</span>
    </label>
    <label>
      <input v-model.number="minutes" type="number" min="0" max="59" step="1" inputmode="numeric" aria-label="Минуты" placeholder="30" />
      <span>мин</span>
    </label>
  </div>
</template>

<style scoped>
.duration-field {
  display: grid;
  width: 185px;
  grid-template-columns: 1fr 1.25fr;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
}
.duration-field label {
  display: flex;
  min-width: 0;
  align-items: center;
}
.duration-field label + label {
  border-left: 1px solid var(--line);
}
.duration-field input {
  width: 100%;
  min-width: 0;
  padding: 10px 3px 10px 12px;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  font-size: 20px;
  font-weight: 750;
}
.duration-field span {
  padding-right: 9px;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .duration-field {
    width: 100%;
    flex-basis: 100%;
  }
}
</style>
