import { McpRequestError } from './McpRequestError.js';

/** Convert unexpected provider and host failures into a deterministic client-safe request error. */
export async function sanitizeMcpRequestAsync<T>(
  operation: () => Promise<T>,
  message: string,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof McpRequestError) throw error;
    throw new McpRequestError(message);
  }
}
