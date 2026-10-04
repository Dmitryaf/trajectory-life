export function announceCloudSnapshotApplied() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('trajectory:cloud-snapshot-applied'));
  }
}
