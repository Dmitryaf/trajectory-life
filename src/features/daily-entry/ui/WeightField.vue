<script setup lang="ts">
import FormFieldLabel from '@/shared/ui/forms/FormFieldLabel.vue';

const model = defineModel<string>({ required: true });
</script>

<template>
  <div>
    <FormFieldLabel for="weight-kg">Вес</FormFieldLabel>
    <div class="number-field">
      <input id="weight-kg" v-model="model" type="text" inputmode="decimal" autocomplete="off" placeholder="82.4" />
      <span>кг</span>
    </div>
  </div>
</template>

<style scoped>
.number-field {
  width: 185px;
  display: flex;
  align-items: center;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
}

.number-field:focus-within {
  border-color: var(--field-focus-border);
  box-shadow: 0 0 0 4px var(--field-focus-ring);
}

.number-field:has(input:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.number-field input {
  padding: 10px 4px 10px 14px;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  font-size: 22px;
  font-weight: 750;
}

.number-field input:focus {
  outline: none;
  box-shadow: none;
}

.number-field span {
  padding-right: 14px;
  color: var(--muted);
  font-size: 13px;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .number-field {
    width: 100%;
    flex-basis: 100%;
  }
}
</style>
