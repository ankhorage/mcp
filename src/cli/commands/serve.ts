import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AnkhCommandExecutionRequest } from '@ankhorage/ankh';

import { discoverMcpIntegrationsAsync } from '../../features/discovery/application/discoverMcpIntegrationsAsync.js';
import { createMcpStdioServerAsync } from '../../features/transport/composition/createMcpStdioServerAsync.js';

/*** Serve configured provider tools over STDIO with explicit account scope only. */
export async function serve(request: AnkhCommandExecutionRequest): Promise<{ exitCode: number }> {
  try {
    const config = JSON.parse(
      await readFile(join(request.context.cwd, '.ankh', 'mcp.json'), 'utf8'),
    ) as { packages?: unknown };
    const packageNames = Array.isArray(config.packages)
      ? config.packages.filter((value): value is string => typeof value === 'string')
      : [];
    const integrations = await discoverMcpIntegrationsAsync({
      cwd: request.context.cwd,
      packageNames,
    });
    await createMcpStdioServerAsync({
      context: { actorId: 'stdio', allowedAccounts: [] },
      integrations,
      version: request.context.version,
    });
    return { exitCode: 0 };
  } catch (error) {
    request.context.writeStderr(
      `MCP server failed to initialize: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    return { exitCode: 1 };
  }
}
