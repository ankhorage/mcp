import type { McpTransactionalApprovalConsumer } from '../../../types/public.js';
import type { RegisteredMcpTool } from './createMcpRegistry.js';

/** Bind only host-configured write tools to trusted transactional approval consumers. */
export function registerTransactionalApprovalConsumers(
  registeredTools: readonly RegisteredMcpTool[],
  consumers: readonly McpTransactionalApprovalConsumer[],
): ReadonlyMap<string, McpTransactionalApprovalConsumer> {
  const toolsById = new Map(registeredTools.map((tool) => [tool.toolId, tool]));
  const registeredConsumers = new Map<string, McpTransactionalApprovalConsumer>();
  for (const consumer of consumers)
    for (const toolId of consumer.toolIds) {
      const tool = toolsById.get(toolId);
      if (tool?.tool.risk !== 'write' || registeredConsumers.has(toolId))
        throw new Error(`Invalid transactional approval consumer tool: ${toolId}`);
      registeredConsumers.set(toolId, consumer);
    }
  return registeredConsumers;
}
