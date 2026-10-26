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
