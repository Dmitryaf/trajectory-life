// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TelemetryConsent from '../ui/TelemetryConsent.vue';
import { productTelemetry, telemetryState } from '../productTelemetry';

vi.mock('../productTelemetry', async () => {
  const { reactive } = await import('vue');
  return {
    telemetryCollectionEnabled: true,
    telemetryState: reactive({ enabled: true, available: true, busy: true, pendingWithdrawal: false, message: '' }),
    productTelemetry: { withdraw: vi.fn(), grant: vi.fn(), refresh: vi.fn() },
  };
});
describe('consent withdrawal control', () => {
  it('allows local withdrawal while the server status check is still pending', async () => {
    const wrapper = mount(TelemetryConsent);
    const button = wrapper.get('[role=switch]');
    expect(button.attributes('disabled')).toBeUndefined();
    await button.trigger('click');
    expect(productTelemetry.withdraw).toHaveBeenCalledOnce();
    telemetryState.enabled = false;
    telemetryState.pendingWithdrawal = true;
    await wrapper.vm.$nextTick();
    expect(button.attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
