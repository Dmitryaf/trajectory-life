export type PromptSection = {
  title: string;
  values: string[];
  maxItems: number;
  maxLineLength: number;
};

// Keep both ends and distribute retained records across the period instead of keeping only its beginning.
function distributedValues(values: string[], count: number): string[] {
  if (values.length <= count) {
    return values;
  }
  if (count === 1) {
    return [values[0]!];
  }
  return Array.from({ length: count }, (_, index) => values[Math.round((index * (values.length - 1)) / (count - 1))]!);
}

function clipText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const notice = '… [подробности сокращены]';
  return `${value.slice(0, Math.max(0, maxLength - notice.length)).trimEnd()}${notice}`;
}

function omissionNotice(count: number): string {
  return count ? `Не включено подробностей: ${count}. Представлена часть записей; полные данные — в JSON-экспорте.` : '';
}

function renderSection(section: PromptSection, budget?: number): string {
  const header = `${section.title}:\n`;
  if (!section.values.length) {
    return `${header}- Нет данных.`;
  }

  let count = Math.min(section.values.length, section.maxItems);
  let lineLimit = section.maxLineLength;
  if (budget !== undefined) {
    // Reserve the omission notice before dividing space between records, so the final section always fits.
    const available = budget - header.length - omissionNotice(section.values.length).length - 3;
    count = Math.min(count, Math.max(1, Math.floor(available / 163)));
    lineLimit = Math.min(lineLimit, Math.floor(available / count) - 3);
  }
  const values = distributedValues(section.values, count).map((value) => clipText(value, lineLimit));
  const notice = omissionNotice(section.values.length - count);
  return `${header}${[...values, ...(notice ? [notice] : [])].map((value) => `- ${value}`).join('\n')}`;
}

export function renderPromptSections(sections: PromptSection[], characterBudget: number): string {
  const rendered = sections.map((section) => renderSection(section));
  if (rendered.join('\n').length <= characterBudget) {
    return rendered.join('\n');
  }

  const budgets = sections.map(() => 0);
  let remaining = characterBudget - Math.max(0, sections.length - 1);
  let pending = sections.map((_, index) => index);
  // Small sections keep their full content; the remaining space is shared by the larger sections.
  while (pending.length) {
    const share = Math.floor(remaining / pending.length);
    const complete = pending.filter((index) => rendered[index]!.length <= share);
    if (!complete.length) {
      for (const index of pending) {
        budgets[index] = share;
      }
      break;
    }
    for (const index of complete) {
      budgets[index] = rendered[index]!.length;
      remaining -= budgets[index]!;
    }
    pending = pending.filter((index) => !complete.includes(index));
  }
  return sections
    .map((section, index) => (rendered[index]!.length <= budgets[index]! ? rendered[index]! : renderSection(section, budgets[index]!)))
    .join('\n');
}
