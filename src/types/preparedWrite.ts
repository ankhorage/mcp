import type { McpExecutionClaim, McpStoredPreparedWrite } from './public.js';

/** The trusted host record returned after it atomically consumes one approved proposal. */
export type McpClaimedPreparedWrite = McpStoredPreparedWrite & {
  readonly executionClaim: McpExecutionClaim;
};
