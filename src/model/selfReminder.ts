export const selfReminderCategories = [
  { value: 'principle', label: 'Принципы', placeholder: 'Чем вы хотите руководствоваться?' },
  { value: 'question', label: 'Вопросы к себе', placeholder: 'Какой вопрос стоит время от времени задавать себе?' },
  { value: 'lesson', label: 'Уроки прошлого', placeholder: 'Что произошло? Какой вывод пригодится в похожей ситуации?' },
] as const;

export type SelfReminderCategory = (typeof selfReminderCategories)[number]['value'];
export type SelfReminderText = { category: SelfReminderCategory; title?: string; text: string };
export type SelfReminder = SelfReminderText & { id: string; createdAt: string };

export function normalizeSelfReminder(value: unknown): SelfReminder {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Некорректная запись в напоминаниях себе');
  }
  const { id, category, title, text, createdAt } = value as Record<string, unknown>;
  const categoryOption = selfReminderCategories.find((option) => option.value === category);
  const timestamp = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN;
  if (typeof id !== 'string' || !id.trim() || !categoryOption || typeof text !== 'string' || !text.trim() || !Number.isFinite(timestamp)) {
    throw new Error('Некорректная запись в напоминаниях себе');
  }
  if (title !== undefined && typeof title !== 'string') {
    throw new Error('Некорректный заголовок напоминания');
  }
  const heading = title?.trim();
  return {
    id: id.trim(),
    category: categoryOption.value,
    text: text.trim(),
    createdAt: new Date(timestamp).toISOString(),
    ...(heading ? { title: heading } : {}),
  };
}
