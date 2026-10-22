import { describe, expect, it } from 'vitest'
import { createJsonSchemaIR, decodeJsonPointerSegment } from '../../../../src/core/ir/JsonSchemaToIR.js'
import { createStableIRSnapshot } from '../../../../src/core/ir/IrDebug.js'
import type { RefRuleIR, ScalarRuleIR } from '../../../../src/types/ir.js'

describe('JsonSchemaToIR', () => {
  it('represents boolean schemas with always and never nodes', () => {
    const always = createJsonSchemaIR(true)
    const never = createJsonSchemaIR(false)

    expect(always.graph.nodes[always.root]?.kind).toBe('always')
    expect(never.graph.nodes[never.root]?.kind).toBe('never')
    expect(always.fallbacks).toEqual([])
    expect(never.fallbacks).toEqual([])
  })

  it('maps scalar constraints, object children and array applicators into graph nodes', () => {
    const ir = createJsonSchemaIR({
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 2, format: 'email' },
      },
      patternProperties: {
        '^x_': { type: 'number', minimum: 1 },
      },
      additionalProperties: false,
      propertyNames: { pattern: '^[a-z_]+$' },
      dependentSchemas: {
        name: {
          type: 'object',
          properties: { age: { type: 'integer' } },
        },
      },
    })

    const root = ir.graph.nodes[ir.root]
    expect(root?.kind).toBe('object')
    if (root?.kind !== 'object') throw new Error('expected object IR')
    expect(root.required).toEqual(['name'])
    expect(Object.keys(root.properties)).toEqual(['name'])
    expect(Object.keys(root.patternProperties)).toEqual(['^x_'])
    expect(root.additionalProperties).toBe(false)
    expect(root.dependencies.name?.mode).toBe('schema')

    const nameNode = ir.graph.nodes[root.properties.name!] as ScalarRuleIR
    expect(nameNode.kind).toBe('scalar')
    expect(nameNode.types).toEqual(['string'])
    expect(nameNode.constraints).toMatchObject({ minLength: 2, format: 'email' })
    expect(ir.graph.edges.map(edge => edge.kind)).toEqual(expect.arrayContaining([
      'property',
      'patternProperty',
      'propertyNames',
      'dependency',
    ]))

    const arrayIr = createJsonSchemaIR({
      type: 'array',
      items: { type: 'string' },
      prefixItems: [{ type: 'number' }],
      contains: { const: 'ok' },
      minItems: 1,
      maxItems: 5,
    })
    const arrayRoot = arrayIr.graph.nodes[arrayIr.root]
    expect(arrayRoot?.kind).toBe('array')
    if (arrayRoot?.kind !== 'array') throw new Error('expected array IR')
    expect(arrayRoot.prefixItems).toHaveLength(1)
    expect(arrayRoot.minItems).toBe(1)
    expect(arrayIr.graph.edges.map(edge => edge.kind)).toEqual(expect.arrayContaining(['item', 'prefixItem', 'contains']))
  })

  it('maps tuple items and boolean items without widening array semantics', () => {
    const tupleIr = createJsonSchemaIR({
      type: 'array',
      items: [
        { type: 'string' },
        { type: 'number' },
      ],
      uniqueItems: true,
    })
    const tupleRoot = tupleIr.graph.nodes[tupleIr.root]
    expect(tupleRoot?.kind).toBe('array')
    if (tupleRoot?.kind !== 'array') throw new Error('expected tuple array IR')
    expect(Array.isArray(tupleRoot.items)).toBe(true)
    expect(tupleRoot.items).toHaveLength(2)
    expect(tupleRoot.uniqueItems).toBe(true)

    const booleanItemsIr = createJsonSchemaIR({
      type: 'array',
      items: false,
    })
    const booleanItemsRoot = booleanItemsIr.graph.nodes[booleanItemsIr.root]
    expect(booleanItemsRoot?.kind).toBe('array')
    if (booleanItemsRoot?.kind !== 'array') throw new Error('expected boolean-items array IR')
    expect(booleanItemsRoot.items).toBe(false)
  })

  it('tracks composition branches and produces stable debug snapshots', () => {
    const ir = createJsonSchemaIR({
      anyOf: [
        { type: 'string' },
        { type: 'number' },
      ],
    })

    const root = ir.graph.nodes[ir.root]
    expect(root?.kind).toBe('composition')
    if (root?.kind !== 'composition') throw new Error('expected composition IR')
    expect(root.mode).toBe('anyOf')
    expect(root.branches).toHaveLength(2)
    expect(createStableIRSnapshot(ir)).toMatchObject({
      kind: 'schema-ir',
      version: 1,
      source: 'json-schema',
      root: ir.root,
    })
  })

  it.each([
    { anyOf: [{ type: 'string' }], oneOf: [{ type: 'number' }] },
    { allOf: [{ type: 'string' }], anyOf: [{ minLength: 2 }] },
    { anyOf: [{ type: 'string' }], not: { const: 'blocked' } },
    { oneOf: [{ type: 'string' }], if: { const: 'x' }, then: { minLength: 2 } },
  ])('应该对不能完整表示的组合合取记录显式fallback: %j', schema => {
    const ir = createJsonSchemaIR(schema)
    expect(ir.graph.nodes[ir.root]).toMatchObject({
      kind: 'fallback',
      fallback: { reason: 'unsupported-schema', path: '' },
    })
    expect(ir.fallbacks).toEqual([
      expect.objectContaining({ reason: 'unsupported-schema', message: expect.stringContaining('Multiple composition keywords') }),
    ])
  })

  it('resolves local refs, records cyclic refs and leaves remote refs as fallbacks', () => {
    const local = createJsonSchemaIR({
      type: 'object',
      properties: {
        value: { $ref: '#/$defs/Value' },
      },
      $defs: {
        Value: { type: 'number' },
      },
    })
    const refNode = Object.values(local.graph.nodes).find((node): node is RefRuleIR => node.kind === 'ref')
    expect(refNode).toMatchObject({ ref: '#/$defs/Value', resolution: 'local' })
    expect(local.graph.edges.some(edge => edge.kind === 'ref')).toBe(true)

    const cyclic = createJsonSchemaIR({
      $ref: '#/$defs/Node',
      $defs: {
        Node: {
          type: 'object',
          properties: {
            self: { $ref: '#/$defs/Node' },
          },
        },
      },
    })
    expect(cyclic.fallbacks.map(fallback => fallback.reason)).toContain('cyclic-ref')
    expect(cyclic.graph.cycles.length).toBeGreaterThan(0)

    const remote = createJsonSchemaIR({ $ref: 'https://example.test/schema.json' })
    expect(remote.graph.nodes[remote.root]).toMatchObject({ kind: 'ref', resolution: 'remote' })
    expect(remote.fallbacks).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'remote-ref', ref: 'https://example.test/schema.json' }),
    ]))

    const unresolved = createJsonSchemaIR({ $ref: '#/$defs/Missing', $defs: {} })
    expect(unresolved.graph.nodes[unresolved.root]).toMatchObject({ kind: 'ref', resolution: 'unresolved' })
    expect(unresolved.fallbacks).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'unresolved-ref', ref: '#/$defs/Missing' }),
    ]))
  })

  it('keeps JSON Pointer decoding order compatible with the runtime resolver', () => {
    expect(decodeJsonPointerSegment('%7E1')).toBe('/')
    expect(decodeJsonPointerSegment('a~1b')).toBe('a/b')
    expect(decodeJsonPointerSegment('a~0b')).toBe('a~b')
    expect(decodeJsonPointerSegment('%E0%A4%A')).toBe('%E0%A4%A')
  })

  it('records unsupported custom keywords without rejecting raw JSON Schema metadata', () => {
    const ir = createJsonSchemaIR({
      title: 'string',
      format: 'email',
      customKeyword: true,
    })

    expect(ir.graph.nodes[ir.root]?.kind).toBe('scalar')
    expect(ir.fallbacks).toEqual([
      expect.objectContaining({ reason: 'unsupported-keyword', keyword: 'customKeyword' }),
    ])
  })
})
