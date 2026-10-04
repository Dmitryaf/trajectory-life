import {
  buildAiReportPayload,
  buildAiReportPrompt,
  buildAiReportCustomRangePayload,
  buildAiReportRangePayload,
  type AiReportPayload,
  type AiReportSourceData,
} from './report';
import type { AppSettings } from '@/types';

export function buildPeriodPackage(period: 'week' | 'month', anchor: string, source: AiReportSourceData) {
  return buildAiReportPayload(period, anchor, source);
}

export function buildRangePackage(rangeMonths: number, anchor: string, source: AiReportSourceData) {
  return buildAiReportRangePayload(rangeMonths, anchor, source);
}

export function buildCustomRangePackage(start: string, end: string, source: AiReportSourceData) {
  return buildAiReportCustomRangePayload(start, end, source);
}

export function downloadAiPackage(payload: AiReportPayload) {
  let suffix: string = payload.period;
  if (payload.period === 'range') {
    suffix = payload.rangeMonths ? `${payload.rangeMonths}-months` : 'period';
  }
  downloadJson(payload, `trajectory-analysis-${suffix}-${payload.start}-${payload.dataThrough}.json`);
}

export async function copyAiPrompt(payload: AiReportPayload, settings: AppSettings) {
  await copyText(buildAiReportPrompt(payload, settings));
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Some installed browsers expose Clipboard API but reject it outside a secure context.
    }
  }

  const field = document.createElement('textarea');
  field.value = value;
  field.readOnly = true;
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) {
    throw new Error('Браузер не разрешил скопировать текст. Попробуй скачать данные.');
  }
}
