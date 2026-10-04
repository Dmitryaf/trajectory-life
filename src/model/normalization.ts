export const removedDemoCareerOptionId = 'custom:career:responses';
export const removedDemoContextFactorId = 'custom:evening:shower';

export function validDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return '';
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : '';
}
