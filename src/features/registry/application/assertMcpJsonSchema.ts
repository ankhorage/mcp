import type { McpJsonSchema } from '../../../types/public.js';
import { McpRequestError } from './McpRequestError.js';

/** Validate the small serializable schema vocabulary accepted at provider boundaries. */
export function assertMcpJsonSchema(
  value: unknown,
  schema: McpJsonSchema,
  label: string,
): asserts value is Readonly<Record<string, unknown>> {
  if (schema.type !== 'object')
    throw new McpRequestError(`MCP ${label} must match an object schema.`);
  assertSchemaValue(value, schema, label);
}

/** Recursively validate serializable provider values against the declared schema. */
function assertSchemaValue(value: unknown, schema: McpJsonSchema, label: string): void {
  if (!matchesType(value, schema.type))
    throw new McpRequestError(`MCP ${label} must be ${schema.type}.`);
  if (schema.type !== 'object') return;
  const record = new Map(Object.entries(value as Record<string, unknown>));
  for (const property of schema.required ?? [])
    if (!record.has(property))
      throw new McpRequestError(`MCP ${label} is missing required property: ${property}`);
  const declaredProperties = new Map(Object.entries(schema.properties ?? {}));
  for (const [property, propertySchema] of declaredProperties) {
    const candidate = record.get(property);
    if (candidate !== undefined)
      assertSchemaValue(candidate, propertySchema, `${label}.${property}`);
  }
  if (schema.additionalProperties === false)
    for (const property of record.keys())
      if (!declaredProperties.has(property))
        throw new McpRequestError(`MCP ${label} has unknown property: ${property}`);
}

/** Match primitive JSON values against their declared schema type. */
function matchesType(value: unknown, type: McpJsonSchema['type']): boolean {
  return (
    (type === 'string' && typeof value === 'string') ||
    (type === 'boolean' && typeof value === 'boolean') ||
    (type === 'number' && typeof value === 'number') ||
    (type === 'integer' && typeof value === 'number' && Number.isInteger(value)) ||
    (type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value))
  );
}
