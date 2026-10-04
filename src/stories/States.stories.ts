import type { Meta, StoryObj } from '@storybook/vue3-vite';
import ActionButton from '../shared/ui/actions/ActionButton.vue';

const meta = {
  title: 'Основы/Кнопки и состояния',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Buttons: Story = {
  render: () => ({
    components: { ActionButton },
    template: `
      <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center">
        <ActionButton variant="primary">Сохранить</ActionButton>
        <ActionButton variant="secondary">Скачать данные</ActionButton>
        <button class="ghost-button" type="button" aria-label="Редактировать">✎</button>
        <ActionButton variant="primary" disabled>Сохраняю…</ActionButton>
      </div>
    `,
  }),
};

export const EmptyState: Story = {
  render: () => ({
    template: `
      <div class="empty-state" style="max-width: 680px">
        <span>◇</span>
        <h3>Событий пока нет</h3>
        <p>Добавь изменение, решение, событие или мысль, к которой важно вернуться позже.</p>
      </div>
    `,
  }),
};

export const ErrorState: Story = {
  render: () => ({
    components: { ActionButton },
    template: `
      <section class="storage-error" role="alert" style="max-width: 760px">
        <span class="storage-error__mark" aria-hidden="true">!</span>
        <div>
          <p class="eyebrow">Локальное хранилище недоступно</p>
          <h1>Записи пока не открылись</h1>
          <p>Попробуй открыть данные ещё раз.</p>
          <ActionButton variant="primary">Повторить</ActionButton>
        </div>
      </section>
    `,
  }),
};
