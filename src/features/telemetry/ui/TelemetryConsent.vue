<script setup lang="ts">
import ActionButton from '@/shared/ui/actions/ActionButton.vue';
import { productTelemetry, telemetryCollectionEnabled, telemetryState } from '../productTelemetry';
import ConsentDetails from './ConsentDetails.vue';
function toggle() {
  if (telemetryState.enabled) {
    void productTelemetry.withdraw();
  } else {
    void productTelemetry.grant();
  }
}
</script>
<template>
  <section
    v-if="telemetryCollectionEnabled || telemetryState.enabled || telemetryState.pendingWithdrawal"
    class="telemetry-consent"
    aria-labelledby="telemetry-settings-title"
  >
    <h3 id="telemetry-settings-title">Статистика использования</h3>
    <p>Необязательные сведения о том, какими разделами пользуются. Содержимое ваших записей не передаётся.</p>
    <button
      type="button"
      role="switch"
      :aria-checked="telemetryState.enabled"
      class="telemetry-consent__switch"
      :disabled="
        !telemetryState.enabled &&
        (telemetryState.busy || telemetryState.pendingWithdrawal || !telemetryState.available || !telemetryCollectionEnabled)
      "
      @click="toggle"
    >
      <span>Помогать улучшать Траекторию</span><span aria-hidden="true">{{ telemetryState.enabled ? 'Вкл' : 'Выкл' }}</span>
    </button>
    <p class="telemetry-consent__status" role="status">
      {{ telemetryState.message || (telemetryState.enabled ? 'Сбор разрешён.' : 'Сбор на этом устройстве выключен.') }}
    </p>
    <ActionButton
      v-if="telemetryState.pendingWithdrawal || !telemetryState.available"
      variant="secondary"
      type="button"
      :disabled="telemetryState.busy"
      @click="productTelemetry.refresh()"
      >{{ telemetryState.pendingWithdrawal ? 'Повторить удаление событий' : 'Проверить состояние согласия' }}</ActionButton
    >
    <ConsentDetails />
  </section>
</template>
<style scoped>
.telemetry-consent {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 15px;
}
h3 {
  margin-top: 0;
}
p {
  font-size: 14px;
  line-height: 1.6;
}
.telemetry-consent__switch {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 64px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.telemetry-consent__switch:disabled {
  cursor: default;
  opacity: 0.65;
}
.telemetry-consent__status {
  min-height: 5lh;
}
</style>
