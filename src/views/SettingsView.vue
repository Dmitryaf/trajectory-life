<script setup lang="ts">
import RangeTabs from '@/shared/ui/navigation/RangeTabs.vue';
import DataNote from '@/shared/ui/content/DataNote.vue';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import AccountSettingsCard from '../features/auth/ui/AccountSettingsCard.vue';
import ExternalAnalysisSettingsCard from '../features/analysis/ui/ExternalAnalysisSettingsCard.vue';
import ExperimentSettingsCard from '../features/experiments/ui/ExperimentSettingsCard.vue';
import ChipGroup from '../shared/ui/forms/ChipGroup.vue';
import FormCardHeading from '../shared/ui/forms/FormCardHeading.vue';
import FormFieldLabel from '../shared/ui/forms/FormFieldLabel.vue';
import PageHeading from '../shared/ui/layout/PageHeading.vue';
import PageShell from '../shared/ui/layout/PageShell.vue';
import EyebrowText from '../shared/ui/typography/EyebrowText.vue';
import IconButton from '../shared/ui/actions/IconActionButton.vue';
import PwaInstallGuide from '../features/pwa/ui/PwaInstallGuide.vue';
import { pwaPlatform } from '../features/pwa/installation';
import { settingsGroupForHash, settingsGroups, type SettingsGroup } from '../features/settings/navigation';
import SettingsCard from '../features/settings/ui/SettingsCard.vue';
import SettingsOptionAction from '../features/settings/ui/SettingsOptionAction.vue';
import { useSettingsForm } from '../features/settings/useSettingsForm';
import CloudSyncSettingsCard from '../features/sync/ui/CloudSyncSettingsCard.vue';
import type { DailyBlockId, LifeAreaId } from '../types';

const settingsGroupStyle = { animation: 'page-in 0.25s ease-out' };
const activeSettingsGroup = ref<SettingsGroup>('daily');
const passwordRecoveryRequested = new URLSearchParams(window.location.search).get('password-recovery') === '1';

function scrollToSettingsHash(): void {
  const id = window.location.hash.replace(/^#/, '');
  if (!id) {
    return;
  }
  void nextTick(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
}

function syncSettingsGroupWithLocation(): void {
  if (passwordRecoveryRequested) {
    activeSettingsGroup.value = 'account';
  } else {
    activeSettingsGroup.value = settingsGroupForHash(window.location.hash) ?? activeSettingsGroup.value;
  }
  scrollToSettingsHash();
}

function selectSettingsGroup(group: (typeof settingsGroups)[number]): void {
  activeSettingsGroup.value = group.id;
  window.history.replaceState(null, '', `#${group.hash}`);
  scrollToSettingsHash();
}

onMounted(() => {
  syncSettingsGroupWithLocation();
  window.addEventListener('hashchange', syncSettingsGroupWithLocation);
});

onBeforeUnmount(() => window.removeEventListener('hashchange', syncSettingsGroupWithLocation));

const {
  dailyBlockOptions,
  store,
  settings,
  importInput,
  newCareerLabel,
  newActivityLabel,
  newLifeAreaLabel,
  newContextFactorLabel,
  allCareerOptions,
  activeActivityOptions,
  hiddenActivityOptions,
  allLifeAreaOptions,
  activeContextFactorOptions,
  hiddenContextFactorOptions,
  storageProtectionTitle,
  storageProtectionText,
  experimentCanConclude,
  experimentIdentityLocked,
  experimentSaveLabel,
  isSaving,
  save,
  saveExperiment,
  completeExperiment,
  addCareerOption,
  addActivityOption,
  removeActivityOption,
  restoreActivityOption,
  removeCareerOption,
  addLifeArea,
  removeLifeArea,
  addContextFactor,
  removeContextFactor,
  restoreContextFactor,
  exportData,
  importData,
  clearAll,
  replaceSettingsFromStore,
} = useSettingsForm();
</script>

<template>
  <PageShell class="page--settings">
    <PageHeading>
      <div>
        <EyebrowText>Настройка приложения</EyebrowText>
        <h1>Настройки</h1>
        <p>Выберите разделы дневника, настройте эксперимент или скачайте копию записей.</p>
      </div>
    </PageHeading>

    <RangeTabs as="nav" aria-label="Разделы настроек">
      <button
        v-for="group in settingsGroups"
        :key="group.id"
        type="button"
        :class="{ active: activeSettingsGroup === group.id }"
        :aria-pressed="activeSettingsGroup === group.id"
        @click="selectSettingsGroup(group)"
      >
        {{ group.label }}
      </button>
    </RangeTabs>

    <section
      v-show="activeSettingsGroup === 'daily'"
      id="daily-settings"
      class="settings-group"
      :style="settingsGroupStyle"
      aria-label="Настройка ежедневной записи"
    >
      <SettingsCard id="daily-blocks" class="settings-card--daily-blocks">
        <FormCardHeading icon="blocks" tone="blue">
          <div>
            <h2>Разделы ежедневной записи</h2>
            <p>Оставьте только то, что хотите видеть каждый день. Прежние записи не пропадут.</p>
          </div>
        </FormCardHeading>
        <ChipGroup v-model="settings.activeDailyBlocks as DailyBlockId[]" :options="dailyBlockOptions" multiple />
        <DataNote v-if="!settings.activeDailyBlocks.length"> Останутся заметка дня, шаги к цели и области жизни. </DataNote>
        <ActionButton
          variant="primary"
          type="button"
          :busy="isSaving('daily-blocks')"
          busy-label="Сохраняю…"
          @click="save('Разделы ежедневной записи сохранены', 'daily-blocks')"
          >Сохранить разделы</ActionButton
        >
      </SettingsCard>

      <SettingsCard id="movement-options" class="settings-card--movement">
        <FormCardHeading icon="activity" tone="green">
          <div>
            <h2>Физическая активность</h2>
            <p>Оставьте предложенные варианты или добавьте свои занятия.</p>
          </div>
        </FormCardHeading>
        <div class="custom-list context-factor-list">
          <div v-for="option in activeActivityOptions" :key="option.id" class="custom-list__item">
            <span
              ><i v-if="option.icon">{{ option.icon }}</i
              >{{ option.label }}</span
            >
            <SettingsOptionAction
              mode="hide"
              :label="option.label"
              :disabled="isSaving('activity')"
              @click="removeActivityOption(option.id)"
            />
          </div>
        </div>
        <div class="custom-options">
          <FormFieldLabel for="new-activity-option">Добавить свой вариант</FormFieldLabel>
          <div class="inline-add">
            <input
              id="new-activity-option"
              v-model="newActivityLabel"
              type="text"
              maxlength="40"
              placeholder="Например: плавание"
              @keyup.enter="addActivityOption"
            />
            <ActionButton
              variant="secondary"
              type="button"
              :disabled="!newActivityLabel.trim() || isSaving('activity')"
              @click="addActivityOption"
            >
              Добавить
            </ActionButton>
          </div>
          <div v-if="hiddenActivityOptions.length" class="hidden-options">
            <FormFieldLabel tag="span">Убраны из ежедневной записи</FormFieldLabel>
            <div class="hidden-options__list">
              <SettingsOptionAction
                v-for="option in hiddenActivityOptions"
                :key="option.id"
                mode="restore"
                :label="option.label"
                :disabled="isSaving('activity')"
                @click="restoreActivityOption(option.id)"
              />
            </div>
          </div>
          <DataNote>Убранные варианты не предлагаются в новых записях. Прежние отметки сохраняются в истории и выгрузке.</DataNote>
        </div>
      </SettingsCard>

      <SettingsCard id="life-areas" class="settings-card--areas" tone="areas">
        <FormCardHeading icon="event" tone="amber">
          <div>
            <h2>Области жизни</h2>
            <p>Выберите важные для вас части жизни или добавьте свою.</p>
          </div>
        </FormCardHeading>
        <ChipGroup v-model="settings.activeLifeAreas as LifeAreaId[]" :options="allLifeAreaOptions" multiple />
        <div class="custom-options">
          <FormFieldLabel for="new-life-area">Своя область</FormFieldLabel>
          <div class="inline-add">
            <input
              id="new-life-area"
              v-model="newLifeAreaLabel"
              type="text"
              maxlength="32"
              placeholder="Учёба"
              @keyup.enter="addLifeArea"
            />
            <ActionButton
              variant="secondary"
              type="button"
              :disabled="!newLifeAreaLabel.trim() || isSaving('life-areas')"
              @click="addLifeArea"
            >
              Добавить
            </ActionButton>
          </div>
          <div v-if="settings.customLifeAreaOptions.some((option) => !option.archived)" class="custom-list">
            <div
              v-for="option in settings.customLifeAreaOptions.filter((item) => !item.archived)"
              :key="option.id"
              class="custom-list__item"
            >
              <span
                ><i>{{ option.icon }}</i
                >{{ option.label }}</span
              >
              <IconButton
                icon="delete"
                danger
                :label="`Скрыть ${option.label}`"
                :disabled="isSaving('life-areas')"
                @click="removeLifeArea(option.id)"
              />
            </div>
          </div>
        </div>
        <ActionButton
          variant="primary"
          type="button"
          :busy="isSaving('life-areas')"
          busy-label="Сохраняю…"
          @click="save('Области сохранены', 'life-areas')"
          >Сохранить области</ActionButton
        >
      </SettingsCard>

      <SettingsCard id="context-options" class="settings-card--context">
        <FormCardHeading icon="context" tone="orange">
          <div>
            <h2>Условия дня</h2>
            <p>Выберите, что хотите отмечать: например, шум, поздний кофе или помощь близких. Можно добавить свои варианты.</p>
          </div>
        </FormCardHeading>
        <div class="custom-list context-factor-list">
          <div v-for="option in activeContextFactorOptions" :key="option.id" class="custom-list__item">
            <span
              ><i v-if="option.icon">{{ option.icon }}</i
              >{{ option.label }}</span
            >
            <SettingsOptionAction
              mode="hide"
              :label="option.label"
              :disabled="isSaving('context')"
              @click="removeContextFactor(option.id)"
            />
          </div>
        </div>
        <div class="custom-options">
          <FormFieldLabel for="new-context-factor">Добавить своё условие</FormFieldLabel>
          <div class="inline-add">
            <input
              id="new-context-factor"
              v-model="newContextFactorLabel"
              type="text"
              maxlength="40"
              placeholder="Например: долгая дорога"
              @keyup.enter="addContextFactor"
            />
            <ActionButton
              variant="secondary"
              type="button"
              :disabled="!newContextFactorLabel.trim() || isSaving('context')"
              @click="addContextFactor"
            >
              Добавить
            </ActionButton>
          </div>
          <div v-if="hiddenContextFactorOptions.length" class="hidden-options">
            <FormFieldLabel tag="span">Убраны из ежедневной записи</FormFieldLabel>
            <div class="hidden-options__list">
              <SettingsOptionAction
                v-for="option in hiddenContextFactorOptions"
                :key="option.id"
                mode="restore"
                :label="option.label"
                :disabled="isSaving('context')"
                @click="restoreContextFactor(option.id)"
              />
            </div>
          </div>
          <DataNote>Минус убирает вариант из ежедневной записи. Прежние отметки остаются в истории, графиках и выгрузке.</DataNote>
        </div>
      </SettingsCard>

      <SettingsCard id="work-settings" class="settings-card--career" tone="career">
        <FormCardHeading icon="goal" tone="blue">
          <div>
            <h2>Варианты для блока «Работа»</h2>
            <p>Оставьте общие варианты или добавьте то, что имеет смысл именно в вашей работе.</p>
          </div>
        </FormCardHeading>
        <FormFieldLabel tag="span">Варианты в ежедневной записи</FormFieldLabel>
        <div class="option-preview">
          <span v-for="option in allCareerOptions" :key="option.id" class="option-pill">
            <i v-if="option.icon">{{ option.icon }}</i
            >{{ option.label }}
          </span>
        </div>
        <div class="custom-options">
          <FormFieldLabel for="new-career-option">Добавить свой вариант</FormFieldLabel>
          <div class="inline-add">
            <input
              id="new-career-option"
              v-model="newCareerLabel"
              type="text"
              maxlength="32"
              placeholder="Например: урок, смена, заказ или собеседование"
              @keyup.enter="addCareerOption"
            />
            <ActionButton
              variant="secondary"
              type="button"
              :disabled="!newCareerLabel.trim() || isSaving('career')"
              @click="addCareerOption"
            >
              Добавить
            </ActionButton>
          </div>
          <div v-if="settings.customCareerOptions.some((option) => !option.archived)" class="custom-list">
            <div v-for="option in settings.customCareerOptions.filter((item) => !item.archived)" :key="option.id" class="custom-list__item">
              <span
                ><i>{{ option.icon }}</i
                >{{ option.label }}</span
              >
              <IconButton
                icon="delete"
                danger
                :label="`Скрыть ${option.label}`"
                :disabled="isSaving('career')"
                @click="removeCareerOption(option.id)"
              />
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard id="nutrition-settings" class="settings-card--nutrition" tone="success">
        <FormCardHeading icon="nutrition" tone="green">
          <div>
            <h2>Критерий питания</h2>
            <p>Заранее запишите, по каким понятным признакам питание подходит вашему плану.</p>
          </div>
        </FormCardHeading>
        <FormFieldLabel for="nutrition-criterion">Что означает «поддержало цель»</FormFieldLabel>
        <textarea
          id="nutrition-criterion"
          v-model="settings.nutritionGoalCriterion"
          rows="3"
          maxlength="280"
          placeholder="Например: ел по плану, был нормальный ужин, не было незапланированных вечерних перекусов"
        ></textarea>
        <ActionButton
          variant="primary"
          type="button"
          :busy="isSaving('nutrition')"
          busy-label="Сохраняю…"
          @click="save('Критерий питания сохранён', 'nutrition')"
          >Сохранить настройки</ActionButton
        >
      </SettingsCard>
    </section>

    <section
      v-show="activeSettingsGroup === 'experiment'"
      id="experiment-settings-group"
      class="settings-group"
      :style="settingsGroupStyle"
      aria-label="Настройка личного эксперимента"
    >
      <ExperimentSettingsCard
        v-model:experiment="settings.experiment"
        :can-conclude="experimentCanConclude"
        :history-count="settings.experimentHistory.length"
        :identity-locked="experimentIdentityLocked"
        :saved-end-date="store.settings.experiment.endDate"
        :save-label="experimentSaveLabel"
        :saving="isSaving('experiment')"
        @complete="completeExperiment"
        @save="saveExperiment"
      />
    </section>

    <section
      v-show="activeSettingsGroup === 'data'"
      id="data-settings"
      class="settings-group"
      :style="settingsGroupStyle"
      aria-label="Данные и синхронизация"
    >
      <SettingsCard v-if="pwaPlatform !== 'other'" id="install-settings" class="settings-card--backup" tone="brand">
        <FormCardHeading icon="install" tone="blue">
          <div>
            <h2>Установка на телефон</h2>
            <p>Добавьте «Траекторию» на домашний экран и открывайте её как отдельное приложение.</p>
          </div>
        </FormCardHeading>
        <PwaInstallGuide open />
      </SettingsCard>

      <SettingsCard id="backup-settings" class="settings-card--backup" tone="brand">
        <FormCardHeading icon="download" tone="blue">
          <div>
            <h2>Копия отдельным файлом</h2>
            <p>Для обычной работы скачивать файл не требуется. Он нужен только как дополнительная личная копия или для переноса данных.</p>
          </div>
        </FormCardHeading>
        <div class="cloud-sync-note" role="status">
          <strong>{{ storageProtectionTitle }}</strong>
          <p>{{ storageProtectionText }}</p>
        </div>
        <div class="data-actions">
          <ActionButton variant="secondary" type="button" @click="exportData">Скачать копию</ActionButton>
          <ActionButton
            variant="secondary"
            type="button"
            :busy="isSaving('import')"
            busy-label="Восстанавливаю…"
            @click="importInput?.click()"
            >Восстановить из копии</ActionButton
          >
          <input
            ref="importInput"
            class="visually-hidden"
            type="file"
            accept="application/json"
            :disabled="isSaving('import')"
            @change="importData"
          />
        </div>
        <div class="danger-zone">
          <div>
            <strong>Удалить все данные</strong>
            <p>Записи, итоги, обзоры и настройки будут очищены.</p>
          </div>
          <ActionButton variant="danger" type="button" :busy="isSaving('clear-data')" busy-label="Удаляю…" @click="clearAll"
            >Удалить</ActionButton
          >
        </div>
      </SettingsCard>

      <CloudSyncSettingsCard @resolved="replaceSettingsFromStore" />

      <ExternalAnalysisSettingsCard />
    </section>

    <section
      v-show="activeSettingsGroup === 'account'"
      id="account-settings"
      class="settings-group"
      :style="settingsGroupStyle"
      aria-label="Аккаунт и безопасность"
    >
      <AccountSettingsCard :password-recovery-requested="passwordRecoveryRequested" @local-data-reset="replaceSettingsFromStore" />
    </section>
  </PageShell>
</template>

<style scoped src="./SettingsView.css"></style>
