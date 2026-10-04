import { availableParallelism } from 'node:os';
import { runtimeIdentity, summary, writeJson } from './runtime.mjs';

export default class BrowserReporter {
  onBegin(config, suite) {
    this.config = config;
    this.suite = suite;
    this.started = Date.now();
  }

  onEnd(result) {
    const tests = this.suite.allTests().map((test) => ({
      title: test.titlePath().join(' > '),
      outcome: test.outcome(),
      budgetMs: test.timeout,
      attempts: test.results.map((attempt) => ({ status: attempt.status, durationMs: attempt.duration, retry: attempt.retry })),
    }));
    const job = process.env.BROWSER_JOB || 'local';
    const report = {
      job,
      identity: runtimeIdentity(),
      status: result.status,
      elapsedMs: Date.now() - this.started,
      cpus: availableParallelism(),
      workers: this.config.workers,
      passed: tests.filter((test) => test.outcome === 'expected').length,
      failed: tests.filter((test) => test.outcome === 'unexpected').length,
      flaky: tests.filter((test) => test.outcome === 'flaky').length,
      skipped: tests.filter((test) => test.outcome === 'skipped').length,
      interrupted: tests.filter((test) => test.attempts.some((attempt) => attempt.status === 'interrupted')).length,
      tests,
    };
    writeJson(`qa/ci/${job}.json`, report);
    const slowest = tests
      .map((test) => ({ ...test, duration: Math.max(0, ...test.attempts.map((attempt) => attempt.durationMs)) }))
      .sort((left, right) => right.duration - left.duration)
      .slice(0, 10);
    summary(
      `### ${job}\n${report.passed} passed; ${report.failed} failed; ${report.flaky} flaky; ${report.skipped} skipped.\n\n| Scenario | Seconds | Test budget used |\n| --- | ---: | ---: |\n${slowest.map((test) => `| ${test.title.replaceAll('|', '/')} | ${(test.duration / 1000).toFixed(1)} | ${Math.round((test.duration / test.budgetMs) * 100)}% |`).join('\n')}`,
    );
  }
}
