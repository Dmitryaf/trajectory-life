// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import LandingGallery from '../ui/LandingGallery.vue';

describe('landing image recovery', () => {
  it('offers a retry after a failed image and does not carry the error to another screen', async () => {
    const wrapper = mount(LandingGallery);
    await wrapper.get('img').trigger('error');
    expect(wrapper.get('[role="status"]').text()).toContain('Не удалось загрузить изображение');
    expect(wrapper.find('picture').exists()).toBe(false);
    await wrapper.get('.landing-gallery__error button').trigger('click');
    expect(wrapper.find('picture').exists()).toBe(true);
    await wrapper.get('img').trigger('error');
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.get('img').attributes('alt')).toContain('Неделя');
  });
});
