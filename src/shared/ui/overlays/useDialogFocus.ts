import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialogFocus(active: Ref<boolean>, dialog: Ref<HTMLElement | undefined>, returnFocus?: Ref<HTMLElement | undefined>) {
  let previouslyFocused: HTMLElement | null = null;

  function focusableElements() {
    return dialog.value
      ? [...dialog.value.querySelectorAll<HTMLElement>(focusableSelector)].filter(
          (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true',
        )
      : [];
  }

  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') {
      return;
    }
    const elements = focusableElements();
    if (!elements.length) {
      event.preventDefault();
      dialog.value?.focus();
      return;
    }

    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  const stop = watch(
    active,
    async (open) => {
      if (open) {
        previouslyFocused = returnFocus?.value ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        await nextTick();
        if (!dialog.value?.contains(document.activeElement)) {
          focusableElements()[0]?.focus();
        }
        return;
      }

      const target = previouslyFocused;
      previouslyFocused = null;
      await nextTick();
      if (target?.isConnected) {
        target.focus({ preventScroll: true });
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(stop);

  return { handleDialogKeydown };
}
