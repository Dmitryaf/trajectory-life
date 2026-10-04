<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import { computed, nextTick, ref } from 'vue';
import { RouterLink } from 'vue-router';
import PasswordField from '@/shared/ui/forms/PasswordField.vue';
import UiIcon from '@/shared/ui/icons/UiIcon.vue';
import FormFieldLabel from '@/shared/ui/forms/FormFieldLabel.vue';
import PwaInstallGuide from '@/features/pwa/ui/PwaInstallGuide.vue';
import { useAuthStore } from '@/stores/auth';
import BrandMark from '@/shared/ui/branding/BrandMark.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';

const props = withDefaults(defineProps<{ initialMode?: 'sign-in' | 'sign-up' }>(), { initialMode: 'sign-in' });

const auth = useAuthStore();
const mode = ref<'sign-in' | 'sign-up'>(props.initialMode === 'sign-up' && auth.signupEnabled ? 'sign-up' : 'sign-in');
const email = ref('');
const emailInput = ref<HTMLInputElement | null>(null);
const password = ref('');
const passwordConfirmation = ref('');
const status = ref('');
const confirmationEmail = ref('');
const statusIsError = ref(false);
const submitLabel = computed(() => {
  if (auth.operation === 'signing-up') {
    return 'Создаём аккаунт…';
  }
  if (auth.operation === 'signing-in') {
    return 'Входим…';
  }
  return mode.value === 'sign-up' ? 'Создать аккаунт' : 'Войти';
});

const canSubmit = computed(() => {
  if (email.value.trim().length <= 3 || auth.loading) {
    return false;
  }
  if (mode.value === 'sign-in') {
    return password.value.length >= 6;
  }
  return password.value.length >= 8 && password.value === passwordConfirmation.value;
});

const submitIssue = computed(() => {
  if (email.value.trim().length <= 3) {
    return 'Укажи email.';
  }
  const minimumLength = mode.value === 'sign-up' ? 8 : 6;
  if (password.value.length < minimumLength) {
    return `Пароль должен содержать не меньше ${minimumLength} символов.`;
  }
  if (mode.value === 'sign-up' && password.value !== passwordConfirmation.value) {
    return 'Пароли не совпадают.';
  }
  return '';
});

function selectMode(nextMode: 'sign-in' | 'sign-up') {
  mode.value = nextMode;
  password.value = '';
  passwordConfirmation.value = '';
  status.value = '';
  statusIsError.value = false;
  confirmationEmail.value = '';
  auth.error = '';
  auth.notice = '';
}

async function submit() {
  if (!canSubmit.value) {
    status.value = submitIssue.value;
    statusIsError.value = true;
    return;
  }
  status.value = '';
  statusIsError.value = false;
  try {
    if (mode.value === 'sign-up') {
      const result = await auth.signUp(email.value.trim(), password.value);
      confirmationEmail.value = result.confirmationRequired ? email.value.trim() : '';
      status.value = result.confirmationRequired ? '' : 'Аккаунт создан.';
    } else {
      await auth.signIn(email.value.trim(), password.value);
      status.value = 'Вход выполнен.';
    }
    password.value = '';
    passwordConfirmation.value = '';
  } catch {
    password.value = '';
    passwordConfirmation.value = '';
    status.value = auth.error || 'Действие не выполнено.';
    statusIsError.value = true;
  }
}

async function resendConfirmation() {
  if (!confirmationEmail.value || auth.loading) {
    return;
  }
  status.value = '';
  statusIsError.value = false;
  try {
    await auth.resendSignupConfirmation(confirmationEmail.value);
    status.value = 'Письмо отправлено повторно. Проверь входящие и папку «Спам».';
  } catch {
    status.value = auth.error || 'Действие не выполнено.';
    statusIsError.value = true;
  }
}

async function editConfirmationEmail() {
  confirmationEmail.value = '';
  status.value = '';
  statusIsError.value = false;
  await nextTick();
  emailInput.value?.focus();
}

async function continueToSignIn() {
  selectMode('sign-in');
  await nextTick();
  emailInput.value?.focus();
}

async function requestPasswordReset() {
  if (email.value.trim().length <= 3 || auth.loading) {
    status.value = 'Сначала укажи email.';
    statusIsError.value = true;
    return;
  }
  status.value = '';
  statusIsError.value = false;
  try {
    await auth.requestPasswordReset(email.value.trim());
    status.value = 'Если аккаунт существует, письмо для восстановления отправлено.';
  } catch {
    status.value = auth.error || 'Действие не выполнено.';
    statusIsError.value = true;
  }
}
</script>

<template>
  <section class="auth-shell">
    <article class="auth-card">
      <div class="auth-card__brand">
        <BrandMark />
        <div>
          <EyebrowText tag="p">{{ mode === 'sign-up' ? 'Новый аккаунт' : 'С возвращением' }}</EyebrowText>
          <h2>{{ mode === 'sign-up' ? 'Создайте аккаунт' : 'Войдите в «Траекторию»' }}</h2>
        </div>
      </div>

      <div v-if="auth.signupEnabled && !confirmationEmail" class="auth-mode" aria-label="Выбор действия">
        <button type="button" :class="{ 'is-active': mode === 'sign-in' }" @click="selectMode('sign-in')">Войти</button>
        <button type="button" :class="{ 'is-active': mode === 'sign-up' }" @click="selectMode('sign-up')">Создать аккаунт</button>
      </div>

      <section v-if="confirmationEmail" class="auth-confirmation" aria-labelledby="auth-confirmation-title" aria-live="polite">
        <div class="auth-confirmation__mark"><UiIcon name="result" /></div>
        <h3 id="auth-confirmation-title">Аккаунт создан</h3>
        <p>
          Мы отправили письмо на <strong>{{ confirmationEmail }}</strong
          >.
        </p>
        <ol>
          <li>Открой письмо от «Траектории».</li>
          <li>Подтверди email по ссылке.</li>
          <li>Вернись сюда и войди в аккаунт.</li>
        </ol>
        <p class="auth-confirmation__note">Если письма нет, проверь папку «Спам» или отправь его ещё раз.</p>
        <div class="auth-confirmation__actions">
          <ActionButton variant="primary" type="button" :disabled="auth.loading" @click="continueToSignIn">Перейти ко входу</ActionButton>
          <ActionButton
            variant="secondary"
            type="button"
            :disabled="auth.loading"
            :busy="auth.operation === 'resending-confirmation'"
            busy-label="Отправляем письмо…"
            @click="resendConfirmation"
            >Отправить письмо ещё раз</ActionButton
          >
          <button class="auth-reset" type="button" :disabled="auth.loading" @click="editConfirmationEmail">Изменить email</button>
        </div>
      </section>

      <form v-else class="auth-form" :aria-busy="auth.loading" @submit.prevent="submit">
        <p v-if="mode === 'sign-up'" id="signup-account-hint" class="auth-form__intro">
          Будет создан аккаунт для облачной синхронизации записей. После регистрации нужно подтвердить email по ссылке из письма.
        </p>
        <label class="form-control">
          <FormFieldLabel tag="span">Email</FormFieldLabel>
          <input
            ref="emailInput"
            v-model="email"
            type="email"
            autocomplete="email"
            inputmode="email"
            required
            placeholder="you@example.com"
            :aria-describedby="mode === 'sign-up' ? 'signup-account-hint' : undefined"
          />
        </label>
        <div class="form-control">
          <FormFieldLabel for="auth-password">Пароль</FormFieldLabel>
          <PasswordField
            id="auth-password"
            v-model="password"
            :autocomplete="mode === 'sign-up' ? 'new-password' : 'current-password'"
            required
            :minlength="mode === 'sign-up' ? 8 : 6"
            :aria-describedby="mode === 'sign-up' ? 'signup-password-hint' : undefined"
            :placeholder="mode === 'sign-up' ? 'Не меньше 8 символов' : 'Пароль'"
          />
          <small v-if="mode === 'sign-up'" id="signup-password-hint" class="auth-field-hint">Не меньше 8 символов.</small>
        </div>
        <template v-if="mode === 'sign-up'">
          <div class="form-control">
            <FormFieldLabel for="auth-password-confirmation">Повтори пароль</FormFieldLabel>
            <PasswordField
              id="auth-password-confirmation"
              v-model="passwordConfirmation"
              autocomplete="new-password"
              required
              minlength="8"
              placeholder="Повтори пароль"
            />
          </div>
        </template>
        <p v-if="mode === 'sign-up'" class="auth-field-hint">
          <RouterLink to="/data-policy" target="_blank" rel="noopener">Как обрабатываются ваши данные</RouterLink>
        </p>
        <ActionButton variant="primary" type="submit" :disabled="auth.loading">
          <span v-if="auth.loading" class="auth-button-spinner" aria-hidden="true"></span>
          {{ submitLabel }}
        </ActionButton>
      </form>
      <button
        v-if="mode === 'sign-in' && !confirmationEmail"
        class="auth-reset"
        type="button"
        :disabled="auth.loading"
        :aria-busy="auth.operation === 'requesting-password-reset'"
        @click="requestPasswordReset"
      >
        Не помню пароль
      </button>
      <p
        v-if="status || auth.error || auth.notice"
        class="settings-status"
        :class="{ 'settings-status--error': statusIsError }"
        :role="statusIsError ? 'alert' : 'status'"
        :aria-live="statusIsError ? 'assertive' : 'polite'"
      >
        {{ status || auth.error || auth.notice }}
      </p>
      <PwaInstallGuide />
    </article>
  </section>
</template>

<style scoped src="./AuthGate.css"></style>
