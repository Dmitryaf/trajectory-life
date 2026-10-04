/** Cleanup only: legacy local diagnostics are never uploaded or backfilled. */
export function clearFirstUseFunnel(storage?: Pick<Storage, 'removeItem'>) {
  try {
    const target = storage ?? window.localStorage;
    target.removeItem('trajectory:first-use-funnel:v1');
  } catch {
    /* Cleanup must not prevent opening or deleting diary data. */
  }
}
