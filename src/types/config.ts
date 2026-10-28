/***
 * @title MCP Configuration
 *
 * The optional `.ankh/mcp.json` file configures installed provider packages and the account
 * identities trusted for one `ankh mcp serve` process. `allowedAccounts` is evaluated when the
 * server starts and defaults to an empty list, so MCP tool arguments cannot expand its scope.
 *
 * @config
 * @readme
 */
export interface McpConfiguration {
  readonly allowedAccounts?: readonly string[];
  readonly packages?: readonly string[];
}
