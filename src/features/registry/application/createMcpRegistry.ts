import type {
  McpAuditSink,
  McpIntegration,
  McpInvocationContext,
  McpPreparedWriteStore,
  McpReadTool,
  McpTool,
  McpToolExecutionContext,
  McpWriteTool,
} from '../../../types/public.js';
import { assertMcpJsonSchema } from './assertMcpJsonSchema.js';
import { claimMcpApprovedWriteAsync } from './claimMcpApprovedWriteAsync.js';
import { executeMcpClaimedWriteAsync } from './executeMcpClaimedWriteAsync.js';
import { isMcpToolIdentifier } from './isMcpToolIdentifier.js';
import { McpRequestError } from './McpRequestError.js';
import { prepareMcpWriteAsync } from './prepareMcpWriteAsync.js';
import { recordMcpAuditBestEffortAsync } from './recordMcpAuditBestEffortAsync.js';

export interface McpRegistry {
  closeAsync(): Promise<void>;
  executeAsync(
    toolId: string,
    input: Readonly<Record<string, unknown>>,
    context: McpInvocationContext,
  ): Promise<unknown>;
  prepareWriteAsync(
    toolId: string,
    input: Readonly<Record<string, unknown>>,
    context: McpInvocationContext,
  ): Promise<{ readonly approvalId: string; readonly expiresAt: string }>;
  listTools(): readonly RegisteredMcpTool[];
}
export type RegisteredMcpTool = Readonly<{ integrationId: string; tool: McpTool; toolId: string }>;
type RegisteredMcpWriteTool = RegisteredMcpTool & { readonly tool: McpWriteTool };
export interface CreateMcpRegistryOptions {
  readonly auditSink?: McpAuditSink;
  readonly integrations: readonly McpIntegration[];
  readonly preparedWriteStore?: McpPreparedWriteStore;
}

/** Create the provider-neutral runtime; write execution is impossible without a trusted host store. */
export function createMcpRegistry(options: CreateMcpRegistryOptions): McpRegistry {
  const registeredTools = registerTools(options.integrations);
  const toolsById = new Map(registeredTools.map((tool) => [tool.toolId, tool]));
  return {
    closeAsync: async () => {
      for (const integration of options.integrations) await integration.closeAsync?.();
    },
    listTools: () => registeredTools,
    prepareWriteAsync: async (toolId, input, context) => {
      const registered = toolsById.get(toolId);
      if (!isRegisteredWriteTool(registered))
        throw new McpRequestError('MCP request denied: write-tool-not-found');
      if (options.preparedWriteStore === undefined)
        throw new McpRequestError('Write tools require a trusted prepared-write host.');
      assertMcpJsonSchema(input, registered.tool.inputSchema, 'input');
      return await prepareMcpWriteAsync({
        context,
        executeInput: input,
        preparedWriteStore: options.preparedWriteStore,
        tool: registered.tool,
        toolId: registered.toolId,
      });
    },
    executeAsync: async (toolId, input, context) => {
      const registered = toolsById.get(toolId);
      if (registered === undefined) throw new McpRequestError('MCP request denied: unknown-tool');
      if (registered.tool.risk === 'read')
        return await executeReadAsync(
          registered.tool,
          registered.toolId,
          input,
          context,
          options.auditSink,
        );
      if (isRegisteredWriteTool(registered))
        return await executeWriteAsync(registered, input, context, options);
      throw new McpRequestError('MCP request denied: unknown-tool');
    },
  };
}

/** Execute a read after account authorization; reads never need a host. */
async function executeReadAsync(
  tool: McpReadTool,
  toolId: string,
  input: Readonly<Record<string, unknown>>,
  context: McpInvocationContext,
  auditSink: McpAuditSink | undefined,
): Promise<unknown> {
  assertMcpJsonSchema(input, tool.inputSchema, 'input');
  if (tool.scope === 'account') getAccountId(tool, input, context);
  try {
    return await tool.executeAsync(input, context);
  } catch {
    await recordMcpAuditBestEffortAsync(auditSink, {
      accountId: null,
      actorId: context.actorId,
      errorCode: 'execution-rejected',
      outcome: 'failed',
      risk: 'read',
      toolId,
    });
    throw new McpRequestError('MCP tool execution failed.');
  }
}

/** Claim an externally approved immutable proposal once, then make at most one provider call. */
async function executeWriteAsync(
  registered: RegisteredMcpWriteTool,
  input: Readonly<Record<string, unknown>>,
  context: McpInvocationContext,
  options: CreateMcpRegistryOptions,
): Promise<unknown> {
  const claimed = await claimMcpApprovedWriteAsync({
    context,
    executeInput: input,
    preparedWriteStore: options.preparedWriteStore,
    toolId: registered.toolId,
  });
  const executionContext: McpToolExecutionContext = {
    ...context,
    executionClaim: claimed.executionClaim,
  };
  return await executeMcpClaimedWriteAsync({
    auditSink: options.auditSink,
    claimed,
    context: executionContext,
    preparedWriteStore: options.preparedWriteStore,
    tool: registered.tool,
  });
}

/** Enforce an account identity derived only from the provider input during preparation. */
function getAccountId(
  tool: McpReadTool | McpWriteTool,
  input: Readonly<Record<string, unknown>>,
  context: McpInvocationContext,
): string {
  if (tool.scope !== 'account' || tool.accountId === undefined)
    throw new McpRequestError('MCP request denied: missing-account-identity');
  const accountId = tool.accountId(input);
  if (accountId === null) throw new McpRequestError('MCP request denied: missing-account-identity');
  if (!context.allowedAccounts.includes(accountId))
    throw new McpRequestError('MCP request denied: account-not-allowed');
  return accountId;
}

/** Narrow a registered descriptor at the discriminated provider tool boundary. */
function isRegisteredWriteTool(
  registered: RegisteredMcpTool | undefined,
): registered is RegisteredMcpWriteTool {
  return registered?.tool.risk === 'write';
}
function registerTools(integrations: readonly McpIntegration[]): readonly RegisteredMcpTool[] {
  const integrationIds = new Set<string>();
  const tools = integrations.flatMap((integration) => {
    if (!isMcpToolIdentifier(integration.id) || integrationIds.has(integration.id))
      throw new Error(`Invalid or duplicate MCP integration identifier: ${integration.id}`);
    integrationIds.add(integration.id);
    return integration.tools.map((tool) => {
      if (!isMcpToolIdentifier(tool.id))
        throw new Error(`Invalid MCP tool identifier: ${integration.id}.${tool.id}`);
      return {
        integrationId: integration.id,
        tool,
        toolId: `${integration.id}.${tool.id}`,
      };
    });
  });
  if (tools.some(({ toolId }) => isReservedLifecycleToolIdentifier(toolId)))
    throw new Error('MCP tool identifier conflicts with a reserved write lifecycle suffix');
  if (new Set(tools.map(({ toolId }) => toolId)).size !== tools.length)
    throw new Error('Duplicate MCP tool identifier');
  return tools.toSorted((a, b) => a.toolId.localeCompare(b.toolId));
}

/** Reserve protocol-owned suffixes so a provider cannot shadow a write lifecycle tool. */
function isReservedLifecycleToolIdentifier(toolId: string): boolean {
  return toolId.endsWith('.prepare') || toolId.endsWith('.execute');
}
