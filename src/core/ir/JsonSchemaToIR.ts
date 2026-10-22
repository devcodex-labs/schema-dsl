import type { ConditionalInternalSchema } from '../ConditionalValidator.js'
import { CONDITIONAL_RUNTIME_STATE } from '../ConditionalRuntime.js'
import type { JSONSchema, JSONSchemaInput } from '../../types/schema.js'
import {
  createCyclicRefFallback,
  createIRFallback,
  createRemoteRefFallback,
  createRuntimeOnlyFallback,
  createUnresolvedRefFallback,
  createUnsupportedKeywordFallback,
} from './IrFallback.js'
import type {
  ArrayRuleIR,
  CompositionBranchIR,
  ConditionalBranchIR,
  DependencyIR,
  IRAnnotation,
  IREdgeKind,
  IRFallback,
  IRNodeId,
  IRPath,
  IRScalarType,
  JsonScalar,
  JsonSchemaToIROptions,
  ObjectRuleIR,
  RuleIR,
  ScalarConstraintsIR,
  SchemaGraph,
  SchemaIR,
  RuntimeValidatorIR,
} from '../../types/ir.js'

const SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null'])
const OBJECT_HINT_KEYS = new Set(['properties', 'required', 'additionalProperties', 'patternProperties', 'propertyNames', 'dependencies', 'dependentSchemas'])
const ARRAY_HINT_KEYS = new Set(['items', 'prefixItems', 'contains', 'minItems', 'maxItems', 'uniqueItems'])
const COMPOSITION_KEYS = ['allOf', 'anyOf', 'oneOf'] as const
const ANNOTATION_KEYS = new Set([
  '$id',
  '$schema',
  '$comment',
  'title',
  'description',
  'default',
  'examples',
  '_label',
  '_description',
  '_required',
  '_customMessages',
])
const KNOWN_SCHEMA_KEYS = new Set([
  ...ANNOTATION_KEYS,
  'type',
  'enum',
  'const',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'properties',
  'required',
  'additionalProperties',
  'patternProperties',
  'propertyNames',
  'dependencies',
  'dependentSchemas',
  'definitions',
  '$defs',
  'items',
  'prefixItems',
  'contains',
  'minItems',
  'maxItems',
  'uniqueItems',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
  '$ref',
  '_isConditional',
  '_runtimeOnlyConditional',
  'conditions',
  '_evaluateCondition',
  '_customValidators',
  'unevaluatedItems',
  'unevaluatedProperties',
])

export function createJsonSchemaIR(schema: JSONSchemaInput, options: JsonSchemaToIROptions = {}): SchemaIR {
  const builder = new JsonSchemaIRBuilder(schema, options)
  return builder.build()
}

export function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

export function decodeJsonPointerSegment(segment: string): string {
  let decoded = segment
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    decoded = segment
  }
  return decoded.replace(/~1/g, '/').replace(/~0/g, '~')
}

class JsonSchemaIRBuilder {
  private nextNode = 0
  private readonly nodes: Record<IRNodeId, RuleIR> = {}
  private readonly edges: SchemaGraph['edges'] = []
  private readonly cycles: SchemaGraph['cycles'] = []
  private readonly annotations: IRAnnotation[] = []
  private readonly fallbacks: IRFallback[] = []
  private readonly seenNodes = new WeakMap<object, IRNodeId>()
  private readonly activeObjects = new WeakSet<object>()

  constructor(
    private readonly rootSchema: JSONSchemaInput,
    private readonly options: JsonSchemaToIROptions,
  ) { }

  build(): SchemaIR {
    const root = this.convert(this.rootSchema, '')
    return {
      kind: 'schema-ir',
      version: 1,
      source: this.options.source ?? 'json-schema',
      root,
      graph: {
        nodes: this.nodes,
        edges: this.edges,
        cycles: this.cycles,
      },
      annotations: this.annotations,
      fallbacks: this.fallbacks,
    }
  }

  private convert(schema: unknown, path: IRPath): IRNodeId {
    if (schema === true) return this.remember({ id: this.allocateNode(), path, kind: 'always' })
    if (schema === false) return this.remember({ id: this.allocateNode(), path, kind: 'never' })

    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      const fallback = this.addFallback(createIRFallback('non-object-schema', path, { message: 'Schema node is not an object or boolean.' }))
      return this.remember({ id: this.allocateNode(), path, kind: 'fallback', fallback })
    }

    const objectSchema = schema as object
    const existing = this.seenNodes.get(objectSchema)
    if (existing) {
      if (this.activeObjects.has(objectSchema)) {
        this.cycles.push({ node: existing, path })
        this.addFallback(createIRFallback('cyclic-ref', path, { message: 'Schema object graph contains a direct cycle.' }))
      }
      return existing
    }

    const id = this.allocateNode()
    this.seenNodes.set(objectSchema, id)
    this.activeObjects.add(objectSchema)

    try {
      const source = schema as ConditionalInternalSchema & Record<string, unknown>
      this.collectUnsupportedKeywordFallbacks(source, path)

      let node: RuleIR
      if (source._isConditional) {
        node = this.createConditionalNode(id, source, path)
      } else if (typeof source['$ref'] === 'string') {
        node = this.createRefNode(id, source['$ref'], path)
      } else if (this.hasComposition(source)) {
        node = this.createCompositionNode(id, source, path)
      } else if (this.isArraySchema(source)) {
        node = this.createArrayNode(id, source, path)
      } else if (this.isObjectSchema(source)) {
        node = this.createObjectNode(id, source, path)
      } else {
        node = this.createScalarNode(id, source, path)
      }

      this.nodes[id] = node
      return id
    } finally {
      this.activeObjects.delete(objectSchema)
    }
  }

  private createRefNode(id: IRNodeId, ref: string, path: IRPath): RuleIR {
    if (!ref.startsWith('#')) {
      this.addFallback(createRemoteRefFallback(path, ref))
      return { id, path, kind: 'ref', ref, resolution: 'remote' }
    }

    const resolved = this.resolveLocalRef(ref)
    if (resolved === undefined) {
      this.addFallback(createUnresolvedRefFallback(path, ref))
      return { id, path, kind: 'ref', ref, resolution: 'unresolved' }
    }

    if (resolved && typeof resolved === 'object' && this.activeObjects.has(resolved as object)) {
      this.addFallback(createCyclicRefFallback(path, ref))
      this.cycles.push({ node: id, ref, path })
      return { id, path, kind: 'ref', ref, resolution: 'cyclic' }
    }

    const target = this.convert(resolved, `${path || ''}.$ref(${ref})`)
    this.addEdge(id, target, 'ref')
    return { id, path, kind: 'ref', ref, resolution: 'local', target }
  }

  private createConditionalNode(id: IRNodeId, source: ConditionalInternalSchema, path: IRPath): RuleIR {
    const runtimeState = source[CONDITIONAL_RUNTIME_STATE]
    const rawConditions = runtimeState?.conditions ?? source.conditions ?? []
    const conditions = Array.isArray(rawConditions) ? rawConditions : []
    const branches: ConditionalBranchIR[] = []

    for (const condition of conditions) {
      const thenSchema = condition && typeof condition === 'object'
        ? (condition as Record<string, unknown>)['then']
        : undefined
      if (thenSchema === undefined || thenSchema === null) continue
      branches.push(this.convertConditionalBranch(id, thenSchema, path, 'then'))
    }

    const elseSchema = runtimeState ? runtimeState.elseSchema : source.else
    if (elseSchema !== undefined && elseSchema !== null) {
      branches.push(this.convertConditionalBranch(id, elseSchema, `${path}/else`, 'else'))
    }

    if (source._runtimeOnlyConditional) {
      this.addFallback(createRuntimeOnlyFallback(path, 'Function-based conditional schema cannot be reconstructed from serialized JSON.'))
    }

    this.annotations.push({
      kind: 'conditional',
      path,
      node: id,
      data: {
        conditionCount: conditions.length,
        runtimeOnly: source._runtimeOnlyConditional === true,
        hasElse: elseSchema !== undefined,
      },
    })

    return {
      id,
      path,
      kind: 'conditional',
      conditionCount: conditions.length,
      runtimeOnly: source._runtimeOnlyConditional === true,
      branches,
      hasElse: elseSchema !== undefined,
    }
  }

  private convertConditionalBranch(
    owner: IRNodeId,
    value: unknown,
    path: IRPath,
    role: 'then' | 'else',
  ): ConditionalBranchIR {
    if (typeof value === 'string') {
      this.addFallback(createIRFallback('dsl-branch', path, {
        message: 'Conditional branch is a DSL string and remains runtime parser input.',
      }))
      return { role, source: 'dsl-string' }
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const objectValue = value as Record<string, unknown>
      if (typeof objectValue['toSchema'] === 'function') {
        this.addFallback(createRuntimeOnlyFallback(path, 'Conditional branch is a builder-like runtime object.'))
        return { role, source: 'builder' }
      }
      const node = this.convert(value, path)
      this.addEdge(owner, node, 'branch', { key: role })
      return { role, node, source: 'json-schema' }
    }

    this.addFallback(createIRFallback('unsupported-schema', path, {
      message: 'Conditional branch is neither JSON Schema, DSL string, nor builder-like input.',
    }))
    return { role, source: 'unknown' }
  }

  private createCompositionNode(id: IRNodeId, source: Record<string, unknown>, path: IRPath): RuleIR {
    const compositionKeys = [...COMPOSITION_KEYS, 'not', 'if'].filter(key => source[key] !== undefined)
    if (compositionKeys.length > 1) {
      // 不把多个合取约束投影成首个组合节点，交回 AJV 保留完整语义。
      const fallback = this.addFallback(createIRFallback('unsupported-schema', path, {
        message: `Multiple composition keywords require AJV validation: ${compositionKeys.join(', ')}.`,
      }))
      return { id, path, kind: 'fallback', fallback }
    }
    const branches: CompositionBranchIR[] = []
    for (const key of COMPOSITION_KEYS) {
      const list = source[key]
      if (!Array.isArray(list)) continue
      list.forEach((child, index) => {
        const node = this.convert(child, `${path}/${key}/${index}`)
        this.addEdge(id, node, 'composition', { key, index })
        branches.push({ role: 'branch', node, index })
      })
      return { id, path, kind: 'composition', mode: key, branches }
    }

    if (source['not'] !== undefined) {
      const node = this.convert(source['not'], `${path}/not`)
      this.addEdge(id, node, 'composition', { key: 'not' })
      branches.push({ role: 'not', node })
      return { id, path, kind: 'composition', mode: 'not', branches }
    }

    const ifNode = this.convert(source['if'], `${path}/if`)
    this.addEdge(id, ifNode, 'composition', { key: 'if' })
    branches.push({ role: 'if', node: ifNode })
    if (source['then'] !== undefined) {
      const thenNode = this.convert(source['then'], `${path}/then`)
      this.addEdge(id, thenNode, 'composition', { key: 'then' })
      branches.push({ role: 'then', node: thenNode })
    }
    if (source['else'] !== undefined) {
      const elseNode = this.convert(source['else'], `${path}/else`)
      this.addEdge(id, elseNode, 'composition', { key: 'else' })
      branches.push({ role: 'else', node: elseNode })
    }
    return { id, path, kind: 'composition', mode: 'ifThenElse', branches }
  }

  private createObjectNode(id: IRNodeId, source: Record<string, unknown>, path: IRPath): ObjectRuleIR {
    const properties: Record<string, IRNodeId> = {}
    const patternProperties: Record<string, IRNodeId> = {}
    const dependencies: Record<string, DependencyIR> = {}
    const required = Array.isArray(source['required'])
      ? source['required'].filter((item): item is string => typeof item === 'string')
      : []

    const props = source['properties']
    if (props && typeof props === 'object' && !Array.isArray(props)) {
      for (const [key, child] of Object.entries(props as Record<string, unknown>)) {
        const childNode = this.convert(child, `${path}/properties/${escapeJsonPointerSegment(key)}`)
        properties[key] = childNode
        this.addEdge(id, childNode, 'property', { key })
      }
    }

    const patterns = source['patternProperties']
    if (patterns && typeof patterns === 'object' && !Array.isArray(patterns)) {
      for (const [key, child] of Object.entries(patterns as Record<string, unknown>)) {
        const childNode = this.convert(child, `${path}/patternProperties/${escapeJsonPointerSegment(key)}`)
        patternProperties[key] = childNode
        this.addEdge(id, childNode, 'patternProperty', { key })
      }
    }

    let additionalProperties: IRNodeId | boolean | undefined
    if (source['additionalProperties'] !== undefined) {
      const additional = source['additionalProperties']
      if (typeof additional === 'boolean') {
        additionalProperties = additional
      } else {
        additionalProperties = this.convert(additional, `${path}/additionalProperties`)
        this.addEdge(id, additionalProperties, 'additionalProperties')
      }
    }

    let propertyNames: IRNodeId | undefined
    if (source['propertyNames'] !== undefined) {
      propertyNames = this.convert(source['propertyNames'], `${path}/propertyNames`)
      this.addEdge(id, propertyNames, 'propertyNames')
    }

    this.collectDependencyNodes(id, source['dependentSchemas'], path, dependencies, 'dependentSchemas')
    this.collectDependencyNodes(id, source['dependencies'], path, dependencies, 'dependencies')
    this.collectDefinitionNodes(id, source['definitions'], path, 'definitions')
    this.collectDefinitionNodes(id, source['$defs'], path, '$defs')

    const node: ObjectRuleIR = {
      id,
      path,
      kind: 'object',
      required,
      properties,
      patternProperties,
      dependencies,
    }
    if (additionalProperties !== undefined) node.additionalProperties = additionalProperties
    if (propertyNames !== undefined) node.propertyNames = propertyNames
    return node
  }

  private collectDependencyNodes(
    owner: IRNodeId,
    value: unknown,
    path: IRPath,
    dependencies: Record<string, DependencyIR>,
    keyword: 'dependencies' | 'dependentSchemas',
  ): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(child)) {
        dependencies[key] = {
          mode: 'property-list',
          requiredProperties: child.filter((item): item is string => typeof item === 'string'),
        }
        continue
      }
      const childNode = this.convert(child, `${path}/${keyword}/${escapeJsonPointerSegment(key)}`)
      dependencies[key] = { mode: 'schema', target: childNode }
      this.addEdge(owner, childNode, 'dependency', { key })
    }
  }

  private collectDefinitionNodes(owner: IRNodeId, value: unknown, path: IRPath, keyword: 'definitions' | '$defs'): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childNode = this.convert(child, `${path}/${keyword}/${escapeJsonPointerSegment(key)}`)
      this.addEdge(owner, childNode, 'definition', { key })
    }
  }

  private createArrayNode(id: IRNodeId, source: Record<string, unknown>, path: IRPath): ArrayRuleIR {
    const prefixItems: IRNodeId[] = []
    const node: ArrayRuleIR = { id, path, kind: 'array', prefixItems }
    if (typeof source['minItems'] === 'number') node.minItems = source['minItems']
    if (typeof source['maxItems'] === 'number') node.maxItems = source['maxItems']
    if (typeof source['uniqueItems'] === 'boolean') node.uniqueItems = source['uniqueItems']

    const items = source['items']
    if (Array.isArray(items)) {
      const tupleNodes = items.map((child, index) => {
        const childNode = this.convert(child, `${path}/items/${index}`)
        this.addEdge(id, childNode, 'item', { index })
        return childNode
      })
      node.items = tupleNodes
    } else if (items !== undefined) {
      if (typeof items === 'boolean') {
        node.items = items
      } else {
        const childNode = this.convert(items, `${path}/items`)
        this.addEdge(id, childNode, 'item')
        node.items = childNode
      }
    }

    const rawPrefixItems = source['prefixItems']
    if (Array.isArray(rawPrefixItems)) {
      rawPrefixItems.forEach((child, index) => {
        const childNode = this.convert(child, `${path}/prefixItems/${index}`)
        prefixItems.push(childNode)
        this.addEdge(id, childNode, 'prefixItem', { index })
      })
    }

    if (source['contains'] !== undefined) {
      const contains = this.convert(source['contains'], `${path}/contains`)
      node.contains = contains
      this.addEdge(id, contains, 'contains')
    }

    return node
  }

  private createScalarNode(id: IRNodeId, source: Record<string, unknown>, path: IRPath): RuleIR {
    const types = normalizeScalarTypes(source['type'])
    const constraints: ScalarConstraintsIR = {}
    for (const key of ['minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'] as const) {
      const value = source[key]
      if (typeof value === 'number' || typeof value === 'boolean') {
        ; (constraints as Record<string, unknown>)[key] = value
      }
    }
    if (typeof source['pattern'] === 'string') constraints.pattern = source['pattern']
    if (typeof source['format'] === 'string') constraints.format = source['format']

    const runtimeValidators = collectRuntimeValidators(source['_customValidators'])
    if (runtimeValidators.length > 0) {
      this.annotations.push({
        kind: 'runtime-metadata',
        path,
        node: id,
        data: { validators: runtimeValidators.length },
      })
    }

    const node = {
      id,
      path,
      kind: 'scalar',
      types,
      constraints,
    } satisfies RuleIR
    if (Array.isArray(source['enum'])) {
      ; (node as Extract<RuleIR, { kind: 'scalar' }>).enumValues = source['enum'].filter(isJsonScalar)
    }
    if (isJsonScalar(source['const'])) {
      ; (node as Extract<RuleIR, { kind: 'scalar' }>).constValue = source['const']
    }
    if (runtimeValidators.length > 0) {
      ; (node as Extract<RuleIR, { kind: 'scalar' }>).runtimeValidators = runtimeValidators
    }
    return node
  }

  private hasComposition(source: Record<string, unknown>): boolean {
    return COMPOSITION_KEYS.some(key => Array.isArray(source[key]))
      || source['not'] !== undefined
      || source['if'] !== undefined
  }

  private isArraySchema(source: Record<string, unknown>): boolean {
    if (schemaTypeIncludes(source['type'], 'array')) return true
    for (const key of ARRAY_HINT_KEYS) {
      if (source[key] !== undefined) return true
    }
    return false
  }

  private isObjectSchema(source: Record<string, unknown>): boolean {
    if (schemaTypeIncludes(source['type'], 'object')) return true
    for (const key of OBJECT_HINT_KEYS) {
      if (source[key] !== undefined) return true
    }
    return false
  }

  private collectUnsupportedKeywordFallbacks(source: Record<string, unknown>, path: IRPath): void {
    for (const key of Object.keys(source)) {
      if (!KNOWN_SCHEMA_KEYS.has(key)) this.addFallback(createUnsupportedKeywordFallback(path, key))
    }
  }

  private addFallback(fallback: IRFallback): IRFallback {
    this.fallbacks.push(fallback)
    return fallback
  }

  private addEdge(
    from: IRNodeId,
    to: IRNodeId,
    kind: IREdgeKind,
    details: { key?: string; index?: number } = {},
  ): void {
    this.edges.push({ from, to, kind, ...details })
  }

  private allocateNode(): IRNodeId {
    return `n${this.nextNode++}`
  }

  private remember<T extends RuleIR>(node: T): IRNodeId {
    this.nodes[node.id] = node
    return node.id
  }

  private resolveLocalRef(ref: string): unknown {
    if (!ref.startsWith('#')) return undefined
    if (ref === '#') return this.rootSchema
    if (!ref.startsWith('#/')) return undefined

    let current: unknown = this.rootSchema
    for (const rawSegment of ref.slice(2).split('/')) {
      if (!current || typeof current !== 'object') return undefined
      const segment = decodeJsonPointerSegment(rawSegment)
      current = (current as Record<string, unknown>)[segment]
    }
    return current
  }
}

function normalizeScalarTypes(value: unknown): IRScalarType[] | null {
  if (value === undefined) return null
  const values = Array.isArray(value) ? value : [value]
  const types: IRScalarType[] = []
  for (const item of values) {
    if (typeof item === 'string' && SCALAR_TYPES.has(item)) {
      types.push(item as IRScalarType)
    }
  }
  return types.length > 0 ? types : null
}

function schemaTypeIncludes(type: unknown, expected: string): boolean {
  return type === expected || (Array.isArray(type) && type.includes(expected))
}

function isJsonScalar(value: unknown): value is JsonScalar {
  return value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
}

function collectRuntimeValidators(value: unknown): RuntimeValidatorIR[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => typeof item === 'function')
    .map((validator, index) => ({
      mode: validator.constructor.name === 'AsyncFunction' ? 'async' : 'sync',
      identity: `${validator.name || 'anonymous'}#${index}`,
    }))
}

export type { JSONSchema, JSONSchemaInput }
