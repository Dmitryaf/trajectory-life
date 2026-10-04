import { ref } from 'vue';

export function useDialogBackdropClose(close: () => void) {
  const backdropPointerId = ref<number | null>(null);

  function startBackdropClose(event: PointerEvent) {
    backdropPointerId.value = event.target === event.currentTarget ? event.pointerId : null;
  }

  function finishBackdropClose(event: PointerEvent) {
    const shouldClose = event.target === event.currentTarget && backdropPointerId.value === event.pointerId;
    backdropPointerId.value = null;
    if (shouldClose) {
      close();
    }
  }

  function cancelBackdropClose() {
    backdropPointerId.value = null;
  }

  return { startBackdropClose, finishBackdropClose, cancelBackdropClose };
}
