<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { pwaPlatform } from '@/features/pwa/installation';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';

const props = defineProps<{
  email: string;
  loading?: boolean;
}>();
const emit = defineEmits<{
  signOut: [];
}>();
const menu = ref<HTMLDetailsElement>();
const initial = computed(() => props.email.trim().slice(0, 1).toLocaleUpperCase('ru-RU') || 'Я');

function close() {
  menu.value?.removeAttribute('open');
}

function dismissWithEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !menu.value?.open) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  close();
  menu.value.querySelector('summary')?.focus();
}

function closeOnOutsidePointer(event: PointerEvent) {
  if (event.target instanceof Node && !menu.value?.contains(event.target)) {
    close();
  }
}

function closeOnFocusLeave(event: FocusEvent) {
  // WebKit can blur to no focus target before clicking a button inside the popup.
  if (event.relatedTarget instanceof Node && !menu.value?.contains(event.relatedTarget)) {
    close();
  }
}

onMounted(() => document.addEventListener('pointerdown', closeOnOutsidePointer));
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOnOutsidePointer));

function signOut() {
  close();
  emit('signOut');
}
</script>

<template>
  <details ref="menu" class="account-menu" @keydown="dismissWithEscape" @focusout="closeOnFocusLeave">
    <summary aria-label="Открыть меню аккаунта">
      <span class="account-menu__avatar" aria-hidden="true">{{ initial }}</span>
      <span class="account-menu__email" :title="email">{{ email }}</span>
      <svg class="account-menu__chevron" aria-hidden="true" viewBox="0 0 16 16" fill="none">
        <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </summary>
    <div class="account-menu__panel">
      <RouterLink to="/settings" class="account-menu__action" @click="close">
        <span><UiIcon name="settings" /></span><strong>Настройки</strong>
      </RouterLink>
      <RouterLink v-if="pwaPlatform !== 'other'" to="/settings#install-settings" class="account-menu__action" @click="close">
        <span><UiIcon name="install" /></span><strong>Установить приложение</strong>
      </RouterLink>
      <button class="account-menu__action account-menu__logout" type="button" :disabled="loading" @click="signOut">
        <span><UiIcon name="sign-out" /></span><strong>Выйти</strong>
      </button>
    </div>
  </details>
</template>

<style scoped>
.account-menu {
  position: relative;
  z-index: 31;
  min-width: 0;
}
.account-menu > summary {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 9px;
  padding: 5px 9px 5px 5px;
  border: 1px solid var(--account-menu-border);
  border-radius: 15px;
  background: var(--account-menu-surface);
  box-shadow: 0 6px 18px var(--account-menu-shadow);
  cursor: pointer;
  list-style: none;
  transition:
    border-color var(--motion-fast),
    background-color var(--motion-fast);
}
.account-menu > summary::-webkit-details-marker {
  display: none;
}
.account-menu > summary:hover,
.account-menu[open] > summary {
  border-color: var(--account-menu-hover-border);
  background: var(--surface);
}
.account-menu__avatar {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  background: var(--account-menu-avatar-surface);
  color: var(--range-tab-active-text);
  font-size: 12px;
  font-weight: 850;
}
.account-menu__email {
  max-width: 180px;
  overflow: hidden;
  color: var(--account-menu-name);
  font-size: 12px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-menu__chevron {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--account-menu-meta);
  transition: transform var(--motion-fast);
}
.account-menu[open] .account-menu__chevron {
  transform: rotate(180deg);
}
.account-menu__panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  display: grid;
  width: 220px;
  gap: 4px;
  padding: 7px;
  border: 1px solid var(--account-menu-border);
  border-radius: 16px;
  background: var(--account-menu-popover-surface);
  box-shadow: 0 18px 44px var(--history-range-shadow);
}
.account-menu__action {
  display: flex;
  width: 100%;
  min-height: 40px;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: var(--form-disclosure-text);
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  text-decoration: none;
}
.account-menu__action:hover,
.account-menu__action.router-link-active {
  background: var(--account-menu-status-surface);
  color: var(--range-tab-active-text);
}
.account-menu__action span {
  width: 18px;
  text-align: center;
}
.account-menu__action strong {
  font-weight: 800;
}
.account-menu__logout {
  color: var(--account-menu-action);
}
.account-menu__logout:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .account-menu__email {
    display: none;
  }
  .account-menu > summary {
    min-height: 38px;
    padding: 3px 7px 3px 3px;
  }
  .account-menu__avatar {
    width: 30px;
    height: 30px;
  }
}

@media (min-width: 980px) {
  .account-menu__email {
    max-width: 145px;
  }
}

@media (min-width: 980px) and (max-width: 1150px) {
  .account-menu__email {
    display: none;
  }
}
</style>
