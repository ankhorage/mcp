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

/** A server-issued approval handle available only after a trusted consumer has recorded intent. */
export interface McpConsumedApproval {
  readonly approvalId: string;
}

/** Context delivered to a provider after registry authorization has completed. */
export interface McpToolExecutionContext extends McpInvocationContext {
  readonly consumedApproval?: McpConsumedApproval;
}

export type McpExecutionAuditOutcome = 'executed' | 'indeterminate';

export interface McpChangeDescriptor {
  readonly after: Readonly<Record<string, unknown>> | null;
  readonly before: Readonly<Record<string, unknown>> | null;
  readonly resourceId: string;
}

interface McpToolBase {
  auditOutcome?(output: unknown): McpExecutionAuditOutcome;
  approvalFingerprintAsync?(
    input: Readonly<Record<string, unknown>>,
    context: McpToolExecutionContext,
    change: McpChangeDescriptor,
  ): Promise<string>;
  describeChangeAsync?(
    input: Readonly<Record<string, unknown>>,
    context: McpToolExecutionContext,
  ): Promise<McpChangeDescriptor>;
  readonly description: string;
  readonly executeAsync: (
    input: Readonly<Record<string, unknown>>,
    context: McpToolExecutionContext,
  ) => Promise<unknown>;
  readonly id: string;
  readonly inputSchema: McpJsonSchema;
  readonly outputSchema?: McpJsonSchema;
  readonly risk: McpRisk;
  readonly title: string;
  verifyExpectedStateAsync?(
    input: Readonly<Record<string, unknown>>,
    context: McpToolExecutionContext,
    change: McpChangeDescriptor,
  ): Promise<boolean>;
}

export interface McpAccountScopedTool extends McpToolBase {
  accountId(input: Readonly<Record<string, unknown>>): string | null;
  readonly scope: 'account';
}

export interface McpGlobalTool extends McpToolBase {
  readonly scope: 'global';
}

export type McpTool = McpAccountScopedTool | McpGlobalTool;

export interface McpIntegration {
  closeAsync?(): Promise<void>;
  readonly id: string;
  readonly tools: readonly McpTool[];
}

export interface McpIntegrationModule {
  createIntegrationAsync?(): Promise<McpIntegration>;
  readonly integration?: McpIntegration;
}

export interface McpApprovalProposal {
  readonly accountId: string;
  readonly actorId: string;
  readonly change: McpChangeDescriptor;
  readonly expiresAt: string;
  readonly fingerprint: string;
  readonly operation: string;
  readonly toolId: string;
}

export interface McpApprovalVerifier {
  verifyAndConsumeAsync(proposal: McpApprovalProposal): Promise<boolean>;
}

/** Trusted host-owned consumer which atomically consumes one approval while creating a write intent. */
export interface McpTransactionalApprovalConsumer {
  consumeApprovalAndCreateIntentAsync(
    proposal: McpApprovalProposal,
  ): Promise<McpConsumedApproval | null>;
  readonly toolIds: readonly string[];
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

/** Trusted process-local composition supplied by an MCP host, never by an MCP request. */
export interface McpHost {
  readonly approvalVerifier?: McpApprovalVerifier;
  readonly auditSink?: McpAuditSink;
  readonly context: McpInvocationContext;
  readonly transactionalApprovalConsumers?: readonly McpTransactionalApprovalConsumer[];
}

export interface McpHostModule {
  createMcpHostAsync(): Promise<McpHost>;
}
