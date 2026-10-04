import { addDays, endOfWeek, startOfWeek, todayKey } from '@/services/dates';

export type FirstUsePeriodOption = {
  id: 'current' | 'previous';
  weekStart: string;
  periodEnd: string;
  coveredDays: number;
  completed: boolean;
  recommended: boolean;
};

export function firstUsePeriodOptions(today: string = todayKey()): FirstUsePeriodOption[] {
  const currentWeekStart = startOfWeek(today);
  const currentWeekEnd = endOfWeek(today);
  const previousWeekStart = addDays(currentWeekStart, -7);
  const currentCoveredDays =
    Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${currentWeekStart}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  const recommendCurrent = currentCoveredDays >= 4;

  return [
    {
      id: 'current',
      weekStart: currentWeekStart,
      periodEnd: today,
      coveredDays: currentCoveredDays,
      completed: today === currentWeekEnd,
      recommended: recommendCurrent,
    },
    {
      id: 'previous',
      weekStart: previousWeekStart,
      periodEnd: addDays(currentWeekStart, -1),
      coveredDays: 7,
      completed: true,
      recommended: !recommendCurrent,
    },
  ];
}

export function recommendedFirstUsePeriod(today: string = todayKey()): FirstUsePeriodOption {
  return firstUsePeriodOptions(today).find((option) => option.recommended)!;
}
