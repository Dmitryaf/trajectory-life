const MAX_INLINE_ASYNC_CONDITION_LENGTH = 100;

function countAwaitExpressions(node) {
  let count = 0;

  function visit(value) {
    if (!value || typeof value !== 'object') {
      return;
    }
    if (value.type === 'AwaitExpression') {
      count += 1;
    }
    for (const [key, child] of Object.entries(value)) {
      if (['parent', 'loc', 'range', 'tokens', 'comments'].includes(key)) {
        continue;
      }
      if (Array.isArray(child)) {
        child.forEach(visit);
      } else {
        visit(child);
      }
    }
  }

  visit(node);
  return count;
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require complex asynchronous conditions to use named intermediate values.',
    },
    messages: {
      extract: 'Сложное условие с await трудно читать и диагностировать. Сначала сохраните асинхронный результат в именованную переменную.',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function checkCondition(condition) {
      if (!condition) {
        return;
      }
      const awaitCount = countAwaitExpressions(condition);
      if (!awaitCount) {
        return;
      }
      const conditionLength = sourceCode.getText(condition).replace(/\s+/g, ' ').length;
      const isMultiline = condition.loc.start.line !== condition.loc.end.line;
      if (awaitCount > 1 || isMultiline || conditionLength > MAX_INLINE_ASYNC_CONDITION_LENGTH) {
        context.report({ node: condition, messageId: 'extract' });
      }
    }

    return {
      ConditionalExpression: (node) => checkCondition(node.test),
      DoWhileStatement: (node) => checkCondition(node.test),
      ForStatement: (node) => checkCondition(node.test),
      IfStatement: (node) => checkCondition(node.test),
      WhileStatement: (node) => checkCondition(node.test),
    };
  },
};
