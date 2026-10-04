export function experimentWeekStatusLabel(
  active: boolean,
  isCurrentWeek: boolean,
  isPastWeek: boolean,
  completedDateLabel: string,
): string {
  if (!active) {
    return `Завершён · ${completedDateLabel}`;
  }
  if (isCurrentWeek) {
    return 'Идёт сейчас';
  }
  return isPastWeek ? 'Шёл в эту неделю' : 'Запланирован';
}

export function truncateExperimentText(value: string, maxLength: number): string {
  const text = value.trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
}
