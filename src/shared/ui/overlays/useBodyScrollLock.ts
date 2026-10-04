import { onBeforeUnmount, watch, type Ref } from 'vue';

type BodyStyleSnapshot = Pick<CSSStyleDeclaration, 'position' | 'top' | 'right' | 'left' | 'width' | 'overflow'>;

let lockCount = 0;
let scrollTop = 0;
let bodyStyle: BodyStyleSnapshot | null = null;
let documentOverflow = '';

function lockBody() {
  lockCount += 1;
  if (lockCount > 1) {
    return;
  }

  scrollTop = window.scrollY;
  const { style } = document.body;
  bodyStyle = {
    position: style.position,
    top: style.top,
    right: style.right,
    left: style.left,
    width: style.width,
    overflow: style.overflow,
  };
  documentOverflow = document.documentElement.style.overflow;

  style.position = 'fixed';
  style.top = `-${scrollTop}px`;
  style.right = '0';
  style.left = '0';
  style.width = '100%';
  style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
}

function unlockBody() {
  if (!lockCount) {
    return;
  }
  lockCount -= 1;
  if (lockCount || !bodyStyle) {
    return;
  }

  const { style } = document.body;
  Object.assign(style, bodyStyle);
  document.documentElement.style.overflow = documentOverflow;
  bodyStyle = null;
  window.scrollTo({ top: scrollTop, left: 0, behavior: 'auto' });
}

export function useBodyScrollLock(active: Ref<boolean>) {
  let held = false;

  const stop = watch(
    active,
    (shouldLock) => {
      if (shouldLock && !held) {
        lockBody();
        held = true;
      } else if (!shouldLock && held) {
        unlockBody();
        held = false;
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    stop();
    if (held) {
      unlockBody();
    }
  });
}
