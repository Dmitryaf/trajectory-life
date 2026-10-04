import { ref } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import ChipGroup from '../shared/ui/forms/ChipGroup.vue';
import DurationInput from '../shared/ui/forms/DurationInput.vue';
import ScalePicker from '../shared/ui/forms/ScalePicker.vue';
import DataNote from '../shared/ui/content/DataNote.vue';

const meta = {
  title: 'Формы/Основные поля',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const MultipleChoice: Story = {
  render: () => ({
    components: { ChipGroup },
    setup() {
      const value = ref(['walk', 'workout']);
      const options = [
        { id: 'walk', label: 'Прогулка', icon: '→' },
        { id: 'workout', label: 'Тренировка', icon: '△' },
        { id: 'recovery', label: 'Восстановление', icon: '○' },
      ];
      return { value, options };
    },
    template: '<ChipGroup v-model="value" :options="options" multiple />',
  }),
};

export const Duration: Story = {
  render: () => ({
    components: { DataNote, DurationInput },
    setup() {
      const value = ref(452);
      return { value };
    },
    template:
      '<div style="max-width: 380px"><DurationInput id="story-duration" v-model="value" :max-hours="18" /><DataNote>Внутреннее значение: {{ value }} минут</DataNote></div>',
  }),
};

export const Scale: Story = {
  render: () => ({
    components: { ScalePicker },
    setup() {
      const value = ref<number | null>(3);
      return { value };
    },
    template: '<div style="max-width: 420px"><ScalePicker v-model="value" low-label="нет сил" high-label="много сил" /></div>',
  }),
};
