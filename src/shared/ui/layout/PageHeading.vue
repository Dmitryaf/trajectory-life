<template>
  <header class="page-heading"><slot /></header>
</template>

<style scoped>
.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
  margin: 14px 0 30px;
}
.page-heading :deep(p) {
  max-width: 610px;
  margin-bottom: 0;
}
@media (max-width: 720px) {
  .page-heading {
    align-items: flex-start;
    margin: 10px 2px 22px;
  }
}
</style>
