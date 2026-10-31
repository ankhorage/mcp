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
import { createMcpApprovalFingerprint } from './createMcpApprovalFingerprint.js';
import { createMcpApprovalProposalAsync } from './createMcpApprovalProposalAsync.js';
import { McpRequestError } from './McpRequestError.js';
import { recordMcpAuditBestEffortAsync } from './recordMcpAuditBestEffortAsync.js';
import { recordMcpAuditRequiredAsync } from './recordMcpAuditRequiredAsync.js';

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
      const accountId = getAccountId(registered.tool, input, context);
      const prepared = await registered.tool.prepareWriteAsync(input, context);
      const proposal = createMcpApprovalProposalAsync({
        accountId,
        context,
        prepared,
        tool: registered,
      });
      const stored = await options.preparedWriteStore.createPreparedWriteAsync(proposal);
      if (
        !sameProposal(stored.proposal, proposal) ||
        stored.snapshotFingerprint !== createMcpApprovalFingerprint(proposal)
      )
        throw new McpRequestError('Prepared write storage did not preserve the original proposal.');
      return { approvalId: stored.approvalId, expiresAt: stored.expiresAt };
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
  const claimed = await claimApprovedWriteAsync(
    registered,
    input,
    context,
    options.preparedWriteStore,
  );
  const executionContext: McpToolExecutionContext = {
    ...context,
    executionClaim: claimed.executionClaim,
  };
  const writeTool = registered.tool;
  if (!(await writeTool.verifyPreparedWriteAsync(claimed.proposal, executionContext)))
    throw new McpRequestError(
      'Write approval is stale because provider state no longer matches the proposal.',
    );
  await recordMcpAuditRequiredAsync(options.auditSink, {
    accountId: claimed.proposal.accountId,
    actorId: context.actorId,
    outcome: 'intent',
    risk: 'write',
    toolId: registered.toolId,
  });
  return await executeClaimedWriteAsync(
    writeTool,
    registered.toolId,
    claimed,
    executionContext,
    options.auditSink,
  );
}

/** Invoke a claimed provider operation once and leave a durable terminal outcome for reconciliation. */
async function executeClaimedWriteAsync(
  writeTool: McpWriteTool,
  toolId: string,
  claimed: NonNullable<
    Awaited<ReturnType<McpPreparedWriteStore['claimApprovedWriteAndCreateIntentAsync']>>
  >,
  context: McpToolExecutionContext,
  auditSink: McpAuditSink | undefined,
): Promise<unknown> {
  try {
    const output = await writeTool.executePreparedWriteAsync(claimed.proposal, context);
    if (writeTool.outputSchema !== undefined)
      assertMcpJsonSchema(output, writeTool.outputSchema, 'output');
    await recordMcpAuditRequiredAsync(auditSink, {
      accountId: claimed.proposal.accountId,
      actorId: context.actorId,
      outcome: writeTool.auditOutcome?.(output) ?? 'executed',
      risk: 'write',
      toolId,
    });
    return output;
  } catch (error) {
    await recordMcpAuditRequiredAsync(auditSink, {
      accountId: claimed.proposal.accountId,
      actorId: context.actorId,
      outcome: 'indeterminate',
      risk: 'write',
      toolId,
    });
    if (error instanceof McpRequestError) throw error;
    throw new McpRequestError('MCP tool execution failed.');
  }
}

/** Consume one human-approved proposal and create its durable execution intent before any provider call. */
async function claimApprovedWriteAsync(
  registered: RegisteredMcpWriteTool,
  input: Readonly<Record<string, unknown>>,
  context: McpInvocationContext,
  store: McpPreparedWriteStore | undefined,
): Promise<
  NonNullable<Awaited<ReturnType<McpPreparedWriteStore['claimApprovedWriteAndCreateIntentAsync']>>>
> {
  const { approvalId } = input;
  if (typeof approvalId !== 'string' || Object.keys(input).length !== 1)
    throw new McpRequestError('Write execution accepts only an approvalId.');
  if (store === undefined)
    throw new McpRequestError('Write tools require a trusted prepared-write host.');
  let claimed: Awaited<ReturnType<McpPreparedWriteStore['claimApprovedWriteAndCreateIntentAsync']>>;
  try {
    claimed = await store.claimApprovedWriteAndCreateIntentAsync({
      approvalId,
      toolId: registered.toolId,
    });
  } catch {
    throw new McpRequestError(
      'MCP write rejected because prepared-write persistence is unavailable.',
    );
  }
  if (
    claimed === null ||
    !sameStoredWrite(registered, claimed) ||
    claimed.proposal.actorId !== context.actorId ||
    !context.allowedAccounts.includes(claimed.proposal.accountId)
  )
    throw new McpRequestError(
      'The supplied approval is denied, expired, replayed, or bound to another operation.',
    );
  return claimed;
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
function sameProposal(left: unknown, right: unknown): boolean {
  return createMcpApprovalFingerprint(left) === createMcpApprovalFingerprint(right);
}
function sameStoredWrite(
  registered: RegisteredMcpWriteTool,
  claimed: Awaited<ReturnType<McpPreparedWriteStore['claimApprovedWriteAndCreateIntentAsync']>>,
): claimed is NonNullable<typeof claimed> {
  return (
    claimed !== null &&
    claimed.proposal.toolId === registered.toolId &&
    claimed.proposal.operation.length > 0 &&
    claimed.proposal.change.resourceId.length > 0 &&
    claimed.snapshotFingerprint === createMcpApprovalFingerprint(claimed.proposal)
  );
}

/** Narrow a registered descriptor at the discriminated provider tool boundary. */
function isRegisteredWriteTool(
  registered: RegisteredMcpTool | undefined,
): registered is RegisteredMcpWriteTool {
  return registered?.tool.risk === 'write';
}
function registerTools(integrations: readonly McpIntegration[]): readonly RegisteredMcpTool[] {
  const tools = integrations.flatMap((integration) =>
    integration.tools.map((tool) => ({
      integrationId: integration.id,
      tool,
      toolId: `${integration.id}.${tool.id}`,
    })),
  );
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
