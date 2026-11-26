import { computed, inject } from 'vue';
import { routeLocationKey } from 'vue-router';
import { validDate } from '@/model/normalization';
import { todayKey } from '@/services/dates';

function dateQueryValue(name: string): string | undefined {
  const value = new URLSearchParams(window.location.search).get(name);
  return validDate(value) || undefined;
}

export function newJournalDate() {
  return (new URLSearchParams(window.location.search).get('create') === '1' && dateQueryValue('date')) || todayKey();
}

export function useArchiveEntryId() {
  const route = inject(routeLocationKey, null);
  return computed(() => (route ? route.query.entry : new URLSearchParams(window.location.search).get('entry')) ?? null);
}

export function archiveRangeFromQuery() {
  return {
    initialDateFrom: dateQueryValue('from'),
    initialDateTo: dateQueryValue('to'),
  };
}
