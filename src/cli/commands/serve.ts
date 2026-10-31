import type { AnkhCommandExecutionRequest } from '@ankhorage/ankh';

import { readMcpConfigurationAsync } from '../../features/config/application/readMcpConfigurationAsync.js';
import { discoverMcpIntegrationsAsync } from '../../features/discovery/application/discoverMcpIntegrationsAsync.js';
import { loadMcpHostAsync } from '../../features/host/application/loadMcpHostAsync.js';
import { createMcpStdioServerAsync } from '../../features/transport/composition/createMcpStdioServerAsync.js';

/*** Serve configured provider tools over STDIO with explicit account scope only. */
export async function serve(request: AnkhCommandExecutionRequest): Promise<{ exitCode: number }> {
  try {
    const configuration = await readMcpConfigurationAsync(request.context.cwd);
    const integrations = await discoverMcpIntegrationsAsync({
      cwd: request.context.cwd,
      packageNames: configuration.packages ?? [],
    });
    const host = await loadMcpHostAsync({ env: request.context.env });
    await createMcpStdioServerAsync({
      ...(host?.auditSink === undefined ? {} : { auditSink: host.auditSink }),
      ...(host?.preparedWriteStore === undefined
        ? {}
        : { preparedWriteStore: host.preparedWriteStore }),
      context: host?.context ?? {
        actorId: 'stdio',
        allowedAccounts: configuration.allowedAccounts ?? [],
      },
      integrations,
      version: request.context.version,
    });
    return { exitCode: 0 };
  } catch {
    request.context.writeStderr('MCP server failed to initialize.\n');
    return { exitCode: 1 };
  }
}
