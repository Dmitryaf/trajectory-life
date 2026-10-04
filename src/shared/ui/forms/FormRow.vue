<template>
  <div class="form-row"><slot /></div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
@media (max-width: 720px) {
  .form-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
</style>
