# Changelog

## 1.0.0

### Major Changes

- 8595f03: Add a host-fenced, read-only prepared-write recovery API with immutable execution binding and durable recovery settlement.

  This intentionally removes the public `McpPreparedWriteStore.reconcilePreparedWriteAsync()` contract published in MCP 0.4.0. It is a security-driven breaking change: consumers must migrate their host stores to the authorized `readPreparedWriteRecoveryAsync` recovery read and its host-issued recovery-fence settlement contract. Direct callers of the removed method cannot type-check against 1.0.0 and must migrate; no legacy recovery shim or parallel recovery contract is provided.

## 0.4.0

### Minor Changes

- 9a59839: Add the provider-neutral prepared-write lifecycle with trusted host persistence, approval claims, and at-most-once provider invocation.

## 0.3.0

### Minor Changes

- 4cd2e44: Load optional privileged STDIO host composition from trusted process configuration and keep approval credentials outside MCP request data.

## 0.2.0

### Minor Changes

- 434e029: Add provider-neutral MCP discovery, STDIO transport, and Ankh CLI commands with fail-closed mutation authorization.

### Patch Changes

- 4197b68: Publish the canonical MCP command capability catalog and keep CLI discovery metadata synchronized.

All notable changes to this project will be documented in this file.
