import type { McpAuditSink } from '../../../types/public.js';
import { McpRequestError } from './McpRequestError.js';

/** Require a durable audit record for each write intent and terminal write outcome. */
export async function recordMcpAuditRequiredAsync(
  auditSink: McpAuditSink | undefined,
  event: Parameters<McpAuditSink['recordAsync']>[0],
): Promise<void> {
  try {
    await auditSink?.recordAsync(event);
    if (auditSink === undefined) throw new Error('audit sink is unavailable');
  } catch {
    throw new McpRequestError('MCP write rejected because durable audit recording is unavailable.');
  }
}
