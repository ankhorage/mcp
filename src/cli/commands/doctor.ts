import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AnkhCommandExecutionRequest } from '@ankhorage/ankh';

import { discoverMcpIntegrationsAsync } from '../../features/discovery/application/discoverMcpIntegrationsAsync.js';

/*** Validate configured package discovery and print diagnostics only to stderr. */
export async function doctor(request: AnkhCommandExecutionRequest): Promise<{ exitCode: number }> {
  const configPath = join(request.context.cwd, '.ankh', 'mcp.json');
  try {
    const config = JSON.parse(await readFile(configPath, 'utf8')) as { packages?: unknown };
    const packageNames = Array.isArray(config.packages)
      ? config.packages.filter((value): value is string => typeof value === 'string')
      : [];
    const integrations = await discoverMcpIntegrationsAsync({
      cwd: request.context.cwd,
      packageNames,
    });
    request.context.writeStdout(
      `${integrations
        .map((integration) => integration.id)
        .toSorted()
        .join('\n')}\n`,
    );
    for (const integration of integrations) await integration.closeAsync?.();
    return { exitCode: 0 };
  } catch (error) {
    request.context.writeStderr(
      `MCP doctor failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    return { exitCode: 1 };
  }
}
