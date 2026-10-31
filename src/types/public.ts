export type McpRisk = 'read' | 'write';
export interface McpJsonSchema {
  readonly additionalProperties?: boolean;
  readonly properties?: Readonly<Record<string, McpJsonSchema>>;
  readonly required?: readonly string[];
  readonly type: 'boolean' | 'integer' | 'number' | 'object' | 'string';
}
export interface McpInvocationContext {
  readonly actorId: string;
  readonly allowedAccounts: readonly string[];
}
export interface McpExecutionClaim {
  readonly approvalId: string;
  readonly intentId: string;
}
export interface McpToolExecutionContext extends McpInvocationContext {
  readonly executionClaim?: McpExecutionClaim;
}
export type McpExecutionAuditOutcome = 'executed' | 'indeterminate';
export interface McpChangeDescriptor {
  readonly after: Readonly<Record<string, unknown>> | null;
  readonly before: Readonly<Record<string, unknown>> | null;
  readonly resourceId: string;
}
export interface McpPreparedWritePayload {
  readonly serialized: string;
  readonly version: string;
}
/** The immutable provider proposal persisted by the trusted host before human approval. */
export interface McpPreparedWriteProposal {
  readonly accountId: string;
  readonly actorId: string;
  readonly change: McpChangeDescriptor;
  readonly createdAt: string;
  readonly fingerprint: string;
  readonly operation: string;
  readonly payload: McpPreparedWritePayload;
  readonly toolId: string;
}
export interface McpPreparedWrite {
  readonly change: McpChangeDescriptor;
  readonly createdAt: string;
  readonly fingerprint: string;
  readonly operation: string;
  readonly payload: McpPreparedWritePayload;
}
export interface McpStoredPreparedWrite {
  readonly approvalId: string;
  readonly expiresAt: string;
  readonly proposal: McpPreparedWriteProposal;
  readonly snapshotFingerprint: string;
}
/** A trusted host must atomically consume an externally approved record and create its durable intent. */
export interface McpPreparedWriteStore {
  createPreparedWriteAsync(proposal: McpPreparedWriteProposal): Promise<McpStoredPreparedWrite>;
  claimApprovedWriteAndCreateIntentAsync(input: {
    readonly approvalId: string;
    readonly toolId: string;
  }): Promise<(McpStoredPreparedWrite & { readonly executionClaim: McpExecutionClaim }) | null>;
}
interface McpToolBase {
  readonly description: string;
  readonly id: string;
  readonly inputSchema: McpJsonSchema;
  readonly outputSchema?: McpJsonSchema;
  readonly title: string;
}
export interface McpReadTool extends McpToolBase {
  readonly risk: 'read';
  readonly scope: 'account' | 'global';
  accountId?(input: Readonly<Record<string, unknown>>): string | null;
  readonly executeAsync: (
    input: Readonly<Record<string, unknown>>,
    context: McpToolExecutionContext,
  ) => Promise<unknown>;
}
/** Write providers prepare once, then execute only the persisted original proposal. */
export interface McpWriteTool extends McpToolBase {
  readonly risk: 'write';
  readonly scope: 'account';
  accountId(input: Readonly<Record<string, unknown>>): string | null;
  auditOutcome?(output: unknown): McpExecutionAuditOutcome;
  prepareWriteAsync(
    input: Readonly<Record<string, unknown>>,
    context: McpInvocationContext,
  ): Promise<McpPreparedWrite>;
  verifyPreparedWriteAsync(
    proposal: McpPreparedWriteProposal,
    context: McpToolExecutionContext,
  ): Promise<boolean>;
  executePreparedWriteAsync(
    proposal: McpPreparedWriteProposal,
    context: McpToolExecutionContext,
  ): Promise<unknown>;
}
export type McpTool = McpReadTool | McpWriteTool;
export interface McpIntegration {
  closeAsync?(): Promise<void>;
  readonly id: string;
  readonly tools: readonly McpTool[];
}
export interface McpIntegrationModule {
  createIntegrationAsync?(): Promise<McpIntegration>;
  readonly integration?: McpIntegration;
}
export interface McpAuditEvent {
  readonly accountId: string | null;
  readonly actorId: string;
  readonly errorCode?: string;
  readonly outcome: 'denied' | 'executed' | 'failed' | 'indeterminate' | 'intent';
  readonly risk: McpRisk;
  readonly toolId: string;
}
export interface McpAuditSink {
  recordAsync(event: McpAuditEvent): Promise<void>;
}
export interface McpHost {
  readonly auditSink?: McpAuditSink;
  readonly context: McpInvocationContext;
  readonly preparedWriteStore?: McpPreparedWriteStore;
}
export interface McpHostModule {
  createMcpHostAsync(): Promise<McpHost>;
}
