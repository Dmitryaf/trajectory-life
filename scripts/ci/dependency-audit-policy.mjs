import { isDeepStrictEqual } from 'node:util';

const severities = ['info', 'low', 'moderate', 'high', 'critical'];

function validateFinding(name, entry) {
  if (
    entry?.name !== name ||
    !severities.includes(entry.severity) ||
    !Array.isArray(entry.nodes) ||
    entry.nodes.length === 0 ||
    !entry.nodes.every((node) => typeof node === 'string') ||
    !Array.isArray(entry.via) ||
    entry.via.length === 0
  ) {
    throw new Error('Malformed npm audit finding.');
  }
}

function findings(report) {
  if (
    report?.auditReportVersion !== 2 ||
    report.error ||
    !report.vulnerabilities ||
    Array.isArray(report.vulnerabilities) ||
    typeof report.vulnerabilities !== 'object'
  ) {
    throw new Error('Missing or unsupported npm audit report.');
  }
  const counts = Object.fromEntries(severities.map((severity) => [severity, 0]));
  const blocking = {};
  for (const [name, entry] of Object.entries(report.vulnerabilities)) {
    validateFinding(name, entry);
    counts[entry.severity]++;
    if (entry.severity === 'high' || entry.severity === 'critical') {
      blocking[name] = entry;
    }
  }
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (
    severities.some((severity) => report.metadata?.vulnerabilities?.[severity] !== counts[severity]) ||
    report.metadata?.vulnerabilities?.total !== total
  ) {
    throw new Error('Audit counts disagree with audit findings.');
  }
  return blocking;
}

export function evaluateAudit({ full, production, context, exception, now = new Date() }) {
  const fullFindings = findings(full);
  const productionFindings = findings(production);
  if (Object.keys(productionFindings).length > 0) {
    throw new Error('Production dependencies contain high or critical findings.');
  }
  if (Object.keys(fullFindings).length === 0) {
    return { status: 'passed', exceptionUsed: false };
  }
  const timestamp = new Date(now).getTime();
  const expiry = new Date(exception?.expiresAt).getTime();
  if (!Number.isFinite(timestamp) || !Number.isFinite(expiry) || timestamp >= expiry) {
    throw new Error('The dependency exception has expired or has an invalid date.');
  }
  if (!isDeepStrictEqual(fullFindings, exception.findings)) {
    throw new Error('High/critical findings differ from the explicitly reviewed exception.');
  }
  if (
    !isDeepStrictEqual(context?.files, exception.files) ||
    context?.lintCommand !== exception.lintCommand ||
    context?.allAffectedNodesDevOnly !== true
  ) {
    throw new Error('The reviewed dependency versions, development scope, or lint entry points changed.');
  }
  return { status: 'passed-with-exception', exceptionUsed: true, advisory: exception.advisory, expiresAt: exception.expiresAt };
}
