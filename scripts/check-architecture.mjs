import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const sourceExtensions = new Set(['.ts', '.vue']);
const reportThresholds = new Map([
  ['.vue', 600],
  ['.ts', 500],
  ['.css', 500],
]);
const hotspotContentBudgets = new Map([
  ['src/views/TodayView.vue', 25994],
  ['src/views/SettingsView.vue', 13395],
  ['src/views/WeekView.vue', 17407],
  ['src/views/MonthView.vue', 20744],
  ['src/features/settings/useSettingsForm.ts', 11771],
]);
const allowedDbOwners = new Set(['src/stores/app.ts', 'src/features/sync/base.ts']);
const allowedServiceFeatureEdges = new Set();
const allowedNonRuntimeModules = new Set();
const legacyRouteImplementations = new Set([
  'src/views/MonthView.vue',
  'src/views/SettingsView.vue',
  'src/views/TodayView.vue',
  'src/views/WeekView.vue',
]);
const forbiddenRouteDependencyLayers = new Set(['db.ts', 'model', 'services', 'stores', 'types.ts']);
const styleOwnerRules = [
  { selector: 'bottom-nav', owner: 'src/App.css' },
  { selector: 'primary-button', owner: 'src/shared/ui/actions/ActionButton.css' },
  { selector: 'secondary-button', owner: 'src/shared/ui/actions/ActionButton.css' },
  { selector: 'danger-button', owner: 'src/shared/ui/actions/ActionButton.css' },
  { selector: 'range-tabs', owner: 'src/shared/ui/navigation/RangeTabs.css' },
  { selector: 'section-heading', owner: 'src/shared/ui/layout/SectionHeading.css' },
  { selector: 'form-card', owner: 'src/shared/ui/layout/SurfaceCard.css' },
  { selector: 'dashboard-card', owner: 'src/shared/ui/layout/SurfaceCard.css' },
  { selector: 'review-card', owner: 'src/shared/ui/layout/SurfaceCard.css' },
  {
    selector: 'settings-card',
    owner: 'src/features/settings/ui/SettingsCard.css',
  },
];
const visualPrimitiveOwners = new Map([
  ['primary-button', 'src/shared/ui/actions/ActionButton.vue'],
  ['secondary-button', 'src/shared/ui/actions/ActionButton.vue'],
  ['danger-button', 'src/shared/ui/actions/ActionButton.vue'],
  ['range-tabs', 'src/shared/ui/navigation/RangeTabs.vue'],
  ['section-heading', 'src/shared/ui/layout/SectionHeading.vue'],
  ['data-note', 'src/shared/ui/content/DataNote.vue'],
  ['form-card', 'src/shared/ui/layout/SurfaceCard.vue'],
  ['dashboard-card', 'src/shared/ui/layout/SurfaceCard.vue'],
  ['review-card', 'src/shared/ui/layout/SurfaceCard.vue'],
]);

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

function sourceLayer(filePath) {
  const relative = projectPath(filePath);
  if (relative === 'src/App.vue') {
    return 'views';
  }
  const match = relative.match(/^src\/([^/]+)/);
  return match?.[1] ?? 'other';
}

function scriptSource(filePath, source) {
  if (path.extname(filePath) !== '.vue') {
    return source;
  }
  return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join('\n');
}

function localSpecifiers(filePath, source) {
  const specifiers = new Set();
  const parsed = ts.createSourceFile(
    projectPath(filePath),
    scriptSource(filePath, source),
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );

  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const specifier = node.moduleSpecifier.text;
      if (specifier.startsWith('.') || specifier.startsWith('@/')) {
        specifiers.add(specifier);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const specifier = node.arguments[0].text;
      if (specifier.startsWith('.') || specifier.startsWith('@/')) {
        specifiers.add(specifier);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return [...specifiers];
}

function resolveLocalImport(importer, specifier, knownFiles) {
  const base = specifier.startsWith('@/') ? path.resolve(sourceRoot, specifier.slice(2)) : path.resolve(path.dirname(importer), specifier);
  const candidates = [
    base,
    ...[...sourceExtensions].map((extension) => `${base}${extension}`),
    ...[...sourceExtensions].map((extension) => path.join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => knownFiles.has(path.normalize(candidate))) ?? null;
}

function findCycles(graph) {
  const state = new Map();
  const stack = [];
  const cycles = new Set();

  function visit(node) {
    state.set(node, 'visiting');
    stack.push(node);
    for (const target of graph.get(node) ?? []) {
      if (state.get(target) === 'visiting') {
        const start = stack.indexOf(target);
        const cycle = [...stack.slice(start), target].map(projectPath).join(' -> ');
        cycles.add(cycle);
      } else if (!state.has(target)) {
        visit(target);
      }
    }
    stack.pop();
    state.set(node, 'visited');
  }

  for (const node of graph.keys()) {
    if (!state.has(node)) {
      visit(node);
    }
  }
  return [...cycles].sort();
}

function findReachableModules(graph, entry) {
  const reachable = new Set();
  const pending = entry ? [entry] : [];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || reachable.has(current)) {
      continue;
    }
    reachable.add(current);
    pending.push(...(graph.get(current) ?? []));
  }
  return reachable;
}

const allFiles = await collectFiles(sourceRoot);
const sourceFiles = allFiles.filter((filePath) => sourceExtensions.has(path.extname(filePath)));
const knownFiles = new Set(sourceFiles.map(path.normalize));
const architectureFiles = sourceFiles.filter((filePath) => {
  const relative = projectPath(filePath);
  return !relative.includes('/__tests__/') && !relative.includes('.test.') && !relative.startsWith('src/stories/');
});
const graph = new Map();
const violations = [];
const layerEdges = new Map();
const largeFiles = [];
const observedHotspots = new Set();
const observedLegacyRouteImplementations = new Set();

function contentUnits(source) {
  return source.replace(/[\s{}]/g, '').length;
}

for (const filePath of allFiles) {
  const extension = path.extname(filePath);
  const relative = projectPath(filePath);
  const hotspotBudget = hotspotContentBudgets.get(relative);
  const threshold = reportThresholds.get(extension);
  const source = hotspotBudget !== undefined || threshold !== undefined ? await readFile(filePath, 'utf8') : undefined;
  const lines = source === undefined ? undefined : source.split(/\r?\n/).length;
  if (hotspotBudget !== undefined) {
    observedHotspots.add(relative);
    const size = contentUnits(source);
    if (size > hotspotBudget) {
      violations.push(
        `${relative}: файл снова вырос с ${hotspotBudget} до ${size} содержательных единиц. Выделите самостоятельную ответственность или обоснуйте новый предел.`,
      );
    } else if (size < hotspotBudget) {
      violations.push(`${relative}: после сокращения файла уменьшите его предел с ${hotspotBudget} до ${size} содержательных единиц.`);
    }
  }
  if (threshold !== undefined) {
    if (lines > threshold) {
      largeFiles.push({ file: projectPath(filePath), lines, threshold });
    }
  }
}

for (const filePath of hotspotContentBudgets.keys()) {
  if (!observedHotspots.has(filePath)) {
    violations.push(`${filePath}: файл из списка повторяющихся горячих точек не найден.`);
  }
}

const cssFiles = allFiles.filter((filePath) => path.extname(filePath) === '.css');
const cssSources = new Map();
for (const filePath of cssFiles) {
  cssSources.set(projectPath(filePath), await readFile(filePath, 'utf8'));
}

for (const rule of styleOwnerRules) {
  const definition = new RegExp(`(?:^|\\n)\\.${rule.selector}(?:\\s*,|\\s*\\{)`);
  if (!definition.test(cssSources.get(rule.owner) ?? '')) {
    violations.push(`${rule.owner}: отсутствует базовый селектор .${rule.selector}.`);
  }
  for (const [filePath, source] of cssSources) {
    if (!definition.test(source) || filePath === rule.owner) {
      continue;
    }
    if (rule.allowedFiles?.has(filePath) || rule.overrides?.test(filePath)) {
      continue;
    }
    violations.push(`${filePath}: базовый селектор .${rule.selector} принадлежит ${rule.owner}.`);
  }
}

for (const importer of architectureFiles) {
  const source = await readFile(importer, 'utf8');
  const importerPath = projectPath(importer);
  const staticClassAttributes = source.matchAll(/<[A-Za-z][\w.-]*\b[^>]*\bclass=(['"])(.*?)\1[^>]*>/gs);
  for (const match of staticClassAttributes) {
    const classNames = match[2].split(/\s+/).filter(Boolean);
    for (const className of classNames) {
      const owner = visualPrimitiveOwners.get(className);
      if (owner && importerPath !== owner) {
        violations.push(`${importerPath}: .${className} создаётся вручную; используйте компонент ${owner}.`);
      }
    }
  }
  const targets = localSpecifiers(importer, source)
    .map((specifier) => resolveLocalImport(importer, specifier, knownFiles))
    .filter(Boolean);
  const productionTargets = targets.filter((target) => architectureFiles.includes(target));
  graph.set(importer, productionTargets);

  if (importerPath.startsWith('src/views/') && importerPath.endsWith('.vue')) {
    const forbiddenTargets = productionTargets.filter((target) => forbiddenRouteDependencyLayers.has(sourceLayer(target)));
    if (legacyRouteImplementations.has(importerPath)) {
      observedLegacyRouteImplementations.add(importerPath);
    }
    if (forbiddenTargets.length > 0 && !legacyRouteImplementations.has(importerPath)) {
      violations.push(
        `${importerPath}: route view напрямую зависит от ${forbiddenTargets.map(projectPath).join(', ')}. Перенесите поведение к feature-владельцу.`,
      );
    } else if (forbiddenTargets.length === 0 && legacyRouteImplementations.has(importerPath)) {
      violations.push(`${importerPath}: удалите устаревшее исключение legacyRouteImplementations.`);
    }
  }

  for (const target of productionTargets) {
    const targetPath = projectPath(target);
    const fromLayer = sourceLayer(importer);
    const toLayer = sourceLayer(target);
    const edge = `${fromLayer} -> ${toLayer}`;
    layerEdges.set(edge, (layerEdges.get(edge) ?? 0) + 1);

    if (targetPath === 'src/db.ts' && !allowedDbOwners.has(importerPath)) {
      violations.push(`${importerPath}: доступ к src/db.ts разрешён только store и владельцу cloudSyncBases.`);
    }
    if (fromLayer === 'services' && toLayer === 'features' && !allowedServiceFeatureEdges.has(importerPath)) {
      violations.push(`${importerPath}: service не должен зависеть от feature.`);
    }
  }
}

for (const filePath of legacyRouteImplementations) {
  if (!observedLegacyRouteImplementations.has(filePath)) {
    violations.push(`${filePath}: удалите несуществующее route-исключение.`);
  }
}

const cycles = findCycles(graph);
const moduleCounts = new Map();
for (const filePath of architectureFiles) {
  const layer = sourceLayer(filePath);
  moduleCounts.set(layer, (moduleCounts.get(layer) ?? 0) + 1);
}
const runtimeEntry = architectureFiles.find((filePath) => projectPath(filePath) === 'src/main.ts');
const reachableModules = findReachableModules(graph, runtimeEntry);
const unreachableModules = architectureFiles
  .filter((filePath) => !reachableModules.has(filePath))
  .map(projectPath)
  .sort();
const unreachableModuleSet = new Set(unreachableModules);
for (const filePath of unreachableModules) {
  if (!allowedNonRuntimeModules.has(filePath)) {
    violations.push(
      `${filePath}: модуль недостижим из src/main.ts. Удалите его, подключите к сценарию или обоснуйте в allowedNonRuntimeModules.`,
    );
  }
}
for (const filePath of allowedNonRuntimeModules) {
  if (!unreachableModuleSet.has(filePath)) {
    violations.push(`${filePath}: удалите устаревшее исключение allowedNonRuntimeModules.`);
  }
}

console.log('Производственные TS/Vue-модули:');
for (const [layer, count] of [...moduleCounts.entries()].sort()) {
  console.log(`- ${layer}: ${count}`);
}

console.log('\nАрхитектурные зависимости:');
for (const [edge, count] of [...layerEdges.entries()].sort()) {
  console.log(`- ${edge}: ${count}`);
}

console.log('\nКрупные файлы — сигнал для ревью, не ошибка:');
for (const item of largeFiles.sort((a, b) => b.lines - a.lines)) {
  console.log(`- ${item.file}: ${item.lines} строк (порог ${item.threshold})`);
}
if (!largeFiles.length) {
  console.log('- нет');
}

console.log('\nЯвно допущенные модули вне графа src/main.ts:');
for (const filePath of unreachableModules) {
  console.log(`- ${filePath}`);
}
if (!unreachableModules.length) {
  console.log('- нет');
}

if (cycles.length) {
  console.error('\nОбнаружены циклические зависимости:');
  for (const cycle of cycles) {
    console.error(`- ${cycle}`);
  }
}
if (violations.length) {
  console.error('\nНарушены архитектурные границы:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
}

if (cycles.length || violations.length) {
  process.exitCode = 1;
} else {
  console.log('\nАрхитектурные границы соблюдены.');
}
