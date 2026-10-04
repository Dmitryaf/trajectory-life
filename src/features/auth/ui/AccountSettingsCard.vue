<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import PasswordField from '@/shared/ui/forms/PasswordField.vue';
import SettingsCard from '@/features/settings/ui/SettingsCard.vue';
import FormCardHeading from '@/shared/ui/forms/FormCardHeading.vue';
import FormFieldLabel from '@/shared/ui/forms/FormFieldLabel.vue';
import { useAccountSettings } from '../useAccountSettings';
import TelemetryConsent from '@/features/telemetry/ui/TelemetryConsent.vue';

defineProps<{
  passwordRecoveryRequested: boolean;
}>();

const emit = defineEmits<{
  localDataReset: [];
}>();

const { auth, changePassword, deleteAccount, newPassword, newPasswordConfirmation, passwordUpdateStatus, session, signOut, userEmail } =
  useAccountSettings(() => emit('localDataReset'));
</script>

<template>
  <SettingsCard class="settings-card--account settings-card--career" tone="career">
    <FormCardHeading icon="account" tone="blue">
      <div>
        <h2>Аккаунт и безопасность</h2>
        <p>Управляйте входом, паролем и удалением аккаунта отдельно от копий данных.</p>
      </div>
    </FormCardHeading>
    <div v-if="!auth.configured" class="cloud-sync-note">
      <strong>Аккаунт недоступен</strong>
      <p>В этой сборке облачный вход не настроен.</p>
    </div>
    <template v-else-if="session">
      <div class="cloud-session">
        <div>
          <strong>{{ userEmail }}</strong>
        </div>
        <ActionButton variant="secondary" class="cloud-session__logout" type="button" :disabled="auth.loading" @click="signOut"
          >Выйти</ActionButton
        >
      </div>
      <details class="account-security" :open="passwordRecoveryRequested">
        <summary>Изменить пароль</summary>
        <div class="settings-field-stack account-security__form">
          <FormFieldLabel for="new-password">Новый пароль</FormFieldLabel>
          <PasswordField
            id="new-password"
            v-model="newPassword"
            autocomplete="new-password"
            minlength="8"
            placeholder="Не меньше 8 символов"
          />
          <FormFieldLabel for="new-password-confirmation">Повтори пароль</FormFieldLabel>
          <PasswordField
            id="new-password-confirmation"
            v-model="newPasswordConfirmation"
            autocomplete="new-password"
            minlength="8"
            placeholder="Повтори пароль"
          />
          <ActionButton variant="secondary" type="button" :disabled="auth.loading || !newPassword" @click="changePassword">
            Сохранить новый пароль
          </ActionButton>
          <p v-if="passwordUpdateStatus" class="settings-status" role="status" aria-live="polite">
            {{ passwordUpdateStatus }}
          </p>
        </div>
      </details>
      <TelemetryConsent />
      <div class="danger-zone">
        <div>
          <strong>Удалить аккаунт</strong>
          <p>Аккаунт, облачная копия и данные на этом устройстве будут удалены.</p>
        </div>
        <ActionButton variant="danger" type="button" :disabled="auth.loading" @click="deleteAccount">Удалить аккаунт</ActionButton>
      </div>
    </template>
    <div v-else class="cloud-sync-note">
      <strong>Сессия не найдена</strong>
      <p>Обновите страницу и войдите снова, чтобы управлять аккаунтом.</p>
    </div>
  </SettingsCard>
</template>

<style scoped>
.settings-field-stack {
  display: grid;
  gap: 8px;
  margin-bottom: 18px;
}
.cloud-session strong {
  color: var(--navy);
}
.cloud-session p {
  margin: 4px 0 0;
  font-size: 13px;
}
.cloud-session {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
  padding: 14px 16px;
  border: 1px solid var(--review-cue-positive-border);
  border-radius: 15px;
  background: var(--review-cue-positive-surface);
}
.cloud-session__logout {
  flex: 0 0 auto;
  min-height: 42px;
  padding: 10px 14px;
}
.account-security__form {
  padding: 2px 14px 14px;
}
.account-security__form .secondary-button {
  width: fit-content;
}
.cloud-sync-note {
  padding: 14px 16px;
  border: 1px solid var(--account-settings-info-border);
  border-radius: 15px;
  background: var(--account-settings-info-surface);
}
.cloud-sync-note strong {
  color: var(--navy);
}
.cloud-sync-note p {
  margin: 4px 0 0;
  font-size: 13px;
}
.account-security {
  margin-top: 12px;
  border: 1px solid var(--line);
  border-radius: 15px;
  background: var(--period-details-surface);
}
.account-security summary {
  cursor: pointer;
  padding: 13px 14px;
  color: var(--form-disclosure-text);
  font-size: 13px;
  font-weight: 800;
}
.settings-status {
  margin: 12px 0 0;
  color: var(--accent-dark);
  font-size: 13px;
  font-weight: 750;
}
.danger-zone {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid var(--account-settings-danger-divider);
}
.danger-zone p {
  margin: 3px 0 0;
  font-size: 12px;
}

@media (max-width: 720px) {
  .cloud-session {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
