import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDevelopmentRollbackGraph } from './deploy.mjs';
const previousGraph = [
  { path: '/assets/cloud.js', hash: 'a'.repeat(64) },
  { path: '/assets/index.css', hash: 'b'.repeat(64) },
];
const valid = {
  branch: 'develop',
  deploymentId: 'dpl_previous',
  previousId: 'dpl_previous',
  aliasId: 'dpl_previous',
  previousGraph,
  aliasGraph: structuredClone(previousGraph),
};

test('staging compensation accepts independently captured full predecessor graph with exact alias ownership', () => {
  assert.doesNotThrow(() => assertDevelopmentRollbackGraph(valid));
});

test('canonical predecessor proof cannot validate production, a new candidate or a foreign alias', () => {
  for (const delta of [
    { branch: 'main' },
    { deploymentId: 'dpl_candidate' },
    { aliasId: 'dpl_foreign' },
    { deploymentId: undefined, previousId: undefined, aliasId: undefined },
  ]) {
    assert.throws(() => assertDevelopmentRollbackGraph({ ...valid, ...delta }));
  }
});

test('missing, changed, incomplete and reordered full predecessor inventories refuse', () => {
  for (const delta of [
    { previousGraph: undefined },
    { previousGraph: [] },
    { aliasGraph: [{ ...previousGraph[0], hash: 'c'.repeat(64) }, previousGraph[1]] },
    { aliasGraph: [previousGraph[0]] },
    { aliasGraph: [...previousGraph].reverse() },
  ]) {
    assert.throws(() => assertDevelopmentRollbackGraph({ ...valid, ...delta }));
  }
});
