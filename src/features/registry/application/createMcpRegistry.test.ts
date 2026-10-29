import { expect, test } from 'bun:test';

import { createMcpRegistry } from './createMcpRegistry.js';

const readIntegration = {
  id: 'example',
  tools: [
    {
      accountId: (input: Readonly<Record<string, unknown>>) => input.accountId as string,
      description: 'Read one account.',
      executeAsync: () => Promise.resolve({ ok: true }),
      id: 'read',
      inputSchema: {
        properties: { accountId: { type: 'string' } },
        required: ['accountId'],
        type: 'object',
      } as const,
      risk: 'read' as const,
      scope: 'account' as const,
      title: 'Read',
    },
  ],
};

const [readTool] = readIntegration.tools;

if (readTool === undefined) throw new Error('read fixture is missing');

test('rejects an account outside the invocation scope', () => {
  const registry = createMcpRegistry({ integrations: [readIntegration] });
  return expect(
    registry.executeAsync(
      'example.read',
      { accountId: 'other' },
      { actorId: 'test', allowedAccounts: ['allowed'] },
    ),
  ).rejects.toThrow('account-not-allowed');
});

test('never executes writes without external approval', () => {
  const registry = createMcpRegistry({
    integrations: [{ ...readIntegration, tools: [{ ...readTool, id: 'write', risk: 'write' }] }],
  });
  return expect(
    registry.executeAsync(
      'example.write',
      { accountId: 'allowed' },
      { actorId: 'test', allowedAccounts: ['allowed'] },
    ),
  ).rejects.toThrow('externally issued');
});

test('rejects a write before mutation when its required audit intent cannot be recorded', async () => {
  let executed = false;
  const registry = createMcpRegistry({
    approvalVerifier: { verifyAndConsumeAsync: () => Promise.resolve(true) },
    auditSink: { recordAsync: () => Promise.reject(new Error('audit unavailable')) },
    integrations: [
      {
        ...readIntegration,
        tools: [
          {
            ...readTool,
            describeChangeAsync: () =>
              Promise.resolve({ after: {}, before: {}, resourceId: 'test' }),
            executeAsync: () => {
              executed = true;
              return Promise.resolve({ ok: true });
            },
            id: 'write',
            risk: 'write',
            verifyExpectedStateAsync: () => Promise.resolve(true),
          },
        ],
      },
    ],
  });
  await expectFailureAsync(
    registry.executeAsync(
      'example.write',
      { accountId: 'allowed' },
      { actorId: 'test', allowedAccounts: ['allowed'] },
    ),
    'durable audit recording is unavailable',
  );
  expect(executed).toBe(false);
});

test('records durable write intent and success after a valid approval', async () => {
  const outcomes: string[] = [];
  const registry = createMcpRegistry({
    approvalVerifier: { verifyAndConsumeAsync: () => Promise.resolve(true) },
    auditSink: {
      recordAsync: (event) => {
        outcomes.push(event.outcome);
        return Promise.resolve();
      },
    },
    integrations: [
      {
        ...readIntegration,
        tools: [
          {
            ...readTool,
            describeChangeAsync: () =>
              Promise.resolve({ after: {}, before: {}, resourceId: 'test' }),
            id: 'write',
            risk: 'write',
            verifyExpectedStateAsync: () => Promise.resolve(true),
          },
        ],
      },
    ],
  });
  expect(
    await registry.executeAsync(
      'example.write',
      { accountId: 'allowed' },
      { actorId: 'test', allowedAccounts: ['allowed'] },
    ),
  ).toEqual({ ok: true });
  expect(outcomes).toEqual(['intent', 'executed']);
});

test('records a durable failure outcome without exposing provider failures', async () => {
  const outcomes: string[] = [];
  const registry = createMcpRegistry({
    approvalVerifier: { verifyAndConsumeAsync: () => Promise.resolve(true) },
    auditSink: {
      recordAsync: (event) => {
        outcomes.push(event.outcome);
        return Promise.resolve();
      },
    },
    integrations: [
      {
        ...readIntegration,
        tools: [
          {
            ...readTool,
            describeChangeAsync: () =>
              Promise.resolve({ after: {}, before: {}, resourceId: 'test' }),
            executeAsync: () => Promise.reject(new Error('provider-secret')),
            id: 'write',
            risk: 'write',
            verifyExpectedStateAsync: () => Promise.resolve(true),
          },
        ],
      },
    ],
  });
  await expectFailureAsync(
    registry.executeAsync(
      'example.write',
      { accountId: 'allowed' },
      { actorId: 'test', allowedAccounts: ['allowed'] },
    ),
    'MCP tool execution failed.',
  );
  expect(outcomes).toEqual(['intent', 'indeterminate']);
});

test('reports an unrecorded write outcome after mutation when its terminal audit record fails', async () => {
  let executed = false;
  const registry = createMcpRegistry({
    approvalVerifier: { verifyAndConsumeAsync: () => Promise.resolve(true) },
    auditSink: {
      recordAsync: (event) =>
        event.outcome === 'executed'
          ? Promise.reject(new Error('audit unavailable'))
          : Promise.resolve(),
    },
    integrations: [
      {
        ...readIntegration,
        tools: [
          {
            ...readTool,
            describeChangeAsync: () =>
              Promise.resolve({ after: {}, before: {}, resourceId: 'test' }),
            executeAsync: () => {
              executed = true;
              return Promise.resolve({ ok: true });
            },
            id: 'write',
            risk: 'write',
            verifyExpectedStateAsync: () => Promise.resolve(true),
          },
        ],
      },
    ],
  });
  await expectFailureAsync(
    registry.executeAsync(
      'example.write',
      { accountId: 'allowed' },
      { actorId: 'test', allowedAccounts: ['allowed'] },
    ),
    'write outcome could not be durably recorded',
  );
  expect(executed).toBe(true);
});

test('rejects an account-scoped tool when its provider cannot identify an account', () => {
  const registry = createMcpRegistry({
    integrations: [{ ...readIntegration, tools: [{ ...readTool, accountId: () => null }] }],
  });
  return expect(
    registry.executeAsync(
      'example.read',
      { accountId: 'allowed' },
      { actorId: 'test', allowedAccounts: ['allowed'] },
    ),
  ).rejects.toThrow('missing-account-identity');
});

test('permits explicitly global read-only tools without account scope', async () => {
  const registry = createMcpRegistry({
    integrations: [
      {
        id: 'global',
        tools: [
          {
            description: 'Read global metadata.',
            executeAsync: () => Promise.resolve({ ok: true }),
            id: 'metadata',
            inputSchema: { additionalProperties: false, type: 'object' },
            risk: 'read',
            scope: 'global',
            title: 'Metadata',
          },
        ],
      },
    ],
  });
  expect(
    await registry.executeAsync('global.metadata', {}, { actorId: 'test', allowedAccounts: [] }),
  ).toEqual({
    ok: true,
  });
});

test('recursively validates nested inputs, unexpected properties, and outputs', async () => {
  const tool = {
    ...readTool,
    executeAsync: () => Promise.resolve({ nested: { count: 'wrong' } }),
    inputSchema: {
      additionalProperties: false,
      properties: {
        accountId: { type: 'string' },
        nested: {
          additionalProperties: false,
          properties: { enabled: { type: 'boolean' } },
          required: ['enabled'],
          type: 'object',
        },
      },
      required: ['accountId', 'nested'],
      type: 'object',
    } as const,
    outputSchema: {
      properties: {
        nested: { properties: { count: { type: 'integer' } }, required: ['count'], type: 'object' },
      },
      required: ['nested'],
      type: 'object',
    } as const,
  };
  const registry = createMcpRegistry({ integrations: [{ ...readIntegration, tools: [tool] }] });
  const context = { actorId: 'test', allowedAccounts: ['allowed'] };
  await expectFailureAsync(
    registry.executeAsync('example.read', { accountId: 'allowed', nested: {} }, context),
    'input.nested is missing required property: enabled',
  );
  await expectFailureAsync(
    registry.executeAsync(
      'example.read',
      { accountId: 'allowed', nested: { enabled: true, unexpected: true } },
      context,
    ),
    'input.nested has unknown property: unexpected',
  );
  await expectFailureAsync(
    registry.executeAsync(
      'example.read',
      { accountId: 'allowed', nested: { enabled: true } },
      context,
    ),
    'output.nested.count must be integer',
  );
});

async function expectFailureAsync(promise: Promise<unknown>, message: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain(message);
}
