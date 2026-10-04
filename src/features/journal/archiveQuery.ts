function dateQueryValue(name: string): string | undefined {
  const value = new URLSearchParams(window.location.search).get(name);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export function archiveRangeFromQuery() {
  return {
    initialDateFrom: dateQueryValue('from'),
    initialDateTo: dateQueryValue('to'),
  };
}
