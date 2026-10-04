import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const demoFilePath = 'demo/generated/trajectory-full.json';
export const visualDemoAnchor = '2026-08-26';
export const visualDemoFilePath = 'demo/generated/trajectory-visual.json';

type DemoPayload = {
  version: number;
  exportedAt: string;
  dailyEntries: Array<{ date: string; updatedAt?: string; [key: string]: unknown }>;
  results: unknown[];
  lifeEvents: unknown[];
  weeklyReviews: unknown[];
  monthlyReviews: unknown[];
  settings: Record<string, unknown>;
};

export function readDemoPayload(filePath = demoFilePath): DemoPayload {
  return JSON.parse(readFileSync(resolve(process.cwd(), filePath), 'utf8')) as DemoPayload;
}

export function buildRepeatedUsePayload(today: string): DemoPayload {
  const payload = readDemoPayload();
  const entries = payload.dailyEntries.slice(0, 2);
  if (entries.length !== 2) {
    throw new Error('Demo fixture must contain at least two daily entries');
  }

  const yesterday = addDays(parseDate(today), -1);
  const timestamp = `${today}T12:00:00.000Z`;
  return {
    ...payload,
    exportedAt: timestamp,
    dailyEntries: entries.map((entry, index) => ({
      ...entry,
      date: index === 0 ? yesterday : today,
      updatedAt: timestamp,
    })),
    results: [],
    lifeEvents: [],
    weeklyReviews: [],
    monthlyReviews: [],
  };
}

export function demoAnchor(): string {
  return readDemoPayload().exportedAt.slice(0, 10);
}

export function completedCrossMonthRange(): { start: string; end: string } {
  const anchor = parseDate(demoAnchor());
  const boundary = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 1, 1));
  return { start: addDays(boundary, -5), end: addDays(boundary, 2) };
}

export function emptyPeriodDate(filePath = demoFilePath): string {
  const firstEntry = readDemoPayload(filePath)
    .dailyEntries.map((entry) => entry.date)
    .sort()[0];
  if (!firstEntry) {
    throw new Error('Demo fixture must contain daily entries');
  }
  return addDays(parseDate(firstEntry), -60);
}

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function addDays(date: Date, amount: number): string {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}
