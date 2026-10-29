/** Create the durable diagnostic associated with a non-affirmative execution outcome. */
export function createMcpOutcomeErrorCode(
  outcome: 'executed' | 'failed' | 'indeterminate',
): Readonly<Record<string, string>> {
  if (outcome === 'failed') return { errorCode: 'execution-rejected' };
  if (outcome === 'indeterminate') return { errorCode: 'execution-indeterminate' };
  return {};
}
