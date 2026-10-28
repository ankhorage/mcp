# Public API

## createMcpRegistry

Kind: `function`
Module: `src/features/registry/application/createMcpRegistry.ts`
Source: `src/features/registry/application/createMcpRegistry.ts:37:1`

Create a deterministic registry that enforces account and mutation boundaries.

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
| approvalVerifier | property | `McpApprovalVerifier` | no |  |
| auditSink | property | `McpAuditSink` | no |  |
| context | property | `McpToolExecutionContext` | yes |  |
| integrations | property | `readonly McpIntegration[]` | yes |  |
| version | property | `string` | yes |  |

## discoverMcpIntegrationsAsync

Kind: `function`
Module: `src/features/discovery/application/discoverMcpIntegrationsAsync.ts`
Source: `src/features/discovery/application/discoverMcpIntegrationsAsync.ts:12:1`

Discover configured package exports without resolving arbitrary filesystem paths.

### Signatures

- `(options: DiscoverMcpIntegrationsOptions) => Promise<readonly McpIntegration[]>`
  - options: `DiscoverMcpIntegrationsOptions`
  - returns: `Promise<readonly McpIntegration[]>`

## DiscoverMcpIntegrationsOptions

Kind: `type`
Module: `src/features/discovery/application/discoverMcpIntegrationsAsync.ts`
Source: `src/features/discovery/application/discoverMcpIntegrationsAsync.ts:6:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| cwd | property | `string` | yes |  |
| packageNames | property | `readonly string[]` | yes |  |

## McpAccountScopedTool

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:44:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| accountId | method | `(input: Readonly<Record<string, unknown>>) => string \| null` | yes |  |
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
Source: `src/types/public.ts:66:1`

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
Source: `src/types/public.ts:76:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| verifyAndConsumeAsync | method | `(proposal: McpApprovalProposal, token: string) => Promise<boolean>` | yes |  |

## McpAuditEvent

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:80:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| accountId | property | `string \| null` | yes |  |
| actorId | property | `string` | yes |  |
| errorCode | property | `string` | no |  |
| outcome | property | `"denied" \| "executed" \| "failed"` | yes |  |
| risk | property | `McpRisk` | yes |  |
| toolId | property | `string` | yes |  |

## McpAuditSink

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:89:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| recordAsync | method | `(event: McpAuditEvent) => Promise<void>` | yes |  |

## McpChangeDescriptor

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:16:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| after | property | `Readonly<Record<string, unknown>> \| null` | yes |  |
| before | property | `Readonly<Record<string, unknown>> \| null` | yes |  |
| resourceId | property | `string` | yes |  |

## McpGlobalTool

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:49:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
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

## McpIntegration

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:55:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| closeAsync | method | `() => Promise<void>` | no |  |
| id | property | `string` | yes |  |
| tools | property | `readonly McpTool[]` | yes |  |

## McpIntegrationModule

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:61:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| createIntegrationAsync | method | `() => Promise<McpIntegration>` | no |  |
| integration | property | `McpIntegration` | no |  |

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
Source: `src/features/registry/application/createMcpRegistry.ts:13:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| closeAsync | method | `() => Promise<void>` | yes |  |
| executeAsync | method | `(toolId: string, input: Readonly<Record<string, unknown>>, context: McpToolExecutionContext) => Promise<unknown>` | yes |  |
| listTools | method | `() => readonly RegisteredMcpTool[]` | yes |  |

## McpRisk

Kind: `unknown`
Module: `src/types/public.ts`
Source: `src/types/public.ts:1:1`

## McpTool

Kind: `unknown`
Module: `src/types/public.ts`
Source: `src/types/public.ts:53:1`

## McpToolExecutionContext

Kind: `type`
Module: `src/types/public.ts`
Source: `src/types/public.ts:10:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| actorId | property | `string` | yes |  |
| allowedAccounts | property | `readonly string[]` | yes |  |
| approvalToken | property | `string` | no |  |

## RegisteredMcpTool

Kind: `type`
Module: `src/features/registry/application/createMcpRegistry.ts`
Source: `src/features/registry/application/createMcpRegistry.ts:23:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| integrationId | property | `string` | yes |  |
| tool | property | `McpTool` | yes |  |
| toolId | property | `string` | yes |  |
