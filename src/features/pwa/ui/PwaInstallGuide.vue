<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import DataNote from '@/shared/ui/content/DataNote.vue';
import { computed, ref } from 'vue';
import FormDisclosure from '@/shared/ui/forms/FormDisclosure.vue';
import { initPwaInstallation, promptPwaInstallation, pwaInstalled, pwaInstallPromptAvailable, pwaPlatform } from '../installation';

withDefaults(defineProps<{ open?: boolean }>(), { open: false });

const installStatus = ref('');
const installing = ref(false);
const summary = computed(() => (pwaInstalled.value ? 'Приложение установлено' : 'Установить на телефон'));

initPwaInstallation();

async function install() {
  if (installing.value) {
    return;
  }
  installing.value = true;
  installStatus.value = '';
  try {
    const outcome = await promptPwaInstallation();
    if (outcome === 'accepted') {
      installStatus.value = 'Подтвердите установку в окне браузера.';
    } else if (outcome === 'dismissed') {
      installStatus.value = 'Установка отменена. Позже её можно запустить из меню браузера.';
    } else {
      installStatus.value = 'Откройте меню браузера и выберите установку приложения.';
    }
  } catch {
    installStatus.value = 'Не удалось открыть установку. Используйте команду установки в меню браузера.';
  } finally {
    installing.value = false;
  }
}
</script>

<template>
  <FormDisclosure v-if="pwaPlatform !== 'other'" class="analysis-range" :open="open">
    <template #summary>{{ summary }}</template>
    <div v-if="pwaInstalled" class="cloud-sync-note" role="status">
      <strong>Открыто с домашнего экрана</strong>
      <p>«Траектория» работает в отдельном окне без панели браузера.</p>
    </div>
    <template v-else>
      <p>Установка добавит значок на домашний экран. Сначала откройте приложение онлайн и войдите в аккаунт.</p>
      <ActionButton v-if="pwaInstallPromptAvailable" variant="secondary" type="button" :disabled="installing" @click="install">
        {{ installing ? 'Открываю установку…' : 'Установить через браузер' }}
      </ActionButton>
      <p v-if="installStatus" class="settings-status" role="status">{{ installStatus }}</p>

      <div class="install-platforms">
        <section class="install-platform" :class="{ 'install-platform--current': pwaPlatform === 'android' }">
          <h3>Android</h3>
          <ol>
            <li>Откройте сайт в Chrome.</li>
            <li>В меню браузера выберите «Установить приложение» или «Добавить на главный экран».</li>
            <li>Подтвердите установку.</li>
          </ol>
        </section>

        <section class="install-platform" :class="{ 'install-platform--current': pwaPlatform === 'ios' }">
          <h3>iPhone и iPad</h3>
          <ol>
            <li>Откройте сайт в Safari.</li>
            <li>Нажмите «Поделиться».</li>
            <li>Выберите «На экран Домой» → «Открыть как веб-приложение» → «Добавить».</li>
          </ol>
        </section>
      </div>
    </template>

    <DataNote>
      После первого онлайн-запуска интерфейс и локальные записи могут открываться без сети. Облачная синхронизация требует вернуть сеть и
      снова открыть приложение; фоновая синхронизация не гарантируется.
    </DataNote>
    <DataNote>
      Удаление значка не удаляет аккаунт, облачную копию и данные сайта. При необходимости сначала удалите их в разделе «Аккаунт и
      безопасность».
    </DataNote>
  </FormDisclosure>
</template>

<style scoped>
.install-platforms {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 14px 0;
}
.cloud-sync-note {
  padding: 14px 16px;
  border: 1px solid var(--pwa-guide-info-border);
  border-radius: 15px;
  background: var(--pwa-guide-info-surface);
}
.cloud-sync-note strong {
  color: var(--navy);
}
.cloud-sync-note p {
  margin: 4px 0 0;
  font-size: 13px;
}
.settings-status {
  margin: 12px 0 0;
  color: var(--accent-dark);
  font-size: 13px;
  font-weight: 750;
}
.install-platform {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--pwa-guide-step-border);
  border-radius: 14px;
  background: var(--pwa-guide-step-surface);
}
.install-platform--current {
  border-color: var(--pwa-guide-step-active-border);
  background: var(--pwa-guide-step-active-surface);
}
.install-platform h3 {
  margin-bottom: 9px;
  color: var(--navy);
  font-size: 16px;
}
.install-platform ol {
  margin: 0;
  padding-left: 20px;
  color: var(--pwa-guide-text);
  font-size: 13px;
  line-height: 1.45;
}
.install-platform li + li {
  margin-top: 5px;
}

@media (max-width: 720px) {
  .install-platforms {
    grid-template-columns: 1fr;
  }
}
</style>
