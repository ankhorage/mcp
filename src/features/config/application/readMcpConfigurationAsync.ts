import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { McpConfiguration } from '../../../types/config.js';

/*** Read the explicit workspace MCP configuration, defaulting to a deny-all empty configuration. */
export async function readMcpConfigurationAsync(cwd: string): Promise<McpConfiguration> {
  const configurationPath = join(cwd, '.ankh', 'mcp.json');
  try {
    const value: unknown = JSON.parse(await readFile(configurationPath, 'utf8'));
    return parseMcpConfiguration(value, configurationPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

/*** Validate the small configuration shape before it becomes trusted server startup state. */
function parseMcpConfiguration(value: unknown, configurationPath: string): McpConfiguration {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`Invalid MCP configuration: ${configurationPath}`);
  const configuration = value as {
    readonly allowedAccounts?: unknown;
    readonly packages?: unknown;
  };
  if (
    (configuration.allowedAccounts !== undefined &&
      (!Array.isArray(configuration.allowedAccounts) ||
        !configuration.allowedAccounts.every(isAccountId))) ||
    (configuration.packages !== undefined &&
      (!Array.isArray(configuration.packages) || !configuration.packages.every(isPackageName)))
  )
    throw new Error(`Invalid MCP configuration: ${configurationPath}`);
  return {
    ...(configuration.allowedAccounts === undefined
      ? {}
      : { allowedAccounts: [...new Set(configuration.allowedAccounts)].toSorted() }),
    ...(configuration.packages === undefined
      ? {}
      : { packages: [...new Set(configuration.packages)].toSorted() }),
  };
}

/*** Permit non-empty account identities without imposing a provider-specific identifier format. */
function isAccountId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/*** Permit package identifiers only, never path-like provider targets. */
function isPackageName(value: unknown): value is string {
  return (
    typeof value === 'string' && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value)
  );
}
