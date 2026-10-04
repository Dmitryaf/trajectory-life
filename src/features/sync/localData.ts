const pendingOperations = new WeakMap<object, Promise<unknown>>();

// Keep the database write and its reactive state update in the same ordered operation.
// A cloud merge must read local data only after earlier saves have completed.
export function serializeLocalData<T>(owner: object, assertCurrent: () => void, operation: () => Promise<T>): Promise<T> {
  const previous = pendingOperations.get(owner) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => {
      assertCurrent();
      return operation();
    });
  pendingOperations.set(owner, next);
  return next;
}
