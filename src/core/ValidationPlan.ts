import type { JSONSchemaInput } from '../types/schema.js'
import { fullFormats } from 'ajv-formats/dist/formats.js'

type PrimitiveType = 'string' | 'number' | 'integer' | 'boolean' | 'null'
type SchemaType = PrimitiveType | 'array' | 'object'
type JsonScalar = string | number | boolean | null
type SupportedFormat = 'email'
type CustomValidator = (value: unknown) => unknown

export type ValidationPlanUnsupportedReason =
  | 'phase-1-disabled'
  | 'non-object-schema'
  | 'validator-option'
  | 'contains-default'
  | 'unsupported-keyword'
  | 'unsupported-type'
  | 'unsupported-enum'
  | 'invalid-pattern'
  | 'unsupported-schema'

export type ValidationPlanFallbackReason =
  | ValidationPlanUnsupportedReason
  | 'data-mismatch'

export interface ValidationPlanCompileContext {
  cacheKey: string
  ajvOptions?: Record<string, unknown>
  customValidators?: 'sync' | 'ignore'
}

interface AlwaysPlanNode {
  kind: 'always'
}

interface ScalarPlanNode {
  kind: 'scalar'
  types: PrimitiveType[] | null
  enumValues: JsonScalar[] | null
  constValue: JsonScalar | typeof NO_CONST
  minLength: number | null
  maxLength: number | null
  pattern: RegExp | null
  minimum: number | null
  maximum: number | null
  exclusiveMinimum: number | null
  exclusiveMaximum: number | null
  format: SupportedFormat | null
  customValidators: CustomValidator[] | null
}

interface ArrayPlanNode {
  kind: 'array'
  minItems: number | null
  maxItems: number | null
  item: ValidationPlanNode | null
}

interface UnionPlanNode {
  kind: 'union'
  mode: 'anyOf' | 'oneOf'
  branches: ValidationPlanNode[]
}

interface ObjectPlanNode {
  kind: 'object'
  required: string[]
  properties: Array<[string, ValidationPlanNode]>
}

type ValidationPlanNode = AlwaysPlanNode | ScalarPlanNode | ArrayPlanNode | UnionPlanNode | ObjectPlanNode
type ObjectPropertyValidator = readonly [string, (data: unknown) => boolean]

export interface ValidationPlan {
  kind: 'fast'
  cacheKey: string
  node: ValidationPlanNode
  validate: (data: unknown) => boolean
}

export type ValidationPlanCompileResult =
  | { status: 'compiled'; plan: ValidationPlan }
  | { status: 'unsupported'; reason: ValidationPlanUnsupportedReason }

export type ValidationPlanExecutionResult<T> =
  | { status: 'valid'; data: T }
  | { status: 'fallback'; reason: ValidationPlanFallbackReason }

const NO_CONST = Symbol('schema-dsl.no-const')

const ANNOTATION_KEYS = new Set([
  '$id',
  '$schema',
  '$comment',
  'title',
  'description',
  'examples',
  '_label',
  '_description',
  '_required',
  '_customMessages',
])

const SCALAR_KEYS = new Set([
  'type',
  'enum',
  'const',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'format',
  '_customValidators',
])

const ARRAY_KEYS = new Set([
  'type',
  'items',
  'minItems',
  'maxItems',
])

const UNION_KEYS = new Set([
  'anyOf',
  'oneOf',
])

const OBJECT_KEYS = new Set([
  'type',
  'properties',
  'required',
])

const EMAIL_FORMAT = fullFormats.email

export function compileValidationPlan(
  schema: JSONSchemaInput,
  context: ValidationPlanCompileContext
): ValidationPlanCompileResult {
  if (hasUnsupportedValidatorOption(context.ajvOptions)) {
    return { status: 'unsupported', reason: 'validator-option' }
  }

  const result = compilePlanNode(schema, new WeakSet<object>(), context.customValidators ?? 'sync', context.ajvOptions?.['unicodeRegExp'] !== false)
  if (result.status === 'unsupported') return result

  return {
    status: 'compiled',
    plan: {
      kind: 'fast',
      cacheKey: context.cacheKey,
      node: result.node,
      validate: createNodeValidator(result.node),
    },
  }
}

export function executeValidationPlan<T>(
  plan: ValidationPlan,
  data: T
): ValidationPlanExecutionResult<T> {
  return plan.validate(data)
    ? { status: 'valid', data }
    : { status: 'fallback', reason: 'data-mismatch' }
}

type CompileNodeResult =
  | { status: 'compiled'; node: ValidationPlanNode }
  | { status: 'unsupported'; reason: ValidationPlanUnsupportedReason }

function compilePlanNode(
  schema: JSONSchemaInput,
  seen: WeakSet<object>,
  customValidatorMode: 'sync' | 'ignore',
  unicodeRegExp: boolean
): CompileNodeResult {
  if (schema === true) return { status: 'compiled', node: { kind: 'always' } }
  if (schema === false) return { status: 'unsupported', reason: 'unsupported-schema' }
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { status: 'unsupported', reason: 'non-object-schema' }
  }
  if (seen.has(schema)) return { status: 'unsupported', reason: 'unsupported-schema' }
  seen.add(schema)

  const source = schema as Record<string, unknown>
  if (containsDefault(source, new WeakSet<object>())) {
    return { status: 'unsupported', reason: 'contains-default' }
  }

  if (Array.isArray(source['anyOf']) || Array.isArray(source['oneOf'])) {
    return compileUnionPlan(source, seen, customValidatorMode, unicodeRegExp)
  }

  const typeValue = source['type']
  const types = normalizePrimitiveTypes(typeValue)
  if (typeValue !== undefined && !types) return { status: 'unsupported', reason: 'unsupported-type' }

  if (types?.includes('array')) {
    return compileArrayPlan(source, seen, customValidatorMode, unicodeRegExp)
  }
  if (types?.includes('object')) {
    return compileObjectPlan(source, seen, customValidatorMode, unicodeRegExp)
  }

  return compileScalarPlan(source, types as PrimitiveType[] | null, customValidatorMode, unicodeRegExp)
}

function compileUnionPlan(
  source: Record<string, unknown>,
  seen: WeakSet<object>,
  customValidatorMode: 'sync' | 'ignore',
  unicodeRegExp: boolean
): CompileNodeResult {
  // 两个组合关键词是合取关系，单个 union 节点无法完整表示。
  if (source['anyOf'] !== undefined && source['oneOf'] !== undefined) {
    return { status: 'unsupported', reason: 'unsupported-keyword' }
  }
  const mode = Array.isArray(source['anyOf']) ? 'anyOf' : 'oneOf'
  const allowed = new Set([...UNION_KEYS, ...ANNOTATION_KEYS])
  if (findUnsupportedKeyword(source, allowed)) {
    return { status: 'unsupported', reason: 'unsupported-keyword' }
  }

  const branches = source[mode]
  if (!Array.isArray(branches) || branches.length === 0) {
    return { status: 'unsupported', reason: 'unsupported-schema' }
  }

  const branchPlans: ValidationPlanNode[] = []
  for (const branch of branches) {
    const result = compilePlanNode(branch as JSONSchemaInput, seen, customValidatorMode, unicodeRegExp)
    if (result.status === 'unsupported') return result
    branchPlans.push(result.node)
  }

  const primitiveTypes = tryCollectPlainPrimitiveUnion(branchPlans, mode)
  if (primitiveTypes) {
    return { status: 'compiled', node: createScalarPlanNode({ types: primitiveTypes }) }
  }

  return { status: 'compiled', node: { kind: 'union', mode, branches: branchPlans } }
}

function compileArrayPlan(
  source: Record<string, unknown>,
  seen: WeakSet<object>,
  customValidatorMode: 'sync' | 'ignore',
  unicodeRegExp: boolean
): CompileNodeResult {
  const allowed = new Set([...ARRAY_KEYS, ...ANNOTATION_KEYS])
  if (findUnsupportedKeyword(source, allowed)) {
    return { status: 'unsupported', reason: 'unsupported-keyword' }
  }

  if (!numberOrNull(source['minItems']) || !numberOrNull(source['maxItems'])) {
    return { status: 'unsupported', reason: 'unsupported-schema' }
  }

  const itemSchema = source['items']
  if (Array.isArray(itemSchema)) return { status: 'unsupported', reason: 'unsupported-schema' }

  const item = itemSchema === undefined
    ? null
    : compilePlanNode(itemSchema as JSONSchemaInput, seen, customValidatorMode, unicodeRegExp)
  if (item && item.status === 'unsupported') return item

  return {
    status: 'compiled',
    node: {
      kind: 'array',
      minItems: typeof source['minItems'] === 'number' ? source['minItems'] : null,
      maxItems: typeof source['maxItems'] === 'number' ? source['maxItems'] : null,
      item: item?.node ?? null,
    },
  }
}

function compileObjectPlan(
  source: Record<string, unknown>,
  seen: WeakSet<object>,
  customValidatorMode: 'sync' | 'ignore',
  unicodeRegExp: boolean
): CompileNodeResult {
  const allowed = new Set([...OBJECT_KEYS, ...ANNOTATION_KEYS])
  if (findUnsupportedKeyword(source, allowed)) {
    return { status: 'unsupported', reason: 'unsupported-keyword' }
  }

  const requiredValue = source['required']
  if (requiredValue !== undefined && (!Array.isArray(requiredValue) || !requiredValue.every(item => typeof item === 'string'))) {
    return { status: 'unsupported', reason: 'unsupported-schema' }
  }

  const propertiesValue = source['properties']
  if (propertiesValue !== undefined && (!propertiesValue || typeof propertiesValue !== 'object' || Array.isArray(propertiesValue))) {
    return { status: 'unsupported', reason: 'unsupported-schema' }
  }

  const properties: Array<[string, ValidationPlanNode]> = []
  if (propertiesValue && typeof propertiesValue === 'object' && !Array.isArray(propertiesValue)) {
    for (const [key, childSchema] of Object.entries(propertiesValue as Record<string, JSONSchemaInput>)) {
      const child = compilePlanNode(childSchema, seen, customValidatorMode, unicodeRegExp)
      if (child.status === 'unsupported') return child
      properties.push([key, child.node])
    }
  }

  return {
    status: 'compiled',
    node: {
      kind: 'object',
      required: Array.isArray(requiredValue) ? requiredValue : [],
      properties,
    },
  }
}

function compileScalarPlan(
  source: Record<string, unknown>,
  types: PrimitiveType[] | null,
  customValidatorMode: 'sync' | 'ignore',
  unicodeRegExp: boolean
): CompileNodeResult {
  const allowed = new Set([...SCALAR_KEYS, ...ANNOTATION_KEYS])
  if (findUnsupportedKeyword(source, allowed)) {
    return { status: 'unsupported', reason: 'unsupported-keyword' }
  }

  const enumValues = source['enum']
  if (enumValues !== undefined && (!Array.isArray(enumValues) || !enumValues.every(isJsonScalar))) {
    return { status: 'unsupported', reason: 'unsupported-enum' }
  }
  const constValue = source['const']
  if (constValue !== undefined && !isJsonScalar(constValue)) {
    return { status: 'unsupported', reason: 'unsupported-enum' }
  }

  if (!numberOrNull(source['minLength']) || !numberOrNull(source['maxLength'])
    || !numberOrNull(source['minimum']) || !numberOrNull(source['maximum'])) {
    return { status: 'unsupported', reason: 'unsupported-schema' }
  }

  const exclusiveMinimum = normalizeExclusiveBound(source['exclusiveMinimum'], source['minimum'])
  const exclusiveMaximum = normalizeExclusiveBound(source['exclusiveMaximum'], source['maximum'])
  if (exclusiveMinimum === false || exclusiveMaximum === false) {
    return { status: 'unsupported', reason: 'unsupported-schema' }
  }

  let pattern: RegExp | null = null
  if (source['pattern'] !== undefined) {
    if (typeof source['pattern'] !== 'string') return { status: 'unsupported', reason: 'unsupported-schema' }
    try {
      pattern = new RegExp(source['pattern'], unicodeRegExp ? 'u' : '')
    } catch {
      return { status: 'unsupported', reason: 'invalid-pattern' }
    }
  }

  let format: SupportedFormat | null = null
  if (source['format'] !== undefined) {
    if (source['format'] !== 'email') return { status: 'unsupported', reason: 'unsupported-keyword' }
    format = 'email'
  }

  let customValidators: CustomValidator[] | null = null
  const customValidatorValue = source['_customValidators']
  if (customValidatorValue !== undefined && customValidatorMode === 'sync') {
    if (!Array.isArray(customValidatorValue)) return { status: 'unsupported', reason: 'unsupported-schema' }
    customValidators = []
    for (const validator of customValidatorValue) {
      if (typeof validator !== 'function') continue
      if (isDeclaredAsyncFunction(validator)) return { status: 'unsupported', reason: 'unsupported-schema' }
      customValidators.push(validator as CustomValidator)
    }
    if (customValidators.length === 0) customValidators = null
  } else if (customValidatorValue !== undefined && !Array.isArray(customValidatorValue)) {
    return { status: 'unsupported', reason: 'unsupported-schema' }
  }

  return {
    status: 'compiled',
    node: {
      kind: 'scalar',
      types,
      enumValues: Array.isArray(enumValues) ? enumValues as JsonScalar[] : null,
      constValue: constValue === undefined ? NO_CONST : constValue as JsonScalar,
      minLength: typeof source['minLength'] === 'number' ? source['minLength'] : null,
      maxLength: typeof source['maxLength'] === 'number' ? source['maxLength'] : null,
      pattern,
      minimum: typeof source['minimum'] === 'number' ? source['minimum'] : null,
      maximum: typeof source['maximum'] === 'number' ? source['maximum'] : null,
      exclusiveMinimum,
      exclusiveMaximum,
      format,
      customValidators,
    },
  }
}

function createNodeValidator(node: ValidationPlanNode): (data: unknown) => boolean {
  switch (node.kind) {
    case 'always':
      return () => true
    case 'scalar':
      return createScalarValidator(node)
    case 'array':
      return createArrayValidator(node)
    case 'union':
      return createUnionValidator(node)
    case 'object':
      return createObjectValidator(node)
  }
}

function createScalarPlanNode(overrides: Partial<ScalarPlanNode> = {}): ScalarPlanNode {
  return {
    kind: 'scalar',
    types: null,
    enumValues: null,
    constValue: NO_CONST,
    minLength: null,
    maxLength: null,
    pattern: null,
    minimum: null,
    maximum: null,
    exclusiveMinimum: null,
    exclusiveMaximum: null,
    format: null,
    customValidators: null,
    ...overrides,
  }
}

function tryCollectPlainPrimitiveUnion(nodes: ValidationPlanNode[], mode: 'anyOf' | 'oneOf'): PrimitiveType[] | null {
  const types: PrimitiveType[] = []
  const seen = new Set<PrimitiveType>()

  for (const node of nodes) {
    if (node.kind !== 'scalar'
      || !node.types
      || node.types.length !== 1
      || node.enumValues
      || node.constValue !== NO_CONST
      || node.minLength !== null
      || node.maxLength !== null
      || node.pattern !== null
      || node.minimum !== null
      || node.maximum !== null
      || node.exclusiveMinimum !== null
      || node.exclusiveMaximum !== null
      || node.format !== null
      || node.customValidators) {
      return null
    }

    const type = node.types[0]!
    if (seen.has(type)) return null
    seen.add(type)
    types.push(type)
  }

  if (mode === 'oneOf' && seen.has('number') && seen.has('integer')) return null

  return types.length > 1 ? types : null
}

function createScalarValidator(node: ScalarPlanNode): (data: unknown) => boolean {
  const hasStringConstraints = node.minLength !== null || node.maxLength !== null || node.pattern !== null || node.format !== null
  const hasNumberConstraints = node.minimum !== null || node.maximum !== null
    || node.exclusiveMinimum !== null || node.exclusiveMaximum !== null
  if (!node.customValidators && !hasStringConstraints && !hasNumberConstraints && node.constValue === NO_CONST && node.enumValues) {
    // 编译时过滤不满足 type 的成员，保留运行时的单枚举谓词。
    const typeCheck = node.types ? createTypeUnionValidator(node.types) : null
    return createEnumValidator(typeCheck ? node.enumValues.filter(typeCheck) : node.enumValues)
  }
  if (!node.customValidators && !hasStringConstraints && !hasNumberConstraints && node.constValue === NO_CONST && !node.enumValues && node.types) {
    return createTypeUnionValidator(node.types)
  }
  if (!node.customValidators && !hasStringConstraints && node.constValue === NO_CONST && !node.enumValues && node.types?.length === 1
    && (node.types[0] === 'number' || node.types[0] === 'integer')) {
    return createNumberValidator(
      node.types[0] === 'integer',
      node.minimum,
      node.maximum,
      node.exclusiveMinimum,
      node.exclusiveMaximum
    )
  }

  const typeCheck = node.types ? createTypeUnionValidator(node.types) : null
  const enumCheck = node.enumValues ? createEnumValidator(node.enumValues) : null
  const constValue = node.constValue
  const customValidators = node.customValidators

  return (data: unknown): boolean => {
    if (typeCheck && !typeCheck(data)) return false

    if (enumCheck && !enumCheck(data)) return false
    if (constValue !== NO_CONST && constValue !== data) return false

    if (typeof data === 'string') {
      const length = Array.from(data).length
      if (node.minLength !== null && length < node.minLength) return false
      if (node.maxLength !== null && length > node.maxLength) return false
      if (node.pattern) {
        node.pattern.lastIndex = 0
        if (!node.pattern.test(data)) return false
      }
      if (node.format === 'email' && !isEmailFormatValid(data)) return false
    }

    if (typeof data === 'number') {
      if (node.minimum !== null && data < node.minimum) return false
      if (node.maximum !== null && data > node.maximum) return false
      if (node.exclusiveMinimum !== null && data <= node.exclusiveMinimum) return false
      if (node.exclusiveMaximum !== null && data >= node.exclusiveMaximum) return false
    }

    if (customValidators) {
      for (const validator of customValidators) {
        let result: unknown
        try {
          result = validator(data)
        } catch {
          return false
        }
        if (isPromiseLike(result)) return false
        if (result === false || typeof result === 'string') return false
        if (result !== null && typeof result === 'object' && (result as Record<string, unknown>)['error']) return false
      }
    }

    return true
  }
}

function createArrayValidator(node: ArrayPlanNode): (data: unknown) => boolean {
  const itemValidator = node.item ? createNodeValidator(node.item) : null
  return (data: unknown): boolean => {
    if (!Array.isArray(data)) return false
    if (node.minItems !== null && data.length < node.minItems) return false
    if (node.maxItems !== null && data.length > node.maxItems) return false
    if (!itemValidator) return true
    for (const item of data) {
      if (!itemValidator(item)) return false
    }
    return true
  }
}

function createUnionValidator(node: UnionPlanNode): (data: unknown) => boolean {
  const validators = node.branches.map(createNodeValidator)
  if (node.mode === 'anyOf') {
    return (data: unknown): boolean => {
      for (const validate of validators) {
        if (validate(data)) return true
      }
      return false
    }
  }

  return (data: unknown): boolean => {
    let matches = 0
    for (const validate of validators) {
      if (validate(data)) {
        matches += 1
        if (matches > 1) return false
      }
    }
    return matches === 1
  }
}

function createObjectValidator(node: ObjectPlanNode): (data: unknown) => boolean {
  const deepPathValidator = createDeepObjectPathValidator(node)
  if (deepPathValidator) return deepPathValidator

  const numericObjectValidator = createFlatRequiredNumericObjectValidator(node)
  if (numericObjectValidator) return numericObjectValidator

  const requiredSet = new Set(node.required)
  const requiredPropertyValidators: ObjectPropertyValidator[] = []
  const optionalPropertyValidators: ObjectPropertyValidator[] = []
  for (const [key, child] of node.properties) {
    const entry = [key, createNodeValidator(child)] as const
    if (requiredSet.delete(key)) {
      requiredPropertyValidators.push(entry)
    } else {
      optionalPropertyValidators.push(entry)
    }
  }
  const requiredOnly = Array.from(requiredSet)

  return (data: unknown): boolean => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false
    const record = data as Record<string, unknown>
    for (const [key, validate] of requiredPropertyValidators) {
      if (!Object.prototype.hasOwnProperty.call(record, key) || !validate(record[key])) return false
    }
    for (const key of requiredOnly) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) return false
    }
    for (const [key, validate] of optionalPropertyValidators) {
      if (Object.prototype.hasOwnProperty.call(record, key) && !validate(record[key])) return false
    }
    return true
  }
}

function createFlatRequiredNumericObjectValidator(node: ObjectPlanNode): ((data: unknown) => boolean) | null {
  if (node.properties.length === 0 || node.required.length !== node.properties.length) return null

  const requiredSet = new Set(node.required)
  const keys: string[] = []
  const integerOnlyFlags: boolean[] = []
  const minimums: Array<number | null> = []
  const maximums: Array<number | null> = []
  const exclusiveMinimums: Array<number | null> = []
  const exclusiveMaximums: Array<number | null> = []

  for (const [key, child] of node.properties) {
    if (!requiredSet.delete(key) || child.kind !== 'scalar') return null
    if (child.customValidators || child.enumValues || child.constValue !== NO_CONST || child.minLength !== null
      || child.maxLength !== null || child.pattern !== null || child.format !== null) return null
    if (!child.types || child.types.length !== 1 || (child.types[0] !== 'number' && child.types[0] !== 'integer')) return null

    keys.push(key)
    integerOnlyFlags.push(child.types[0] === 'integer')
    minimums.push(child.minimum)
    maximums.push(child.maximum)
    exclusiveMinimums.push(child.exclusiveMinimum)
    exclusiveMaximums.push(child.exclusiveMaximum)
  }
  if (requiredSet.size > 0) return null
  const propertyCount = keys.length

  return (data: unknown): boolean => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false
    const record = data as Record<string, unknown>
    for (let index = 0; index < propertyCount; index++) {
      const key = keys[index]!
      if (!Object.prototype.hasOwnProperty.call(record, key)) return false
      const value = record[key]
      if (typeof value !== 'number' || !Number.isFinite(value)) return false
      if (integerOnlyFlags[index] && !Number.isInteger(value)) return false
      const minimum = minimums[index]
      if (minimum !== null && value < minimum) return false
      const maximum = maximums[index]
      if (maximum !== null && value > maximum) return false
      const exclusiveMinimum = exclusiveMinimums[index]
      if (exclusiveMinimum !== null && value <= exclusiveMinimum) return false
      const exclusiveMaximum = exclusiveMaximums[index]
      if (exclusiveMaximum !== null && value >= exclusiveMaximum) return false
    }
    return true
  }
}

function createDeepObjectPathValidator(node: ObjectPlanNode): ((data: unknown) => boolean) | null {
  const path: string[] = []
  let current: ValidationPlanNode = node

  while (current.kind === 'object') {
    if (current.required.length !== 1 || current.properties.length !== 1) return null

    const requiredKey = current.required[0]
    const property: [string, ValidationPlanNode] | undefined = current.properties[0]
    if (!requiredKey || !property || property[0] !== requiredKey) return null

    path.push(requiredKey)
    current = property[1]
  }

  if (path.length < 2) return null

  const leafValidator = createNodeValidator(current)
  return (data: unknown): boolean => {
    let cursor = data
    for (const key of path) {
      if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return false
      const record = cursor as Record<string, unknown>
      if (!Object.prototype.hasOwnProperty.call(record, key)) return false
      cursor = record[key]
    }
    return leafValidator(cursor)
  }
}

function isEmailFormatValid(value: string): boolean {
  const emailFormat = EMAIL_FORMAT as unknown
  if (emailFormat instanceof RegExp) {
    emailFormat.lastIndex = 0
    return emailFormat.test(value)
  }
  if (typeof emailFormat === 'function') return emailFormat(value) === true
  if (emailFormat && typeof emailFormat === 'object' && 'validate' in emailFormat) {
    const validate = (emailFormat as { validate: unknown }).validate
    if (validate instanceof RegExp) {
      validate.lastIndex = 0
      return validate.test(value)
    }
    if (typeof validate === 'function') return validate(value) === true
  }
  return false
}

function isDeclaredAsyncFunction(value: unknown): boolean {
  return typeof value === 'function' && value.constructor.name === 'AsyncFunction'
}

function isPromiseLike(value: unknown): boolean {
  return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function'
}

function createNumberValidator(
  integerOnly: boolean,
  minimum: number | null,
  maximum: number | null,
  exclusiveMinimum: number | null,
  exclusiveMaximum: number | null
): (value: unknown) => boolean {
  return (value: unknown): boolean => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false
    if (integerOnly && !Number.isInteger(value)) return false
    if (minimum !== null && value < minimum) return false
    if (maximum !== null && value > maximum) return false
    if (exclusiveMinimum !== null && value <= exclusiveMinimum) return false
    if (exclusiveMaximum !== null && value >= exclusiveMaximum) return false
    return true
  }
}

function createPrimitiveTypeCheck(type: PrimitiveType): (value: unknown) => boolean {
  switch (type) {
    case 'string':
      return (value: unknown): boolean => typeof value === 'string'
    case 'number':
      return (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value)
    case 'integer':
      return (value: unknown): boolean => typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return (value: unknown): boolean => typeof value === 'boolean'
    case 'null':
      return (value: unknown): boolean => value === null
  }
}

function createTypeUnionValidator(types: PrimitiveType[]): (value: unknown) => boolean {
  if (types.length === 1) return createPrimitiveTypeCheck(types[0]!)

  const acceptsString = types.includes('string')
  const acceptsNumber = types.includes('number')
  const acceptsInteger = types.includes('integer')
  const acceptsBoolean = types.includes('boolean')
  const acceptsNull = types.includes('null')

  return (value: unknown): boolean => {
    switch (typeof value) {
      case 'string':
        return acceptsString
      case 'number':
        return Number.isFinite(value) && (acceptsNumber || (acceptsInteger && Number.isInteger(value)))
      case 'boolean':
        return acceptsBoolean
      default:
        return value === null && acceptsNull
    }
  }
}

function createEnumValidator(values: JsonScalar[]): (value: unknown) => boolean {
  switch (values.length) {
    case 0:
      return () => false
    case 1: {
      const first = values[0]
      return (value: unknown): boolean => value === first
    }
    case 2: {
      const first = values[0]
      const second = values[1]
      return (value: unknown): boolean => value === first || value === second
    }
    case 3: {
      const first = values[0]
      const second = values[1]
      const third = values[2]
      return (value: unknown): boolean => value === first || value === second || value === third
    }
    case 4: {
      const first = values[0]
      const second = values[1]
      const third = values[2]
      const fourth = values[3]
      return (value: unknown): boolean => value === first || value === second || value === third || value === fourth
    }
    default: {
      const enumSet = new Set(values)
      return (value: unknown): boolean => enumSet.has(value as JsonScalar)
    }
  }
}

function normalizePrimitiveTypes(value: unknown): SchemaType[] | null {
  if (value === undefined) return null
  const values = Array.isArray(value) ? value : [value]
  const types: SchemaType[] = []
  for (const item of values) {
    if (item === 'string' || item === 'number' || item === 'integer' || item === 'boolean' || item === 'null' || item === 'array' || item === 'object') {
      types.push(item)
    } else {
      return null
    }
  }
  return types
}

function isJsonScalar(value: unknown): value is JsonScalar {
  return value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
}

function numberOrNull(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

function normalizeExclusiveBound(value: unknown, fallback: unknown): number | null | false {
  if (value === undefined || value === false) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value === true && typeof fallback === 'number' && Number.isFinite(fallback)) return fallback
  return false
}

function findUnsupportedKeyword(source: Record<string, unknown>, allowed: Set<string>): string | null {
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) return key
  }
  return null
}

function containsDefault(value: unknown, seen: WeakSet<object>): boolean {
  if (!value || typeof value !== 'object') return false
  const objectValue = value as object
  if (seen.has(objectValue)) return false
  seen.add(objectValue)

  const source = value as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(source, 'default')) return true

  for (const child of Object.values(source)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        if (containsDefault(item, seen)) return true
      }
    } else if (containsDefault(child, seen)) {
      return true
    }
  }
  return false
}

function hasUnsupportedValidatorOption(ajvOptions: Record<string, unknown> | undefined): boolean {
  if (!ajvOptions) return false
  const code = ajvOptions['code']
  // 自定义正则引擎的行为由 AJV 负责，不能替换为原生 RegExp。
  if (code && typeof code === 'object' && (code as Record<string, unknown>)['regExp'] !== undefined) return true
  return ajvOptions['coerceTypes'] !== false || ajvOptions['removeAdditional'] !== false
}
