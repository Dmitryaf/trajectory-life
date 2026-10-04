export type DurationParts = {
  hours: number | null;
  minutes: number | null;
};

export function splitDuration(totalMinutes: number | null): DurationParts {
  if (totalMinutes === null || !Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return { hours: null, minutes: null };
  }
  const rounded = Math.round(totalMinutes);
  return { hours: Math.floor(rounded / 60), minutes: rounded % 60 };
}

export function combineDuration(hours: number | null, minutes: number | null, maxMinutes: number): number | null {
  if (hours === null && minutes === null) {
    return null;
  }
  const safeHours = hours === null || !Number.isFinite(hours) ? 0 : Math.max(0, Math.floor(hours));
  const safeMinutes = minutes === null || !Number.isFinite(minutes) ? 0 : Math.min(59, Math.max(0, Math.floor(minutes)));
  return Math.min(maxMinutes, safeHours * 60 + safeMinutes);
}
