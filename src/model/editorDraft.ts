// Local editor state only: never part of a backup or a cloud snapshot.
export interface EditorDraft {
  key: string;
  value: string;
  baseline: string;
  updatedAt: string;
}

const tabStorageKey = 'trajectory:editor-tab';
const lockPrefix = 'trajectory:editor-tab:';
let tabId = '';
let tabInitialization: Promise<void> | undefined;

function claimTab(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    void navigator.locks
      .request(lockPrefix + id, { ifAvailable: true }, (lock) => {
        resolve(Boolean(lock));
        if (lock) {
          // Hold the identity until this document closes, including when a tab is duplicated.
          return new Promise<void>(() => {});
        }
      })
      .catch(() => resolve(false));
  });
}

export function initializeEditorDraftTab() {
  tabInitialization ??= (async () => {
    let previous = '';
    try {
      previous = sessionStorage.getItem(tabStorageKey) || (navigator.locks && localStorage.getItem(tabStorageKey)) || '';
    } catch {
      // A browser without writable storage can still use a unique draft key.
    }
    const canReuse = previous && (!navigator.locks || (await claimTab(previous)));
    tabId = canReuse ? previous : makeDraftId();
    if (!canReuse && navigator.locks) {
      await claimTab(tabId);
    }
    try {
      sessionStorage.setItem(tabStorageKey, tabId);
      localStorage.setItem(tabStorageKey, tabId);
    } catch {
      // Draft contents are stored in IndexedDB.
    }
  })();
  return tabInitialization;
}

export function makeDraftId() {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(16).padStart(8, '0')).join('');
}

export function editorDraftKey(logicalKey: string) {
  return tabId ? `${logicalKey}@${tabId}` : logicalKey;
}

export function logicalEditorDraftKey(key: string) {
  return key.split('@')[0]!;
}

export function isOwnEditorDraft(key: string) {
  return key === editorDraftKey(logicalEditorDraftKey(key)) || (tabId !== '' && key.includes(`@${tabId}:`));
}
