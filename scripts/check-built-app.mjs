import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const distRoot = path.join(projectRoot, 'dist');
const budgets = {
  entryJavaScriptGzip: 64 * 1024,
  anyJavaScriptGzip: 230 * 1024,
  landingJavaScriptGzip: 8 * 1024,
  landingCssGzip: 6 * 1024,
  landingMediaBytes: 360 * 1024,
  landingScreenBytes: 40 * 1024,
};

async function requireFile(relativePath) {
  const fullPath = path.resolve(distRoot, relativePath);
  if (!fullPath.startsWith(`${distRoot}${path.sep}`)) {
    throw new Error(`Asset points outside dist: ${relativePath}`);
  }

  const details = await stat(fullPath);
  if (!details.isFile() || details.size === 0) {
    throw new Error(`Built file is missing or empty: ${relativePath}`);
  }
}

async function gzipSize(relativePath) {
  return gzipSync(await readFile(path.join(distRoot, relativePath))).byteLength;
}

async function pngDimensions(relativePath) {
  const content = await readFile(path.join(distRoot, relativePath));
  if (content.length < 24 || content.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`Icon is not a valid PNG: ${relativePath}`);
  }
  return { width: content.readUInt32BE(16), height: content.readUInt32BE(20) };
}

function requireWithinBudget(label, size, budget, relativePath) {
  if (size <= budget) {
    return;
  }
  throw new Error(`${label} exceeds gzip budget: ${relativePath} is ${size} bytes, budget is ${budget}`);
}

const html = await readFile(path.join(distRoot, 'index.html'), 'utf8');
const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/g)].map((match) => match[1].slice(1));

if (assetPaths.length < 2) {
  throw new Error('Built index.html must reference JavaScript and CSS assets');
}

for (const assetPath of new Set(assetPaths)) {
  if (!/-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(assetPath)) {
    throw new Error(`Built asset is not content-hashed: ${assetPath}`);
  }
  await requireFile(assetPath);
  if (assetPath.endsWith('.js')) {
    requireWithinBudget('Entry JavaScript', await gzipSize(assetPath), budgets.entryJavaScriptGzip, assetPath);
  }
}

const builtAssets = await readdir(path.join(distRoot, 'assets'));
for (const assetName of builtAssets.filter((name) => name.endsWith('.js'))) {
  const relativePath = path.join('assets', assetName);
  requireWithinBudget('JavaScript chunk', await gzipSize(relativePath), budgets.anyJavaScriptGzip, relativePath);
}

function findBuiltAsset(label, pattern) {
  const matches = builtAssets.filter((name) => pattern.test(name));
  if (matches.length !== 1) {
    throw new Error(`${label} must have exactly one production asset, found ${matches.length}`);
  }
  return matches[0];
}

const landingJavaScript = findBuiltAsset('Landing JavaScript', /^LandingView-[A-Za-z0-9_-]+\.js$/);
const landingCss = findBuiltAsset('Landing CSS', /^LandingView-[A-Za-z0-9_-]+\.css$/);
requireWithinBudget(
  'Landing JavaScript',
  await gzipSize(path.join('assets', landingJavaScript)),
  budgets.landingJavaScriptGzip,
  landingJavaScript,
);
requireWithinBudget('Landing CSS', await gzipSize(path.join('assets', landingCss)), budgets.landingCssGzip, landingCss);

const screenNames = ['today', 'week', 'month', 'history', 'journal', 'settings'];
const landingMedia = [];
for (const name of screenNames) {
  for (const suffix of ['', '-desktop']) {
    const asset = findBuiltAsset(`Landing ${name}${suffix}`, new RegExp(`^${name}${suffix}-(?!desktop-)[A-Za-z0-9_-]+\\.webp$`));
    const size = (await stat(path.join(distRoot, 'assets', asset))).size;
    requireWithinBudget('Landing screen', size, budgets.landingScreenBytes, asset);
    landingMedia.push(asset);
  }
}
const landingMediaBytes = (await Promise.all(landingMedia.map((assetName) => stat(path.join(distRoot, 'assets', assetName))))).reduce(
  (total, details) => total + details.size,
  0,
);
requireWithinBudget('Landing media', landingMediaBytes, budgets.landingMediaBytes, landingMedia.join(', '));

await requireFile('manifest.webmanifest');
await requireFile('sw.js');

for (const marker of ['viewport-fit=cover', 'rel="apple-touch-icon"', 'name="theme-color"']) {
  if (!html.includes(marker)) {
    throw new Error(`Built HTML is missing PWA marker: ${marker}`);
  }
}

const manifest = JSON.parse(await readFile(path.join(distRoot, 'manifest.webmanifest'), 'utf8'));
for (const [field, expected] of Object.entries({
  name: 'Траектория',
  short_name: 'Траектория',
  display: 'standalone',
  id: '/',
  scope: '/',
  start_url: '/today',
})) {
  if (manifest[field] !== expected) {
    throw new Error(`Manifest ${field} must be ${JSON.stringify(expected)}`);
  }
}

const requiredIcons = [
  { src: '/icons/icon-192.png', sizes: '192x192' },
  { src: '/icons/icon-512.png', sizes: '512x512' },
  { src: '/icons/icon-512-maskable.png', sizes: '512x512', purpose: 'maskable' },
];
for (const expected of requiredIcons) {
  const icon = manifest.icons?.find((candidate) => candidate.src === expected.src);
  if (!icon || icon.sizes !== expected.sizes || (expected.purpose && icon.purpose !== expected.purpose)) {
    throw new Error(`Manifest icon contract is missing: ${expected.src}`);
  }
  const relativePath = expected.src.slice(1);
  await requireFile(relativePath);
  const [width, height] = expected.sizes.split('x').map(Number);
  const dimensions = await pngDimensions(relativePath);
  if (dimensions.width !== width || dimensions.height !== height) {
    throw new Error(`Manifest icon dimensions do not match ${expected.sizes}: ${expected.src}`);
  }
}

const serviceWorker = await readFile(path.join(distRoot, 'sw.js'), 'utf8');
for (const marker of ['cleanupOutdatedCaches', 'denylist', '/api', '/assets']) {
  if (!serviceWorker.includes(marker)) {
    throw new Error(`Service worker is missing deployment safeguard: ${marker}`);
  }
}

console.log(`Production build smoke and JavaScript budget checks passed for ${new Set(assetPaths).size} entry assets.`);
