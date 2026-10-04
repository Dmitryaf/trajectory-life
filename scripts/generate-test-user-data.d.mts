export const DEMO_BACKUP_VERSION: number;
export const DEMO_OUTPUT_RELATIVE_PATH: string;

export function todayKey(now?: Date): string;
export function addDays(date: string, amount: number): string;
export function startOfMonth(date: string): string;
export function addMonths(date: string, amount: number): string;
export function buildDemoPayload(anchor?: string): unknown;
export function writeDemoFile(options?: { anchor?: string; output?: string }): Promise<{ outputPath: string; payload: unknown }>;
