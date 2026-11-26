<script lang="ts">
// Restore the search only when Back returns to the original journal navigation entry.
// Private search text stays in memory and never goes into URLs or browser storage.
let previousSearch: { position: number; owner: string; text: string; category: string; page: number } | undefined;
function takePreviousSearch() {
  const search = previousSearch;
  previousSearch = undefined;
  return search;
}
</script>

<script setup lang="ts">
import { computed, nextTick } from 'vue';
import { RouterLink } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { formatDate } from '@/services/dates';
import PageHeading from '@/shared/ui/layout/PageHeading.vue';
import PageShell from '@/shared/ui/layout/PageShell.vue';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
import { journalFeed, journalTypes } from '../journalFeed';
import { useArchiveList } from '../useArchiveList';
import ArchivePagination from './ArchivePagination.vue';

const store = useAppStore();
const auth = useAuthStore();
const owner = auth.session?.user.id ?? 'local';
const position = window.history.state?.position;
const entries = computed(() => journalFeed(store));
const { filterText, filterCategory, currentPage, pageCount, filteredItems, visibleItems } = useArchiveList(entries, {
  getSearchText: (item) => `${item.title} ${item.text}`,
  getCategory: (item) => item.type,
});
const filtered = computed(() => Boolean(filterText.value.trim() || filterCategory.value !== 'all'));
const saved = takePreviousSearch();
if (saved?.owner === owner && saved.position === position) {
  filterText.value = saved.text;
  filterCategory.value = saved.category;
  void nextTick(() => (currentPage.value = Math.min(saved.page, pageCount.value)));
}

function rememberSearch() {
  if (typeof position === 'number') {
    previousSearch = { owner, position, text: filterText.value, category: filterCategory.value, page: currentPage.value };
  }
}

function excerpt(text: string) {
  const query = filterText.value.trim().toLocaleLowerCase('ru-RU');
  const match = query ? text.toLocaleLowerCase('ru-RU').indexOf(query) : 0;
  const start = Math.max(0, match - 40);
  const end = start + 150;
  return `${start ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}
</script>

<template>
  <PageShell class="page--journal">
    <PageHeading
      ><div><h1>Журнал</h1></div></PageHeading
    >
    <nav class="journal-collections" aria-label="Разделы журнала">
      <RouterLink to="/results" class="more-card"><UiIcon name="result" />Итоги</RouterLink>
      <RouterLink to="/events" class="more-card"><UiIcon name="event" />События и мысли</RouterLink>
      <RouterLink to="/self-reminders"><UiIcon name="note" />Напоминания себе</RouterLink>
    </nav>
    <section class="journal-feed" aria-labelledby="journal-feed-title">
      <h2 id="journal-feed-title">{{ filtered ? 'Найденные записи' : 'Последние записи' }}</h2>
      <div class="journal-filters">
        <label>Поиск по всем записям<input v-model="filterText" type="search" placeholder="Слово или фраза" /></label>
        <label
          >Тип записи<select v-model="filterCategory">
            <option value="all">Все записи</option>
            <option v-for="type in journalTypes" :key="type.id" :value="type.id">{{ type.label }}</option>
          </select></label
        >
      </div>
      <p v-if="filtered" role="status" class="journal-meta">Найдено записей: {{ filteredItems.length }}</p>
      <ul v-if="visibleItems.length">
        <li v-for="item in visibleItems" :key="item.key">
          <RouterLink class="journal-entry-link" :to="item.to" @click="rememberSearch">
            <div>
              <small
                >{{ item.label }} ·
                <time :datetime="item.date">{{ formatDate(item.date, { day: 'numeric', month: 'long', year: 'numeric' }) }}</time></small
              >
              <strong>{{ excerpt(item.title) }}</strong>
              <p v-if="item.text && item.text !== item.title">{{ excerpt(item.text) }}</p>
            </div>
            <UiIcon name="arrow-right" />
          </RouterLink>
        </li>
      </ul>
      <p v-else>
        {{
          filtered ? 'Попробуйте другую фразу или выберите другой тип записи.' : 'Здесь появятся заметки дня, итоги, события и напоминания.'
        }}
      </p>
      <ArchivePagination v-model:page="currentPage" :page-count="pageCount" context-label="журнала" />
    </section>
    <RouterLink to="/settings" class="journal-settings-card"><UiIcon name="settings" />Настройки</RouterLink>
  </PageShell>
</template>

<style scoped src="./JournalHome.css"></style>
