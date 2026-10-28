import type { AnkhCommandExecutionRequest } from '@ankhorage/ankh';

import { readMcpConfigurationAsync } from '../../features/config/application/readMcpConfigurationAsync.js';
import { discoverMcpIntegrationsAsync } from '../../features/discovery/application/discoverMcpIntegrationsAsync.js';
import { createMcpStdioServerAsync } from '../../features/transport/composition/createMcpStdioServerAsync.js';

/*** Serve configured provider tools over STDIO with explicit account scope only. */
export async function serve(request: AnkhCommandExecutionRequest): Promise<{ exitCode: number }> {
  try {
    const configuration = await readMcpConfigurationAsync(request.context.cwd);
    const integrations = await discoverMcpIntegrationsAsync({
      cwd: request.context.cwd,
      packageNames: configuration.packages ?? [],
    });
    await createMcpStdioServerAsync({
      context: { actorId: 'stdio', allowedAccounts: configuration.allowedAccounts ?? [] },
      integrations,
      version: request.context.version,
    });
    return { exitCode: 0 };
  } catch {
    request.context.writeStderr('MCP server failed to initialize.\n');
    return { exitCode: 1 };
  }
}
