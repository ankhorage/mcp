import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { loadMcpHostAsync } from './loadMcpHostAsync.js';

test('loads verified write composition only from the process-owned module path', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ankhorage-mcp-host-'));
  const modulePath = join(directory, 'host.mjs');
  try {
    await writeFile(
      modulePath,
      "export async function createMcpHostAsync() { return { context: { actorId: 'operator', allowedAccounts: ['8810770460'] }, approvalVerifier: { verifyAndConsumeAsync: async () => true }, auditSink: { recordAsync: async () => {} } }; }\n",
      'utf8',
    );
    const host = await loadMcpHostAsync({ env: { ANKH_MCP_HOST_MODULE: modulePath } });
    expect(host?.context).toEqual({ actorId: 'operator', allowedAccounts: ['8810770460'] });
    expect(
      await host?.approvalVerifier?.verifyAndConsumeAsync({
        accountId: '8810770460',
        actorId: 'operator',
        change: { after: {}, before: {}, resourceId: 'resource' },
        expiresAt: '2026-10-29T00:00:00.000Z',
        fingerprint: 'fingerprint',
        operation: 'operation',
        toolId: 'google-ads.mutation',
      }),
    ).toBe(true);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('leaves read-only STDIO available when no host is configured', async () => {
  expect(await loadMcpHostAsync({ env: {} })).toBeUndefined();
});

test('rejects a relative host module target', () => {
  return expect(loadMcpHostAsync({ env: { ANKH_MCP_HOST_MODULE: './host.mjs' } })).rejects.toThrow(
    'must be an absolute local path',
  );
});

test('fails closed for malformed privileged host configuration', () => {
  const hosts = [
    '{}',
    '{ context: null }',
    "{ context: { actorId: 'operator', allowedAccounts: [] }, transactionalApprovalConsumers: {} }",
    "{ auditSink: null, context: { actorId: 'operator', allowedAccounts: [] } }",
    "{ approvalVerifier: { verifyAndConsumeAsync: true }, context: { actorId: 'operator', allowedAccounts: [] } }",
    "{ context: { actorId: 'operator', allowedAccounts: [] }, transactionalApprovalConsumers: [{ consumeApprovalAndCreateIntentAsync: () => Promise.resolve({ approvalId: 'approval-1' }), toolIds: ['google-ads.mutation', 'google-ads.mutation'] }] }",
    "{ context: { actorId: 'operator', allowedAccounts: [] }, transactionalApprovalConsumers: [{ consumeApprovalAndCreateIntentAsync: () => Promise.resolve({ approvalId: 'approval-1' }), toolIds: ['not a tool id'] }] }",
  ];
  return Promise.all(hosts.map(assertInvalidHostAsync));
});

/** Assert that untrusted host configuration cannot initialize the privileged composition. */
async function assertInvalidHostAsync(host: string): Promise<void> {
  try {
    await loadHostAsync(host);
  } catch (error) {
    expect(error).toHaveProperty('message', 'MCP host is invalid.');
    return;
  }
  throw new Error('Expected an invalid host rejection.');
}

/** Write a temporary host module so runtime shape checks exercise the loaded module boundary. */
async function loadHostAsync(host: string) {
  const directory = await mkdtemp(join(tmpdir(), 'ankhorage-mcp-host-invalid-'));
  const modulePath = join(directory, 'host.mjs');
  try {
    await writeFile(
      modulePath,
      `export async function createMcpHostAsync() { return ${host}; }\n`,
      'utf8',
    );
    return await loadMcpHostAsync({ env: { ANKH_MCP_HOST_MODULE: modulePath } });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
