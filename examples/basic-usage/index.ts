import { createMcpRegistry } from '../../src/index.js';

/***
 * @title Basic Usage
 *
 * `@ankhorage/mcp` centrally registers provider tools and enforces their declared account scope.
 * Providers supply integrations through their published `./mcp` export; the runtime owns discovery,
 * validation, approval enforcement, and transport.
 *
 * @usage
 * @readme
 */
export const registry = createMcpRegistry({
  integrations: [
    {
      id: 'example',
      tools: [
        {
          description: 'Read account metadata.',
          executeAsync: () => Promise.resolve({ status: 'ok' }),
          id: 'account-status',
          inputSchema: {
            additionalProperties: false,
            properties: { accountId: { type: 'string' } },
            required: ['accountId'],
            type: 'object',
          },
          risk: 'read',
          scope: 'account',
          title: 'Account status',
          accountId: (input) => (typeof input.accountId === 'string' ? input.accountId : null),
        },
      ],
    },
  ],
});
