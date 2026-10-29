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
  const host = await candidate.createMcpHostAsync();
  if (!isMcpHost(host)) throw new Error('MCP host is invalid.');
  return host;
}

/*** Check that a trusted host exposes only the composition required by the MCP runtime. */
function isMcpHost(value: unknown): value is McpHost {
  if (typeof value !== 'object' || value === null) return false;
  const host = value as McpHost;
  return (
    typeof host.context.actorId === 'string' &&
    host.context.actorId.trim().length > 0 &&
    Array.isArray(host.context.allowedAccounts) &&
    host.context.allowedAccounts.every((accountId) => typeof accountId === 'string') &&
    (host.approvalVerifier === undefined ||
      typeof host.approvalVerifier.verifyAndConsumeAsync === 'function') &&
    (host.auditSink === undefined || typeof host.auditSink.recordAsync === 'function')
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
