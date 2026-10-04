import { computed, ref } from 'vue';

type InstallOutcome = 'accepted' | 'dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome }>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;

export const pwaInstalled = ref(false);
export const pwaInstallPromptAvailable = ref(false);
export const pwaPlatform = computed<'ios' | 'android' | 'other'>(() => detectPwaPlatform());

export function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  return window.matchMedia?.('(display-mode: standalone)').matches || Boolean((navigator as NavigatorWithStandalone).standalone);
}

export function detectPwaPlatform(): 'ios' | 'android' | 'other' {
  if (typeof navigator === 'undefined') {
    return 'other';
  }
  const userAgent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent) || (userAgent.includes('macintosh') && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (userAgent.includes('android')) {
    return 'android';
  }
  return 'other';
}

export function initPwaInstallation() {
  if (initialized || typeof window === 'undefined') {
    return;
  }
  initialized = true;
  pwaInstalled.value = detectStandaloneMode();

  window.addEventListener('beforeinstallprompt', (event) => {
    const candidate = event as Partial<BeforeInstallPromptEvent>;
    if (typeof candidate.prompt !== 'function' || !candidate.userChoice) {
      return;
    }
    event.preventDefault();
    deferredPrompt = candidate as BeforeInstallPromptEvent;
    pwaInstallPromptAvailable.value = true;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    pwaInstallPromptAvailable.value = false;
    pwaInstalled.value = true;
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => {
    pwaInstalled.value = detectStandaloneMode();
  });
}

export async function promptPwaInstallation(): Promise<InstallOutcome | 'unavailable'> {
  const prompt = deferredPrompt;
  if (!prompt) {
    return 'unavailable';
  }
  try {
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    return outcome;
  } finally {
    deferredPrompt = null;
    pwaInstallPromptAvailable.value = false;
  }
}
