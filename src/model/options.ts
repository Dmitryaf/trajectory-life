import type {
  ActionDirectionId,
  ActivityId,
  BaseCareerState,
  BaseContextFactorId,
  BaseLifeAreaId,
  CareerState,
  DailyBlockId,
  ExperimentMetricOption,
  LifeEventType,
  NutritionState,
  Option,
  ResultRecord,
  SpecialDayId,
} from './schema';

export const careerOptions: Option<BaseCareerState>[] = [
  { id: 'workday', label: 'Рабочий день', icon: '▤' },
  { id: 'learning', label: 'Обучение', icon: '◫' },
  { id: 'communication', label: 'Общение по работе', icon: '◉' },
  { id: 'own_project', label: 'Свой проект', icon: '◇' },
  { id: 'work_result', label: 'Завершённый результат', icon: '✓' },
];

export const legacyCareerOptions: Option<CareerState>[] = [
  { id: 'preparation', label: 'Подготовка', icon: '◫' },
  { id: 'project', label: 'Проект', icon: '◇' },
  { id: 'external', label: 'Отклик/контакт', icon: '↗' },
  { id: 'interview', label: 'Собеседование', icon: '◉' },
  { id: 'result', label: 'Итог', icon: '✓' },
];

export const activityOptions: Option<ActivityId>[] = [
  { id: 'walk', label: 'Прогулка', icon: '→' },
  { id: 'workout', label: 'Тренировка', icon: '△' },
  { id: 'recovery', label: 'Восстановление', icon: '○' },
];

export const legacyActivityOptions: Option<ActivityId>[] = [
  { id: 'boxing', label: 'Бокс', icon: '◈' },
  { id: 'bachata', label: 'Бачата', icon: '♪' },
];

export const knownActivityOptions: Option<ActivityId>[] = [...activityOptions, ...legacyActivityOptions];

export const nutritionOptions: Option<NutritionState>[] = [
  { id: 'supports_goal', label: 'Поддержало цель', icon: '✓' },
  { id: 'neutral', label: 'Нейтрально', icon: '·' },
  { id: 'blocks_goal', label: 'Мешало цели', icon: '!' },
];

export const actionDirectionOptions: Option<ActionDirectionId>[] = [
  { id: 'external', label: 'Шаг к цели', icon: '↗' },
  { id: 'preparation', label: 'Подготовка', icon: '◫' },
  { id: 'maintenance', label: 'Поддержание', icon: '○' },
  { id: 'recovery', label: 'Восстановление', icon: '◌' },
  { id: 'drift', label: 'Занимался другим', icon: '!' },
];

export const actionDirectionEntryOptions = actionDirectionOptions.filter((option) => option.id !== 'recovery');

export const specialDayOptions: Option<SpecialDayId>[] = [
  { id: 'sick', label: 'Болел', icon: '+' },
  { id: 'travel', label: 'Поездка', icon: '→' },
  { id: 'overload', label: 'Перегруз', icon: '!' },
  { id: 'event', label: 'Событие', icon: '◉' },
  { id: 'recovery', label: 'Восстановление', icon: '○' },
  { id: 'other', label: 'Другое', icon: '·' },
];

export const lifeEventTypeOptions: Option<LifeEventType>[] = [
  { id: 'change', label: 'Изменение', icon: '↻' },
  { id: 'decision', label: 'Решение', icon: '✓' },
  { id: 'event', label: 'Событие', icon: '◉' },
  { id: 'insight', label: 'Мысль или наблюдение', icon: '✦' },
  { id: 'other', label: 'Другое', icon: '·' },
];

export const contextFactorOptions: Option<BaseContextFactorId>[] = [
  { id: 'late_bedtime', label: 'Изменившийся режим сна', icon: '◷' },
  { id: 'screen', label: 'Экранное время', icon: '▣' },
  { id: 'news', label: 'Новости и инфопоток', icon: '!' },
  { id: 'series_video', label: 'Видео и сериалы', icon: '▶' },
  { id: 'work_code', label: 'Рабочая нагрузка', icon: '◇' },
  { id: 'late_food', label: 'Поздний приём пищи', icon: '+' },
  { id: 'caffeine_alcohol', label: 'Кофеин или алкоголь', icon: '◌' },
  { id: 'anxiety_overload', label: 'Эмоциональная нагрузка', icon: '⌁' },
];

export const legacyContextFactorOptions: Option<BaseContextFactorId>[] = [
  { id: 'other', label: 'Другое (старая отметка)', icon: '…' },
  { id: 'porn', label: 'Другое (старая отметка)', icon: '…' },
];

export const lifeAreaOptions: Option<BaseLifeAreaId>[] = [
  { id: 'family', label: 'Семья', icon: '⌂' },
  { id: 'reading', label: 'Чтение', icon: '▤' },
  { id: 'creativity', label: 'Творчество', icon: '✦' },
  { id: 'spiritual', label: 'Духовное', icon: '◎' },
  { id: 'rest', label: 'Отдых', icon: '☼' },
  { id: 'friends', label: 'Друзья', icon: '◌' },
];

export const legacyLifeAreaOptions: Option<BaseLifeAreaId>[] = [{ id: 'english', label: 'Английский', icon: 'A' }];

export const resultAreaOptions: Option<ResultRecord['area']>[] = [
  { id: 'career', label: 'Работа', icon: '↗' },
  { id: 'sport', label: 'Спорт', icon: '△' },
  { id: 'nutrition', label: 'Питание', icon: '◐' },
  { id: 'sleep', label: 'Сон', icon: '◒' },
  { id: 'health', label: 'Здоровье', icon: '+' },
  ...lifeAreaOptions,
];

export const dailyBlockOptions: Option<DailyBlockId>[] = [
  { id: 'sleep', label: 'Сон и состояние', icon: '◒' },
  { id: 'context', label: 'Условия дня', icon: '⌁' },
  { id: 'career', label: 'Работа', icon: '↗' },
  { id: 'movement', label: 'Физическая активность', icon: '△' },
  { id: 'nutrition', label: 'Питание и вес', icon: '◐' },
];

export const experimentMetricOptions: ExperimentMetricOption[] = [
  { id: 'sleepMinutes', label: 'Продолжительность сна', unit: 'мин', defaultMinimumChange: 30, step: 5 },
  { id: 'timeInBedMinutes', label: 'Время в кровати', unit: 'мин', defaultMinimumChange: 30, step: 5 },
  { id: 'sleepQuality', label: 'Качество сна', unit: 'балла', defaultMinimumChange: 0.5, step: 0.1 },
  { id: 'energy', label: 'Энергия за день', unit: 'балла', defaultMinimumChange: 0.5, step: 0.1 },
  { id: 'weightKg', label: 'Вес', unit: 'кг', defaultMinimumChange: 0.5, step: 0.1 },
];

export const externalCareerStates: CareerState[] = ['external', 'interview', 'result', 'work_result'];

export function externalCareerIdsForOptions(options: Array<Pick<Option<CareerState>, 'id' | 'countsAsExternal'>>): CareerState[] {
  return Array.from(new Set([...externalCareerStates, ...options.filter((option) => option.countsAsExternal).map((option) => option.id)]));
}
