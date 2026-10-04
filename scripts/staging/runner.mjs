import { requireDistinctClients, requireStaging } from './session.mjs';

export function reportExitCode(report) {
  if (report.suites.some((suite) => suite.status === 'failed')) {
    return 1;
  }
  return report.suites.some((suite) => suite.status === 'blocked') ? 2 : 0;
}

export async function runSuites(clients, suites, { confirmed = false, onProgress = () => {} } = {}) {
  requireDistinctClients(clients);
  for (const client of clients) {
    requireStaging(client.origin, confirmed);
  }
  const report = { startedAt: new Date().toISOString(), suites: [] };
  for (const suite of suites) {
    onProgress(suite.name);
    try {
      const details = await suite.run(clients);
      const blocked = details?.available === false || details?.unverified?.length > 0;
      report.suites.push({ name: suite.name, status: blocked ? 'blocked' : 'passed', details });
    } catch (error) {
      // Browser/assertion messages can contain page text, credentials or response bodies.
      const location = error instanceof Error ? error.stack?.match(/scripts[\\/]staging[\\/][a-z-]+\.mjs:\d+:\d+/)?.[0] : undefined;
      report.suites.push({ name: suite.name, status: 'failed', reason: error instanceof Error ? error.name : 'UnknownError', location });
      if (suite.critical) {
        break;
      }
    }
  }
  report.finishedAt = new Date().toISOString();
  report.exitCode = reportExitCode(report);
  return report;
}

export async function defaultSuites() {
  const { telemetryPermissions, telemetryConsent } = await import('./telemetry.mjs');
  const { snapshotRls, twoDeviceSync } = await import('./snapshots.mjs');
  const { longNotes, analysisExport, keyboardNavigation, zoomLayout } = await import('./interface.mjs');
  return [
    { name: 'telemetry_permissions', critical: true, run: telemetryPermissions },
    { name: 'snapshot_rls', critical: true, run: snapshotRls },
    { name: 'telemetry_consent', run: telemetryConsent },
    { name: 'long_notes', run: (clients) => longNotes(clients[1]) },
    { name: 'analysis_export', run: (clients) => analysisExport(clients[1]) },
    { name: 'keyboard', run: (clients) => keyboardNavigation(clients[1]) },
    { name: 'zoom', run: (clients) => zoomLayout(clients[1]) },
    { name: 'two_device_sync', run: (clients) => twoDeviceSync(clients[1]) },
  ];
}
