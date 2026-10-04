<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import BrandMark from '@/shared/ui/branding/BrandMark.vue';
import FormFieldLabel from '@/shared/ui/forms/FormFieldLabel.vue';
import PasswordField from '@/shared/ui/forms/PasswordField.vue';
import EyebrowText from '@/shared/ui/typography/EyebrowText.vue';

const auth = useAuthStore();
const router = useRouter();
const password = ref('');
const passwordConfirmation = ref('');
const status = ref('');

const submitIssue = computed(() => {
  if (password.value.length < 8) {
    return 'Пароль должен содержать не меньше 8 символов.';
  }
  if (password.value !== passwordConfirmation.value) {
    return 'Пароли не совпадают.';
  }
  return '';
});

async function savePassword() {
  status.value = submitIssue.value;
  if (status.value) {
    return;
  }

  try {
    await auth.completePasswordRecovery(password.value);
    await router.replace({ path: '/access', query: { mode: 'sign-in' } });
  } catch {
    status.value = auth.error || 'Не удалось изменить пароль.';
  }
}

async function returnToSignIn() {
  try {
    await auth.cancelPasswordRecovery();
    await router.replace({ path: '/access', query: { mode: 'sign-in' } });
  } catch {
    status.value = auth.error || 'Не удалось вернуться ко входу.';
  }
}
</script>

<template>
  <main class="password-reset-shell">
    <article class="password-reset-card">
      <div class="password-reset-card__brand">
        <BrandMark />
        <div><strong>Траектория</strong></div>
      </div>

      <template v-if="auth.session">
        <EyebrowText tag="p">Восстановление доступа</EyebrowText>
        <h1>Новый пароль</h1>
        <p class="password-reset-card__intro">После сохранения войдите в аккаунт с новым паролем.</p>

        <form class="password-reset-form" @submit.prevent="savePassword">
          <div class="form-control">
            <FormFieldLabel for="reset-password">Новый пароль</FormFieldLabel>
            <PasswordField
              id="reset-password"
              v-model="password"
              autocomplete="new-password"
              required
              minlength="8"
              aria-describedby="reset-password-hint"
              placeholder="Не меньше 8 символов"
            />
            <small id="reset-password-hint" class="password-reset-field-hint">Не меньше 8 символов.</small>
          </div>
          <div class="form-control">
            <FormFieldLabel for="reset-password-confirmation">Повторите пароль</FormFieldLabel>
            <PasswordField
              id="reset-password-confirmation"
              v-model="passwordConfirmation"
              autocomplete="new-password"
              required
              minlength="8"
              placeholder="Повторите новый пароль"
            />
          </div>
          <ActionButton variant="primary" type="submit" :disabled="auth.loading" :busy="auth.loading" busy-label="Сохраняю..."
            >Сохранить новый пароль</ActionButton
          >
        </form>
        <p v-if="status || auth.error" class="settings-status" aria-live="polite">{{ status || auth.error }}</p>
      </template>

      <template v-else>
        <EyebrowText tag="p">Восстановление доступа</EyebrowText>
        <h1>Ссылка больше не действует</h1>
        <p class="password-reset-card__intro">Вернитесь ко входу и запросите новое письмо для восстановления.</p>
        <ActionButton variant="primary" type="button" :disabled="auth.loading" @click="returnToSignIn">Вернуться ко входу</ActionButton>
      </template>
      <ActionButton v-if="auth.session" variant="secondary" type="button" :disabled="auth.loading" @click="returnToSignIn"
        >Вернуться ко входу</ActionButton
      >
    </article>
  </main>
</template>

<style scoped src="./PasswordResetScreen.css"></style>
