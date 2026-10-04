import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import readableAsyncCondition from '../../scripts/eslint-rules/readable-async-condition.mjs';

function verify(code) {
  const linter = new Linter();

  return linter.verify(code, [
    {
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      plugins: {
        trajectory: {
          rules: {
            'readable-async-condition': readableAsyncCondition,
          },
        },
      },
      rules: {
        'trajectory/readable-async-condition': 'error',
      },
    },
  ]);
}

describe('readable-async-condition', () => {
  it('allows a short condition with one asynchronous call', () => {
    expect(verify('async function run() { if (await canSave()) { return; } }')).toEqual([]);
  });

  it('rejects a condition with several asynchronous calls', () => {
    const messages = verify('async function run() { if ((await isReady()) && (await hasChanges())) { return; } }');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe('trajectory/readable-async-condition');
  });

  it('rejects a long asynchronous condition', () => {
    const messages = verify(
      'async function run() { if (await hasPermissionToSynchronizeAllChangedDailyEntriesFromAnotherAuthorizedDeviceWithoutOverwritingNewerLocalData()) { return; } }',
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe('trajectory/readable-async-condition');
  });

  it('rejects a multiline asynchronous condition', () => {
    const messages = verify(`async function run() {
      if (await canSave(
        currentEntry,
      )) { return; }
    }`);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe('trajectory/readable-async-condition');
  });
});
