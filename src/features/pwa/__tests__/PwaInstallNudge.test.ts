// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { pwaInstallNudgeStorageKey } from '../installNudge';
import { pwaInstalled, pwaInstallPromptAvailable } from '../installation';
import PwaInstallNudge from '../ui/PwaInstallNudge.vue';

describe('PwaInstallNudge', () => {
  beforeEach(() => {
    window.localStorage.clear();
    pwaInstalled.value = false;
    pwaInstallPromptAvailable.value = false;
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone)' });
  });

  it('waits for two saved days and can be postponed without blocking Today', async () => {
    const wrapper = mount(PwaInstallNudge, {
      props: { savedEntryCount: 1 },
      global: {
        stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    });

    expect(wrapper.find('.pwa-install-nudge').exists()).toBe(false);
    await wrapper.setProps({ savedEntryCount: 2 });
    expect(wrapper.text()).toContain('Открывайте «Траекторию» без браузера');
    expect(wrapper.get('a').attributes('href')).toBe('/settings#install-settings');

    await wrapper.get('.pwa-install-nudge__later').trigger('click');
    expect(wrapper.find('.pwa-install-nudge').exists()).toBe(false);
    expect(Number(window.localStorage.getItem(pwaInstallNudgeStorageKey))).toBeGreaterThan(Date.now());
  });
});
