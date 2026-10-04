import { nextTick, ref, watch, type Ref } from 'vue';

export function useDailyBlocksDisclosure(validationMessage: Ref<string>) {
  const additionalBlocksOpen = ref(false);

  function syncAdditionalBlocksOpen(event: Event) {
    additionalBlocksOpen.value = (event.currentTarget as HTMLDetailsElement).open;
  }

  watch(validationMessage, async (message) => {
    if (!message.startsWith('Заметка к эксперименту')) {
      return;
    }
    additionalBlocksOpen.value = true;
    await nextTick();
    document.getElementById('experiment-note')?.focus();
  });

  return { additionalBlocksOpen, syncAdditionalBlocksOpen };
}
