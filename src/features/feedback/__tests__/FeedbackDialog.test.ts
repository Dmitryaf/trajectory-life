// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const feedback = vi.hoisted(() => ({ send: vi.fn() }));
const notifications = vi.hoisted(() => ({ error: vi.fn(), saved: vi.fn() }));

vi.mock('@/services/feedback', () => ({ sendFeedback: feedback.send }));
vi.mock('@/services/notifications', () => ({
  notifyError: notifications.error,
  notifySaved: notifications.saved,
}));

import FeedbackDialog from '../ui/FeedbackDialog.vue';

describe('feedback dialog', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('asks for one message and closes after successful delivery', async () => {
    feedback.send.mockResolvedValueOnce(undefined);
    const wrapper = mount(FeedbackDialog, { props: { accessToken: 'session-token' }, attachTo: document.body });

    await wrapper.get('.beta-feedback-link').trigger('click');
    const textarea = document.body.querySelector<HTMLTextAreaElement>('#beta-feedback-message');
    expect(textarea).not.toBeNull();
    textarea!.value = 'Добавьте подсказку на экране недели';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    document.body
      .querySelector<HTMLFormElement>('.feedback-dialog form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(feedback.send).toHaveBeenCalledWith('Добавьте подсказку на экране недели', 'session-token');
    expect(notifications.saved).toHaveBeenCalledWith('Спасибо, сообщение отправлено');
    expect(document.body.querySelector('.feedback-dialog')).toBeNull();
    wrapper.unmount();
  });

  it('uses the shared close icon and ignores a gesture that starts inside the dialog', async () => {
    const wrapper = mount(FeedbackDialog, { props: { accessToken: 'session-token' }, attachTo: document.body });

    await wrapper.get('.beta-feedback-link').trigger('click');
    const backdrop = document.body.querySelector<HTMLElement>('.feedback-backdrop')!;
    const dialog = document.body.querySelector<HTMLElement>('.feedback-dialog')!;
    const closeButton = document.body.querySelector<HTMLButtonElement>('[aria-label="Закрыть форму"]')!;

    expect(closeButton.querySelector('svg')).not.toBeNull();
    expect(closeButton.textContent).toBe('');
    dialog.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    backdrop.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    await flushPromises();

    expect(document.body.querySelector('.feedback-dialog')).not.toBeNull();
    closeButton.click();
    await flushPromises();
    expect(document.body.querySelector('.feedback-dialog')).toBeNull();
    wrapper.unmount();
  });
});
