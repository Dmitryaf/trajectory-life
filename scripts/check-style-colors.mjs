import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const rawColorPattern = /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)|(?<![-\w])(?:white|black)(?![-\w])/gi;
const rawColorOwnerFiles = new Set(['src/styles/tokens.css']);

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

function styleSource(file, source) {
  if (file.endsWith('.css')) {
    return source;
  }
  return [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n');
}

const sourceFiles = await collectFiles(sourceRoot);
const files = sourceFiles
  .filter((file) => file.endsWith('.css') || file.endsWith('.vue'))
  .map(projectPath)
  .sort();
const violations = [];
const observedFiles = new Set();

for (const file of files) {
  const source = styleSource(file, await readFile(path.join(root, file), 'utf8'));
  if (!source) {
    continue;
  }
  observedFiles.add(file);
  const rawColorCount = source.match(rawColorPattern)?.length ?? 0;
  if (rawColorOwnerFiles.has(file)) {
    continue;
  }
  if (rawColorCount > 0) {
    violations.push(`${file}: found ${rawColorCount} raw colors; use semantic tokens instead.`);
  }
}

if (violations.length > 0) {
  console.error(['Style color guard failed:', ...violations.map((violation) => `- ${violation}`)].join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Style color guard passed for ${observedFiles.size} style owners.`);
}
