const dirtyEditors = new Set<string>();
const listeners = new Set<(dirty: boolean) => void>();

export function setSyncEditorDirty(id: string, dirty: boolean) {
  const wasDirty = dirtyEditors.size > 0;
  if (dirty) {
    dirtyEditors.add(id);
  } else {
    dirtyEditors.delete(id);
  }
  const isDirty = dirtyEditors.size > 0;
  if (wasDirty !== isDirty) {
    listeners.forEach((listener) => listener(isDirty));
  }
}

export function hasUnsavedSyncEditors() {
  return dirtyEditors.size > 0;
}

export function onUnsavedSyncEditorsChange(listener: (dirty: boolean) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
