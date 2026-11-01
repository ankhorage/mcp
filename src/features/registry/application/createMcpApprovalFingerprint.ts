import { createHash } from 'node:crypto';

/** Produce a canonical proposal fingerprint independent of property insertion order. */
export function createMcpApprovalFingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(sortJson(value)))
    .digest('hex');
}

/** Sort JSON object keys recursively before binding parameters to an approval. */
function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, candidate]) => [key, sortJson(candidate)]),
    );
  return value;
}
