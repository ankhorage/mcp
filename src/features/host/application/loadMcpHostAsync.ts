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
    isMcpApprovalVerifier(host.approvalVerifier) &&
    isMcpAuditSink(host.auditSink) &&
    isMcpTransactionalApprovalConsumers(host.transactionalApprovalConsumers)
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

/** Verify the optional approval dependency without invoking untrusted host properties. */
function isMcpApprovalVerifier(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { readonly verifyAndConsumeAsync?: unknown }).verifyAndConsumeAsync ===
      'function'
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

/** Require a well-formed, unique full tool identifier for every host transactional binding. */
function isMcpTransactionalApprovalConsumers(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  const toolIds: string[] = [];
  for (const consumer of value) {
    if (!isMcpTransactionalApprovalConsumer(consumer)) return false;
    toolIds.push(...consumer.toolIds);
  }
  return new Set(toolIds).size === toolIds.length;
}

/** Check the shape of a host-owned transactional approval consumer. */
function isMcpTransactionalApprovalConsumer(value: unknown): value is {
  readonly consumeApprovalAndCreateIntentAsync: unknown;
  readonly toolIds: readonly string[];
} {
  if (typeof value !== 'object' || value === null) return false;
  const consumer = value as {
    readonly consumeApprovalAndCreateIntentAsync?: unknown;
    readonly toolIds?: unknown;
  };
  return (
    Array.isArray(consumer.toolIds) &&
    consumer.toolIds.every(isMcpFullToolIdentifier) &&
    typeof consumer.consumeApprovalAndCreateIntentAsync === 'function'
  );
}

/** Restrict host bindings to complete provider-qualified MCP tool identifiers. */
function isMcpFullToolIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/.test(value);
}

/*** Check the sole public factory expected from the trusted local host module. */
function isMcpHostModule(value: unknown): value is McpHostModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as McpHostModule).createMcpHostAsync === 'function'
  );
}
