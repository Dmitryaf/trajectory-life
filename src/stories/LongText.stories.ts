import { ref } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AutoGrowTextarea from '../shared/ui/forms/AutoGrowTextarea.vue';

const meta = {
  title: 'Формы/Длинный текст',
  component: AutoGrowTextarea,
  tags: ['autodocs'],
  decorators: [() => ({ template: '<div style="max-width: 680px"><story /></div>' })],
} satisfies Meta<typeof AutoGrowTextarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    modelValue: '',
    placeholder: 'Запиши мысль так, как она появилась. Делить её на темы необязательно.',
  },
};

export const LongInsight: Story = {
  render: (args) => ({
    components: { AutoGrowTextarea },
    setup() {
      const value = ref(args.modelValue);
      return { args, value };
    },
    template: '<AutoGrowTextarea v-bind="args" v-model="value" />',
  }),
  args: {
    modelValue:
      'После нескольких недель заметил, что сложные решения легче принимать не сразу после напряжённого дня, а после прогулки и сна. Это пока наблюдение, а не доказанная причина. Хочу проверить, повторяется ли оно в следующие недели и не связано ли с другими изменениями режима.',
    rows: 4,
    maxLength: 2000,
  },
};
