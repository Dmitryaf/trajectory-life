import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { evaluateAudit } from './dependency-audit-policy.mjs';

const exception = JSON.parse(readFileSync(new URL('./dependency-audit-exception.json', import.meta.url), 'utf8'));

function audit(production) {
  if (!process.env.npm_execpath) {
    throw new Error('Run this audit through npm so the installed npm CLI is used.');
  }
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, 'audit', '--json', '--audit-level=high', ...(production ? ['--omit=dev'] : [])],
    { encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.error || result.signal || (result.status !== 0 && result.status !== 1)) {
    throw new Error('npm audit failed to complete.');
  }
  const report = JSON.parse(result.stdout);
  const hasBlockingFindings = (report.metadata?.vulnerabilities?.high ?? 0) + (report.metadata?.vulnerabilities?.critical ?? 0) > 0;
  if (result.status !== Number(hasBlockingFindings)) {
    throw new Error('npm audit exit status disagrees with its findings.');
  }
  return report;
}

try {
  const full = audit(false);
  const production = audit(true);
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const context = {
    files: Object.fromEntries(
      Object.keys(exception.files).map((file) => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]),
    ),
    lintCommand: JSON.parse(readFileSync('package.json', 'utf8')).scripts['lint:styles'],
    allAffectedNodesDevOnly: Object.values(full.vulnerabilities)
      .filter((entry) => entry.severity === 'high' || entry.severity === 'critical')
      .every((entry) => entry.nodes.every((node) => lock.packages?.[node]?.dev === true)),
  };
  const decision = evaluateAudit({ full, production, context, exception });
  console.log(JSON.stringify({ full: full.metadata.vulnerabilities, production: production.metadata.vulnerabilities, decision }, null, 2));
  if (decision.exceptionUsed) {
    console.warn(
      `Accepted development-tool exception ${decision.advisory} until ${decision.expiresAt}; the vulnerability remains present.`,
    );
  }
} catch (error) {
  console.error(`Dependency audit blocked: ${error.message}`);
  process.exitCode = 1;
}
