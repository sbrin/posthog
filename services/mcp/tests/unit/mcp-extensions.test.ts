import { describe, expect, it } from 'vitest'

import { applyMcpExtensions } from '../../scripts/lib/mcp-extensions.mjs'

describe('applyMcpExtensions', () => {
    it('removes properties with x-mcp-exclude and updates required array', () => {
        const spec = {
            components: {
                schemas: {
                    Thing: {
                        type: 'object',
                        required: ['name', 'internal'],
                        properties: {
                            name: { type: 'string' },
                            internal: { type: 'string', 'x-mcp-exclude': true },
                        },
                    },
                },
            },
        }

        applyMcpExtensions(spec)

        expect(spec.components.schemas.Thing.properties).toHaveProperty('name')
        expect(spec.components.schemas.Thing.properties).not.toHaveProperty('internal')
        expect(spec.components.schemas.Thing.required).toEqual(['name'])
    })

    it('deletes required array when all required fields are excluded', () => {
        const spec = {
            components: {
                schemas: {
                    Thing: {
                        type: 'object',
                        required: ['internal'],
                        properties: {
                            internal: { type: 'string', 'x-mcp-exclude': true },
                            optional: { type: 'string' },
                        },
                    },
                },
            },
        }

        applyMcpExtensions(spec)

        expect(spec.components.schemas.Thing.properties).not.toHaveProperty('internal')
        expect(spec.components.schemas.Thing.properties).toHaveProperty('optional')
        expect(spec.components.schemas.Thing).not.toHaveProperty('required')
    })

    it('replaces description with x-mcp-description', () => {
        const spec = {
            components: {
                schemas: {
                    Thing: {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                description: 'API docs description',
                                'x-mcp-description': 'MCP-specific description',
                            },
                        },
                    },
                },
            },
        }

        applyMcpExtensions(spec)

        const nameProp = spec.components.schemas.Thing.properties.name
        expect(nameProp.description).toBe('MCP-specific description')
        expect(nameProp).not.toHaveProperty('x-mcp-description')
    })

    it('leaves non-annotated properties untouched', () => {
        const spec = {
            components: {
                schemas: {
                    Thing: {
                        type: 'object',
                        required: ['name', 'description'],
                        properties: {
                            name: { type: 'string', description: 'The name' },
                            description: { type: 'string' },
                        },
                    },
                },
            },
        }

        applyMcpExtensions(spec)

        expect(spec.components.schemas.Thing.properties.name).toEqual({
            type: 'string',
            description: 'The name',
        })
        expect(spec.components.schemas.Thing.required).toEqual(['name', 'description'])
    })

    it('handles nested schemas in allOf', () => {
        const spec = {
            components: {
                schemas: {
                    Thing: {
                        allOf: [
                            {
                                type: 'object',
                                properties: {
                                    secret: { type: 'string', 'x-mcp-exclude': true },
                                    visible: { type: 'string' },
                                },
                            },
                        ],
                    },
                },
            },
        }

        applyMcpExtensions(spec)

        const inner = spec.components.schemas.Thing.allOf[0]
        expect(inner.properties).not.toHaveProperty('secret')
        expect(inner.properties).toHaveProperty('visible')
    })

    it('handles nested schemas in items', () => {
        const spec = {
            components: {
                schemas: {
                    ThingList: {
                        type: 'object',
                        properties: {
                            results: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        name: { type: 'string' },
                                        hidden: { type: 'string', 'x-mcp-exclude': true },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }

        applyMcpExtensions(spec)

        const itemProps = spec.components.schemas.ThingList.properties.results.items.properties
        expect(itemProps).toHaveProperty('name')
        expect(itemProps).not.toHaveProperty('hidden')
    })

    it('processes inline request body schemas in paths', () => {
        const spec = {
            paths: {
                '/api/things/': {
                    post: {
                        operationId: 'things_create',
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            name: {
                                                type: 'string',
                                                'x-mcp-description': 'Better name desc',
                                            },
                                            internal: { type: 'string', 'x-mcp-exclude': true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }

        applyMcpExtensions(spec)

        const bodyProps = spec.paths['/api/things/'].post.requestBody.content['application/json'].schema.properties
        expect(bodyProps.name.description).toBe('Better name desc')
        expect(bodyProps).not.toHaveProperty('internal')
    })

    it('handles empty spec gracefully', () => {
        const spec = {}
        expect(() => applyMcpExtensions(spec)).not.toThrow()
    })

    it('handles spec with no schemas', () => {
        const spec = { components: {}, paths: {} }
        expect(() => applyMcpExtensions(spec)).not.toThrow()
    })
})
