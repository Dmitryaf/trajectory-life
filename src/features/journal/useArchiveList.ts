import { computed, ref, watch, type ComputedRef } from 'vue';
import { pageCount as countPages, pageItems } from '@/services/pagination';

interface DatedArchiveItem {
  date: string;
}

interface ArchiveListOptions<T> {
  getSearchText: (item: T) => string;
  getCategory: (item: T) => string;
  pageSize?: number;
  initialDateFrom?: string;
  initialDateTo?: string;
}

export function useArchiveList<T extends DatedArchiveItem>(items: ComputedRef<T[]>, options: ArchiveListOptions<T>) {
  const filterText = ref('');
  const filterCategory = ref('all');
  const dateFrom = ref(options.initialDateFrom ?? '');
  const dateTo = ref(options.initialDateTo ?? '');
  const currentPage = ref(1);
  const pageSize = options.pageSize ?? 8;

  const filteredItems = computed(() => {
    const query = filterText.value.trim().toLocaleLowerCase('ru-RU');

    return items.value.filter(
      (item) =>
        (!query || options.getSearchText(item).toLocaleLowerCase('ru-RU').includes(query)) &&
        (filterCategory.value === 'all' || options.getCategory(item) === filterCategory.value) &&
        (!dateFrom.value || item.date >= dateFrom.value) &&
        (!dateTo.value || item.date <= dateTo.value),
    );
  });
  const pageCount = computed(() => countPages(filteredItems.value.length, pageSize));
  const visibleItems = computed(() => pageItems(filteredItems.value, currentPage.value, pageSize));

  watch([filterText, filterCategory, dateFrom, dateTo], () => {
    currentPage.value = 1;
  });
  watch(pageCount, (count) => {
    currentPage.value = Math.min(currentPage.value, count);
  });

  return {
    filterText,
    filterCategory,
    dateFrom,
    dateTo,
    currentPage,
    filteredItems,
    pageCount,
    visibleItems,
  };
}
