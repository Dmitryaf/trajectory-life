import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import stylelint from 'stylelint';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const styleEntry = 'src/style.css';
const targetGlobalStyleOrder = ['src/styles/tokens.css', 'src/styles/reset.css', 'src/styles/base.css', 'src/styles/utilities.css'];
const targetGlobalStyles = new Set(targetGlobalStyleOrder);
const allowedUtilityClasses = new Set(['visually-hidden']);
const legacyViewStyleBudgets = new Map([
  ['src/views/MonthView.css', 4347],
  ['src/views/SettingsView.css', 2344],
  ['src/views/TodayView.css', 10026],
  ['src/views/WeekView.css', 5003],
]);
const allowedUnusedTokens = new Set();

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
    }),
  );
  return nested.flat();
}

function projectPath(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function classNames(source) {
  return [...source.matchAll(/\.([_a-z][\w-]*)/gi)].map((match) => match[1]);
}

function contentUnits(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s/g, '').length;
}

function validateStyleEntry(source, violations) {
  const imports = [];
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');

  for (const [index, line] of withoutComments.split(/\r?\n/).entries()) {
    if (!line.trim()) {
      continue;
    }
    const match = line.match(/^\s*@import\s+['"]\.\/styles\/([^'"]+\.css)['"];\s*$/);
    if (!match) {
      violations.push(`${styleEntry}:${index + 1}: the global entry may contain only imports from ./styles/.`);
      continue;
    }
    const importedFile = `src/styles/${match[1]}`;
    if (!targetGlobalStyles.has(importedFile)) {
      violations.push(`${styleEntry}:${index + 1}: ${importedFile} is outside the global foundation.`);
    }
    if (imports.includes(importedFile)) {
      violations.push(`${styleEntry}:${index + 1}: duplicate global style import ${importedFile}.`);
    }
    imports.push(importedFile);
  }

  if (imports.join('\n') !== targetGlobalStyleOrder.join('\n')) {
    violations.push(`${styleEntry}: imports must be exactly ${targetGlobalStyleOrder.join(', ')} in this order.`);
  }
}

function validateTargetGlobalStyle(relative, source, violations) {
  const classes = classNames(source);
  if (relative !== 'src/styles/utilities.css') {
    if (classes.length > 0) {
      violations.push(`${relative}: target foundation files may not contain class selectors.`);
    }
    return;
  }

  const unapprovedClasses = new Set(classes.filter((className) => !allowedUtilityClasses.has(className)));
  for (const className of unapprovedClasses) {
    violations.push(`${relative}: .${className} is not an approved global utility.`);
  }
}

const files = await collectFiles(sourceRoot);
const violations = [];
const observedGlobalStyles = new Set();
const styleSources = new Map();
const observedLegacyViewStyles = new Set();
validateStyleEntry(await readFile(path.join(root, styleEntry), 'utf8'), violations);

for (const filePath of files.filter((file) => file.endsWith('.css') || file.endsWith('.vue'))) {
  const relative = projectPath(filePath);
  const source = await readFile(filePath, 'utf8');
  styleSources.set(
    relative,
    filePath.endsWith('.vue') ? [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n') : source,
  );

  if (relative.startsWith('src/views/') && relative.endsWith('.css')) {
    const budget = legacyViewStyleBudgets.get(relative);
    if (budget === undefined) {
      violations.push(
        `${relative}: новый CSS в src/views запрещён. Малый стиль оставьте в scoped SFC, самостоятельную поверхность перенесите к feature-владельцу.`,
      );
    } else {
      observedLegacyViewStyles.add(relative);
      const size = contentUnits(source);
      if (size > budget) {
        violations.push(
          `${relative}: переходный View.css вырос с ${budget} до ${size} содержательных единиц. Перенесите правило к владельцу или обоснуйте новый baseline.`,
        );
      } else if (size < budget) {
        violations.push(`${relative}: после сокращения уменьшите baseline с ${budget} до ${size}.`);
      }
    }
  }

  if (!filePath.endsWith('.css')) {
    continue;
  }
  if (!relative.startsWith('src/styles/')) {
    continue;
  }
  observedGlobalStyles.add(relative);

  if (!targetGlobalStyles.has(relative)) {
    violations.push(`${relative}: global file is outside the foundation; move it next to its scoped owner.`);
    continue;
  }

  validateTargetGlobalStyle(relative, source, violations);
}

for (const file of legacyViewStyleBudgets.keys()) {
  if (!observedLegacyViewStyles.has(file)) {
    violations.push(`${file}: удалите несуществующий View.css baseline.`);
  }
}

for (const file of targetGlobalStyles) {
  if (!observedGlobalStyles.has(file)) {
    violations.push(`${file}: required global foundation file was not found.`);
  }
}

for (const filePath of files.filter((file) => file.endsWith('.vue'))) {
  const relative = projectPath(filePath);
  const source = await readFile(filePath, 'utf8');
  const styleBlocks = [...source.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)];

  for (const [index, styleBlock] of styleBlocks.entries()) {
    const attributes = styleBlock[1] ?? '';
    if (!/\b(?:scoped|module)\b/i.test(attributes)) {
      violations.push(`${relative}: style block ${index + 1} must use scoped or module ownership.`);
    }

    const result = await stylelint.lint({
      code: styleBlock[2] ?? '',
      codeFilename: `${relative}.style-${index + 1}.css`,
      configFile: path.join(root, 'stylelint.config.js'),
    });
    for (const warning of result.results.flatMap((item) => item.warnings)) {
      violations.push(`${relative}:${warning.line}:${warning.column}: ${warning.text}`);
    }
  }
}

const tokenSource = styleSources.get('src/styles/tokens.css') ?? '';
const definedTokens = new Set([...tokenSource.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((match) => match[1]));
const tokenConsumerSources = await Promise.all(
  files.filter((file) => /\.(?:css|ts|vue)$/.test(file)).map((file) => readFile(file, 'utf8')),
);
const referencedTokens = new Set(
  tokenConsumerSources.flatMap((source) =>
    [...source.matchAll(/(?:var\(\s*|getPropertyValue\(\s*['"])(--[a-z0-9-]+)/gi)].map((match) => match[1]),
  ),
);
const unusedTokens = [...definedTokens].filter((token) => !referencedTokens.has(token)).sort();
const unusedTokenSet = new Set(unusedTokens);
for (const token of unusedTokens) {
  if (!allowedUnusedTokens.has(token)) {
    violations.push(`${token}: токен не используется; удалите его или докажите нового потребителя.`);
  }
}
for (const token of allowedUnusedTokens) {
  if (!unusedTokenSet.has(token)) {
    violations.push(`${token}: удалите устаревшее исключение allowedUnusedTokens.`);
  }
}

console.log(`Token reachability checked for ${definedTokens.size} definitions; ${unusedTokens.length} explicit cleanup candidates.`);

if (violations.length > 0) {
  console.error(['Style boundary guard failed:', ...violations.map((violation) => `- ${violation}`)].join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Style boundary guard passed for ${observedGlobalStyles.size} global files and scoped Vue styles.`);
}
