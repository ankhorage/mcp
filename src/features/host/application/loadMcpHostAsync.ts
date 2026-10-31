import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { McpHost, McpHostModule } from '../../../types/public.js';

const MCP_HOST_MODULE_ENVIRONMENT_VARIABLE = 'ANKH_MCP_HOST_MODULE';

/*** Load optional privileged composition from a process-owned absolute module path. */
export async function loadMcpHostAsync(input: {
  readonly env: Readonly<Record<string, string | undefined>>;
}): Promise<McpHost | undefined> {
  const configuredPath = new Map(Object.entries(input.env))
    .get(MCP_HOST_MODULE_ENVIRONMENT_VARIABLE)
    ?.trim();
  if (configuredPath === undefined || configuredPath.length === 0) return undefined;
  if (!isAbsolute(configuredPath))
    throw new Error(`${MCP_HOST_MODULE_ENVIRONMENT_VARIABLE} must be an absolute local path.`);
  const modulePath = resolve(configuredPath);
  await access(modulePath, constants.R_OK);
  let candidate: unknown;
  try {
    candidate = await import(pathToFileURL(modulePath).href);
  } catch {
    throw new Error('MCP host module could not be imported.');
  }
  if (!isMcpHostModule(candidate)) throw new Error('MCP host module is invalid.');
  const host = await createMcpHostAsync(candidate);
  if (!isMcpHost(host)) throw new Error('MCP host is invalid.');
  return host;
}

/** Create one trusted host while preventing host implementation errors from escaping the boundary. */
async function createMcpHostAsync(module: McpHostModule): Promise<unknown> {
  try {
    return await module.createMcpHostAsync();
  } catch {
    throw new Error('MCP host module could not create a valid host.');
  }
}

/*** Check that a trusted host exposes only the composition required by the MCP runtime. */
function isMcpHost(value: unknown): value is McpHost {
  if (typeof value !== 'object' || value === null) return false;
  const host = value as McpHost;
  return (
    isMcpInvocationContext(host.context) &&
    isMcpAuditSink(host.auditSink) &&
    isMcpPreparedWriteStore(host.preparedWriteStore)
  );
}

/** Verify the host-owned invocation identity before it reaches authorization. */
function isMcpInvocationContext(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const context = value as { readonly actorId?: unknown; readonly allowedAccounts?: unknown };
  return (
    typeof context.actorId === 'string' &&
    context.actorId.trim().length > 0 &&
    Array.isArray(context.allowedAccounts) &&
    context.allowedAccounts.every((accountId) => typeof accountId === 'string' && accountId !== '')
  );
}

/** Verify the optional durable audit dependency without invoking untrusted host properties. */
function isMcpAuditSink(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { readonly recordAsync?: unknown }).recordAsync === 'function'
  );
}

/** Verify the host-owned prepared-write capability without invoking untrusted host methods. */
function isMcpPreparedWriteStore(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  const store = value as {
    readonly createPreparedWriteAsync?: unknown;
    readonly claimApprovedWriteAndCreateIntentAsync?: unknown;
  };
  return (
    typeof store.createPreparedWriteAsync === 'function' &&
    typeof store.claimApprovedWriteAndCreateIntentAsync === 'function'
  );
}

/*** Check the sole public factory expected from the trusted local host module. */
function isMcpHostModule(value: unknown): value is McpHostModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as McpHostModule).createMcpHostAsync === 'function'
  );
}
