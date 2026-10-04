import { appendFileSync, readFileSync } from 'node:fs';
import { findProof, githubClient } from './github.mjs';
import { git, runtimeIdentity, summary, writeJson } from './runtime.mjs';

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const sha = git('rev-parse', 'HEAD');
const expectedSha = event.pull_request?.head.sha || process.env.GITHUB_SHA;
if (sha !== expectedSha) {
  throw new Error('Checkout does not match the event source commit');
}
const identity = runtimeIdentity();
if (event.pull_request) {
  const integration = git('merge-tree', '--write-tree', event.pull_request.base.sha, sha).split('\n')[0];
  if (integration !== identity.tree) {
    throw new Error('The target branch changes the candidate tree. Merge the current base into this branch before checking it.');
  }
}

let reuse = { reason: 'Full browser checks explicitly requested' };
if (process.env.FORCE_BROWSER_CHECKS !== 'true' && process.env.GITHUB_RUN_ATTEMPT === '1') {
  try {
    reuse = await findProof(githubClient(), identity, process.env.GITHUB_REPOSITORY, process.env.GITHUB_RUN_ID);
  } catch {
    reuse = { reason: 'Previous evidence could not be validated; full checks required' };
  }
}
writeJson('qa/ci/context.json', { sha, identity, reuse });
appendFileSync(process.env.GITHUB_OUTPUT, `reuse=${Boolean(reuse.runId)}\nproof_run=${reuse.runId || ''}\n`);
summary(`${reuse.reason}.\n\nSource: \`${sha}\`; tree: \`${identity.tree}\`; runner: \`${identity.imageVersion}\`.`);
console.log(reuse.reason);
