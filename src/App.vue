<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { RouterView, useRoute } from 'vue-router';

const route = useRoute();
const ProductShell = defineAsyncComponent(() => import('@/features/app-shell/ui/ProductShell.vue'));
const isPublicPage = computed(() => route.meta.publicLanding === true || route.meta.publicPage === true);
</script>

<template>
  <RouterView v-slot="{ Component }">
    <component :is="Component" v-if="isPublicPage" />
    <ProductShell v-else>
      <component :is="Component" />
    </ProductShell>
  </RouterView>
</template>
