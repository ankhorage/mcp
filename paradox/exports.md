# Public API

## createMcpRegistry

Kind: `function`
Module: `src/features/registry/application/createMcpRegistry.ts`
Source: `src/features/registry/application/createMcpRegistry.ts:41:1`

Create a deterministic registry that enforces account and mutation boundaries.

### Signatures

- `(options: CreateMcpRegistryOptions) => McpRegistry`
  - options: `CreateMcpRegistryOptions`
  - returns: `McpRegistry`

## createMcpStdioServerAsync

Kind: `function`
Module: `src/features/transport/composition/createMcpStdioServerAsync.ts`
Source: `src/features/transport/composition/createMcpStdioServerAsync.ts:21:1`

Compose the central registry with the STDIO delivery adapter.

### Signatures

- `(options: CreateMcpStdioServerOptions) => Promise<{ closeAsync(): Promise<void>; }>`
  - options: `CreateMcpStdioServerOptions`
  - returns: `Promise<{ closeAsync(): Promise<void>; }>`

## CreateMcpStdioServerOptions

Kind: `type`
Module: `src/features/transport/composition/createMcpStdioServerAsync.ts`
Source: `src/features/transport/composition/createMcpStdioServerAsync.ts:11:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| approvalVerifier | property | `McpApprovalVerifier` | no |  |
| auditSink | property | `McpAuditSink` | no |  |
| context | property | `McpInvocationContext` | yes |  |
| integrations | property | `readonly McpIntegration[]` | yes |  |
| transactionalApprovalConsumers | property | `readonly McpTransactionalApprovalConsumer[]` | no |  |
| version | property | `string` | yes |  |

## discoverMcpIntegrationsAsync

Kind: `function`
Module: `src/features/discovery/application/discoverMcpIntegrationsAsync.ts`
Source: `src/features/discovery/application/discoverMcpIntegrationsAsync.ts:14:1`

Discover configured package exports without resolving arbitrary filesystem paths.

### Signatures

- `(options: DiscoverMcpIntegrationsOptions) => Promise<readonly McpIntegration[]>`
  - options: `DiscoverMcpIntegrationsOptions`
  - returns: `Promise<readonly McpIntegration[]>`

## DiscoverMcpIntegrationsOptions

Kind: `type`
Module: `src/features/discovery/application/discoverMcpIntegrationsAsync.ts`
Source: `src/features/discovery/application/discoverMcpIntegrationsAsync.ts:8:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| cwd | property | `string` | yes |  |
| packageNames | property | `readonly string[]` | yes |  |

## loadMcpHostAsync

Kind: `function`
Module: `src/features/host/application/loadMcpHostAsync.ts`
Source: `src/features/host/application/loadMcpHostAsync.ts:11:1`

Load optional privileged composition from a process-owned absolute module path.

### Signatures

- `(input: { readonly env: Readonly<Record<string, string | undefined>>; }) => Promise<McpHost | undefined>`
  - input: `{ readonly env: Readonly<Record<string, string | undefined>>; }`
  - returns: `Promise<McpHost | undefined>`

## McpAccountScopedTool

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:61:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| accountId | method | `(input: Readonly<Record<string, unknown>>) => string \| null` | yes |  |
| approvalFingerprintAsync | method | `(input: Readonly<Record<string, unknown>>, context: McpToolExecutionContext, change: McpChangeDescriptor) => Promise<string>` | no |  |
| auditOutcome | method | `(output: unknown) => McpExecutionAuditOutcome` | no |  |
| describeChangeAsync | method | `(input: Readonly<Record<string, unknown>>, context: McpToolExecutionContext) => Promise<McpChangeDescriptor>` | no |  |
| description | property | `string` | yes |  |
| executeAsync | property | `(input: Readonly<Record<string, unknown>>, context: McpToolExecutionContext) => Promise<unknown>` | yes |  |
| id | property | `string` | yes |  |
| inputSchema | property | `McpJsonSchema` | yes |  |
| outputSchema | property | `McpJsonSchema` | no |  |
| risk | property | `McpRisk` | yes |  |
| scope | property | `"account"` | yes |  |
| title | property | `string` | yes |  |
| verifyExpectedStateAsync | method | `(input: Readonly<Record<string, unknown>>, context: McpToolExecutionContext, change: McpChangeDescriptor) => Promise<boolean>` | no |  |

## McpApprovalProposal

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:83:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| accountId | property | `string` | yes |  |
| actorId | property | `string` | yes |  |
| change | property | `McpChangeDescriptor` | yes |  |
| expiresAt | property | `string` | yes |  |
| fingerprint | property | `string` | yes |  |
| operation | property | `string` | yes |  |
| toolId | property | `string` | yes |  |

## McpApprovalVerifier

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:93:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| verifyAndConsumeAsync | method | `(proposal: McpApprovalProposal) => Promise<boolean>` | yes |  |

## McpAuditEvent

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:105:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| accountId | property | `string \| null` | yes |  |
| actorId | property | `string` | yes |  |
| errorCode | property | `string` | no |  |
| outcome | property | `"executed" \| "indeterminate" \| "denied" \| "failed" \| "intent"` | yes |  |
| risk | property | `McpRisk` | yes |  |
| toolId | property | `string` | yes |  |

## McpAuditSink

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:114:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| recordAsync | method | `(event: McpAuditEvent) => Promise<void>` | yes |  |

## McpChangeDescriptor

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:27:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| after | property | `Readonly<Record<string, unknown>> \| null` | yes |  |
| before | property | `Readonly<Record<string, unknown>> \| null` | yes |  |
| resourceId | property | `string` | yes |  |

## McpConsumedApproval

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:16:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| approvalId | property | `string` | yes |  |

## McpExecutionAuditOutcome

Kind: `unknown`
Module: `src/types/public.ts`
Source: `src/types/public.ts:25:1`

## McpGlobalTool

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:66:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| approvalFingerprintAsync | method | `(input: Readonly<Record<string, unknown>>, context: McpToolExecutionContext, change: McpChangeDescriptor) => Promise<string>` | no |  |
| auditOutcome | method | `(output: unknown) => McpExecutionAuditOutcome` | no |  |
| describeChangeAsync | method | `(input: Readonly<Record<string, unknown>>, context: McpToolExecutionContext) => Promise<McpChangeDescriptor>` | no |  |
| description | property | `string` | yes |  |
| executeAsync | property | `(input: Readonly<Record<string, unknown>>, context: McpToolExecutionContext) => Promise<unknown>` | yes |  |
| id | property | `string` | yes |  |
| inputSchema | property | `McpJsonSchema` | yes |  |
| outputSchema | property | `McpJsonSchema` | no |  |
| risk | property | `McpRisk` | yes |  |
| scope | property | `"global"` | yes |  |
| title | property | `string` | yes |  |
| verifyExpectedStateAsync | method | `(input: Readonly<Record<string, unknown>>, context: McpToolExecutionContext, change: McpChangeDescriptor) => Promise<boolean>` | no |  |

## McpHost

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:119:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| approvalVerifier | property | `McpApprovalVerifier` | no |  |
| auditSink | property | `McpAuditSink` | no |  |
| context | property | `McpInvocationContext` | yes |  |
| transactionalApprovalConsumers | property | `readonly McpTransactionalApprovalConsumer[]` | no |  |

## McpHostModule

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:126:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| createMcpHostAsync | method | `() => Promise<McpHost>` | yes |  |

## McpIntegration

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:72:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| closeAsync | method | `() => Promise<void>` | no |  |
| id | property | `string` | yes |  |
| tools | property | `readonly McpTool[]` | yes |  |

## McpIntegrationModule

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:78:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| createIntegrationAsync | method | `() => Promise<McpIntegration>` | no |  |
| integration | property | `McpIntegration` | no |  |

## McpInvocationContext

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:10:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| actorId | property | `string` | yes |  |
| allowedAccounts | property | `readonly string[]` | yes |  |

## McpJsonSchema

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:3:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| additionalProperties | property | `boolean` | no |  |
| properties | property | `Readonly<Record<string, McpJsonSchema>>` | no |  |
| required | property | `readonly string[]` | no |  |
| type | property | `"string" \| "number" \| "boolean" \| "object" \| "integer"` | yes |  |

## McpRegistry

Kind: `type`
Module: `src/features/registry/application/createMcpRegistry.ts`
Source: `src/features/registry/application/createMcpRegistry.ts:20:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| closeAsync | method | `() => Promise<void>` | yes |  |
| executeAsync | method | `(toolId: string, input: Readonly<Record<string, unknown>>, context: McpInvocationContext) => Promise<unknown>` | yes |  |
| listTools | method | `() => readonly RegisteredMcpTool[]` | yes |  |

## McpRisk

Kind: `unknown`
Module: `src/types/public.ts`
Source: `src/types/public.ts:1:1`

## McpTool

Kind: `unknown`
Module: `src/types/public.ts`
Source: `src/types/public.ts:70:1`

## McpToolExecutionContext

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:21:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| actorId | property | `string` | yes |  |
| allowedAccounts | property | `readonly string[]` | yes |  |
| consumedApproval | property | `McpConsumedApproval` | no |  |

## McpTransactionalApprovalConsumer

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:98:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| consumeApprovalAndCreateIntentAsync | method | `(proposal: McpApprovalProposal) => Promise<McpConsumedApproval \| null>` | yes |  |
| toolIds | property | `readonly string[]` | yes |  |

## RegisteredMcpTool

Kind: `unknown`
Module: `src/features/registry/application/createMcpRegistry.ts`
Source: `src/features/registry/application/createMcpRegistry.ts:30:1`
