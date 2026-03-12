/**
 * Preprocesses an OpenAPI schema to apply MCP vendor extensions.
 *
 * Walks all schema objects (properties in components.schemas, request/response
 * bodies, nested allOf/oneOf/items) and:
 *   - Removes properties annotated with `x-mcp-exclude: true` (updating the
 *     sibling `required` array accordingly).
 *   - Replaces `description` with `x-mcp-description` where present.
 *   - Cleans up vendor extension keys so downstream consumers (Orval, tool
 *     generator) never see them.
 *
 * Mutates the object in place (consistent with stripUuidFormat).
 */

/**
 * Process a single schema object: apply description overrides, remove excluded
 * properties, and recurse into nested schemas.
 */
function processSchema(schema) {
    if (!schema || typeof schema !== 'object') {
        return
    }

    // Apply x-mcp-description at this level (for non-property schemas like items)
    if (schema['x-mcp-description']) {
        schema.description = schema['x-mcp-description']
        delete schema['x-mcp-description']
    }
    // Clean up x-mcp-exclude at this level (shouldn't appear at schema root, but be safe)
    delete schema['x-mcp-exclude']

    // Process properties: remove excluded, override descriptions
    if (schema.properties) {
        const excluded = []
        for (const [name, prop] of Object.entries(schema.properties)) {
            if (prop['x-mcp-exclude']) {
                excluded.push(name)
                continue
            }
            if (prop['x-mcp-description']) {
                prop.description = prop['x-mcp-description']
                delete prop['x-mcp-description']
            }
            delete prop['x-mcp-exclude']

            // Recurse into nested property schemas
            processSchema(prop)
        }

        for (const name of excluded) {
            delete schema.properties[name]
        }

        // Update required array to remove excluded fields
        if (schema.required && excluded.length > 0) {
            const excludedSet = new Set(excluded)
            schema.required = schema.required.filter((r) => !excludedSet.has(r))
            if (schema.required.length === 0) {
                delete schema.required
            }
        }
    }

    // Recurse into composition keywords
    for (const keyword of ['allOf', 'oneOf', 'anyOf']) {
        if (Array.isArray(schema[keyword])) {
            for (const sub of schema[keyword]) {
                processSchema(sub)
            }
        }
    }

    // Recurse into items (array schemas)
    if (schema.items) {
        processSchema(schema.items)
    }

    // Recurse into additionalProperties
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        processSchema(schema.additionalProperties)
    }
}

/**
 * Apply MCP vendor extensions across the entire OpenAPI spec.
 * Mutates the spec in place.
 */
export function applyMcpExtensions(spec) {
    // Process component schemas
    if (spec.components?.schemas) {
        for (const schema of Object.values(spec.components.schemas)) {
            processSchema(schema)
        }
    }

    // Process request/response bodies in paths
    if (spec.paths) {
        for (const methods of Object.values(spec.paths)) {
            for (const operation of Object.values(methods)) {
                if (!operation || typeof operation !== 'object') {
                    continue
                }

                // Request body schemas
                const requestContent = operation.requestBody?.content
                if (requestContent) {
                    for (const mediaType of Object.values(requestContent)) {
                        if (mediaType?.schema) {
                            processSchema(mediaType.schema)
                        }
                    }
                }

                // Response schemas
                if (operation.responses) {
                    for (const response of Object.values(operation.responses)) {
                        const responseContent = response?.content
                        if (responseContent) {
                            for (const mediaType of Object.values(responseContent)) {
                                if (mediaType?.schema) {
                                    processSchema(mediaType.schema)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
