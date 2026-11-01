# Public API

## createMcpRegistry

Kind: `function`
Module: `src/features/registry/application/createMcpRegistry.ts`
Source: `src/features/registry/application/createMcpRegistry.ts:42:1`

### Signatures

- `(options: CreateMcpRegistryOptions) => McpRegistry`
  - options: `CreateMcpRegistryOptions`
  - returns: `McpRegistry`

## createMcpStdioServerAsync

Kind: `function`
Module: `src/features/transport/composition/createMcpStdioServerAsync.ts`
Source: `src/features/transport/composition/createMcpStdioServerAsync.ts:19:1`

Compose the central registry with the STDIO delivery adapter.

### Signatures

- `(options: CreateMcpStdioServerOptions) => Promise<{ closeAsync(): Promise<void>; }>`
  - options: `CreateMcpStdioServerOptions`
  - returns: `Promise<{ closeAsync(): Promise<void>; }>`

## CreateMcpStdioServerOptions

Kind: `type`
Module: `src/features/transport/composition/createMcpStdioServerAsync.ts`
Source: `src/features/transport/composition/createMcpStdioServerAsync.ts:10:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| auditSink | property | `McpAuditSink` | no |  |
| context | property | `McpInvocationContext` | yes |  |
| integrations | property | `readonly McpIntegration[]` | yes |  |
| preparedWriteStore | property | `McpPreparedWriteStore` | no |  |
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

## McpAuditEvent

Kind: `unknown`
Module: `src/types/public.ts`
Source: `src/types/public.ts:153:1`

## McpAuditSink

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:154:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| recordAsync | method | `(event: McpAuditEvent) => Promise<void>` | yes |  |

## McpChangeDescriptor

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:26:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| after | property | `Readonly<Record<string, unknown>> \| null` | yes |  |
| before | property | `Readonly<Record<string, unknown>> \| null` | yes |  |
| resourceId | property | `string` | yes |  |

## McpExecutionAuditOutcome

Kind: `unknown`
Module: `src/types/public.ts`
Source: `src/types/public.ts:25:1`

## McpExecutionClaim

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:12:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| approvalId | property | `string` | yes |  |
| intentId | property | `string` | yes |  |

## McpHost

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:157:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| auditSink | property | `McpAuditSink` | no |  |
| context | property | `McpInvocationContext` | yes |  |
| preparedWriteStore | property | `McpPreparedWriteStore` | no |  |

## McpHostModule

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:162:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| createMcpHostAsync | method | `() => Promise<McpHost>` | yes |  |

## McpIntegration

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:114:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| closeAsync | method | `() => Promise<void>` | no |  |
| id | property | `string` | yes |  |
| tools | property | `readonly McpTool[]` | yes |  |

## McpIntegrationModule

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:119:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| createIntegrationAsync | method | `() => Promise<McpIntegration>` | no |  |
| integration | property | `McpIntegration` | no |  |

## McpInvocationContext

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:8:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| actorId | property | `string` | yes |  |
| allowedAccounts | property | `readonly string[]` | yes |  |

## McpJsonSchema

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:2:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| additionalProperties | property | `boolean` | no |  |
| properties | property | `Readonly<Record<string, McpJsonSchema>>` | no |  |
| required | property | `readonly string[]` | no |  |
| type | property | `"string" \| "number" \| "boolean" \| "object" \| "integer"` | yes |  |

## McpPreparedWrite

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:46:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| change | property | `McpChangeDescriptor` | yes |  |
| createdAt | property | `string` | yes |  |
| fingerprint | property | `string` | yes |  |
| operation | property | `string` | yes |  |
| payload | property | `McpPreparedWritePayload` | yes |  |

## McpPreparedWritePayload

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:31:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| serialized | property | `string` | yes |  |
| version | property | `string` | yes |  |

## McpPreparedWriteProposal

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:36:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| accountId | property | `string` | yes |  |
| actorId | property | `string` | yes |  |
| change | property | `McpChangeDescriptor` | yes |  |
| createdAt | property | `string` | yes |  |
| fingerprint | property | `string` | yes |  |
| operation | property | `string` | yes |  |
| payload | property | `McpPreparedWritePayload` | yes |  |
| toolId | property | `string` | yes |  |

## McpPreparedWriteSettlement

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:17:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| executionClaim | property | `McpExecutionClaim` | yes |  |
| outcome | property | `McpPreparedWriteSettlementOutcome` | yes |  |
| reasonCode | property | `string` | no |  |

## McpPreparedWriteSettlementOutcome

Kind: `unknown`
Module: `src/types/public.ts`
Source: `src/types/public.ts:16:1`

## McpPreparedWriteStore

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:60:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| claimApprovedWriteAndCreateIntentAsync | method | `(input: { readonly approvalId: string; readonly actorId: string; readonly allowedAccounts: readonly string[]; readonly toolId: string; }) => Promise<(McpStoredPreparedWrite & { readonly executionClaim: McpExecutionClaim; }) \| null>` | yes |  |
| createPreparedWriteAsync | method | `(proposal: McpPreparedWriteProposal) => Promise<McpStoredPreparedWrite>` | yes |  |
| reconcilePreparedWriteAsync | method | `(executionClaim: McpExecutionClaim) => Promise<{ readonly outcome: McpPreparedWriteSettlementOutcome \| "executing"; }>` | yes |  |
| settlePreparedWriteAsync | method | `(settlement: McpPreparedWriteSettlement) => Promise<void>` | yes |  |

## McpReadAuditEvent

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:123:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| accountId | property | `string \| null` | yes |  |
| actorId | property | `string` | yes |  |
| errorCode | property | `string` | no |  |
| outcome | property | `"denied" \| "failed"` | yes |  |
| risk | property | `"read"` | yes |  |
| toolId | property | `string` | yes |  |

## McpReadTool

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:84:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| accountId | method | `(input: Readonly<Record<string, unknown>>) => string \| null` | no |  |
| description | property | `string` | yes |  |
| executeAsync | property | `(input: Readonly<Record<string, unknown>>, context: McpToolExecutionContext) => Promise<unknown>` | yes |  |
| id | property | `string` | yes |  |
| inputSchema | property | `McpJsonSchema` | yes |  |
| outputSchema | property | `McpJsonSchema` | no |  |
| risk | property | `"read"` | yes |  |
| scope | property | `"account" \| "global"` | yes |  |
| title | property | `string` | yes |  |

## McpRegistry

Kind: `type`
Module: `src/features/registry/application/createMcpRegistry.ts`
Source: `src/features/registry/application/createMcpRegistry.ts:19:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| closeAsync | method | `() => Promise<void>` | yes |  |
| executeAsync | method | `(toolId: string, input: Readonly<Record<string, unknown>>, context: McpInvocationContext) => Promise<unknown>` | yes |  |
| listTools | method | `() => readonly RegisteredMcpTool[]` | yes |  |
| prepareWriteAsync | method | `(toolId: string, input: Readonly<Record<string, unknown>>, context: McpInvocationContext) => Promise<{ readonly approvalId: string; readonly expiresAt: string; }>` | yes |  |

## McpRisk

Kind: `unknown`
Module: `src/types/public.ts`
Source: `src/types/public.ts:1:1`

## McpStoredPreparedWrite

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:53:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| approvalId | property | `string` | yes |  |
| expiresAt | property | `string` | yes |  |
| proposal | property | `McpPreparedWriteProposal` | yes |  |
| snapshotFingerprint | property | `string` | yes |  |

## McpTool

Kind: `unknown`
Module: `src/types/public.ts`
Source: `src/types/public.ts:113:1`

## McpToolExecutionContext

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:22:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| actorId | property | `string` | yes |  |
| allowedAccounts | property | `readonly string[]` | yes |  |
| executionClaim | property | `McpExecutionClaim` | no |  |

## McpWriteAuditEvent

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:138:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| accountId | property | `string` | yes |  |
| actorId | property | `string` | yes |  |
| approvalId | property | `string` | yes |  |
| eventId | property | `string` | yes |  |
| intentId | property | `string` | yes |  |
| operation | property | `string` | yes |  |
| outcome | property | `McpWriteAuditOutcome` | yes |  |
| providerProposalFingerprint | property | `string` | yes |  |
| reasonCode | property | `string` | no |  |
| risk | property | `"write"` | yes |  |
| snapshotFingerprint | property | `string` | yes |  |
| toolId | property | `string` | yes |  |

## McpWriteAuditOutcome

Kind: `unknown`
Module: `src/types/public.ts`
Source: `src/types/public.ts:131:1`

## McpWriteTool

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:94:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| accountId | method | `(input: Readonly<Record<string, unknown>>) => string \| null` | yes |  |
| auditOutcome | method | `(output: unknown) => McpExecutionAuditOutcome` | no |  |
| description | property | `string` | yes |  |
| executePreparedWriteAsync | method | `(proposal: McpPreparedWriteProposal, context: McpToolExecutionContext) => Promise<unknown>` | yes |  |
| id | property | `string` | yes |  |
| inputSchema | property | `McpJsonSchema` | yes |  |
| outputSchema | property | `McpJsonSchema` | no |  |
| prepareWriteAsync | method | `(input: Readonly<Record<string, unknown>>, context: McpInvocationContext) => Promise<McpPreparedWrite>` | yes |  |
| risk | property | `"write"` | yes |  |
| scope | property | `"account"` | yes |  |
| title | property | `string` | yes |  |
| verifyPreparedWriteAsync | method | `(proposal: McpPreparedWriteProposal, context: McpToolExecutionContext) => Promise<boolean>` | yes |  |

## RegisteredMcpTool

Kind: `unknown`
Module: `src/features/registry/application/createMcpRegistry.ts`
Source: `src/features/registry/application/createMcpRegistry.ts:33:1`
