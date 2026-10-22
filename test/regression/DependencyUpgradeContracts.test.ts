/** 依赖升级后验证异步规则、缓存身份、配置隔离与 Schema 投影契约。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Validator } from '../../src/core/Validator.js'
import { Locale } from '../../src/core/Locale.js'
import {
  createMutableSchemaCacheProxy, createSchemaCacheKey, createSchemaShapeGuard,
  getMutableSchemaCacheState, isSchemaShapeGuardCurrent, markSchemaCacheKey,
  refreshMutableSchemaCacheState, unwrapMutableSchema,
} from '../../src/core/SchemaCacheKey.js'
import { cloneSchemaValue } from '../../src/utils/schemaClone.js'
import type { JSONSchemaInput } from '../../src/types/schema.js'
import { createRuntime } from '../../src/core/SchemaDslRuntime.js'
import { RuntimeValidatorEngine } from '../../src/core/RuntimeValidatorEngine.js'
import { RuntimeIssueFormatter } from '../../src/core/RuntimeIssueFormatter.js'
import { DslBuilder } from '../../src/core/DslBuilder.js'
import { SchemaUtils } from '../../src/utils/SchemaUtils.js'
import { validate } from '../../src/api.js'

type Wrapper = (leaf: Record<string, unknown>) => [JSONSchemaInput, unknown]
const asyncLocations: Array<[string, Wrapper]> = [
  ['root', leaf => [leaf, 'ok']],
  ['property', leaf => [{ type: 'object', properties: { value: leaf } }, { value: 'ok' }]],
  ['pattern property', leaf => [{ type: 'object', patternProperties: { '^v': leaf } }, { value: 'ok' }]],
  ['additional property', leaf => [{ type: 'object', properties: { known: {} }, additionalProperties: leaf }, { value: 'ok' }]],
  ['property name', leaf => [{ type: 'object', propertyNames: leaf }, { ok: 1 }]],
  ['items', leaf => [{ type: 'array', items: leaf }, ['ok']]],
  ['tuple', leaf => [{ type: 'array', items: [leaf] }, ['ok']]],
  ['additional item', leaf => [{ type: 'array', items: [{ type: 'number' }], additionalItems: leaf }, [1, 'ok']]],
  ['contains', leaf => [{ type: 'array', contains: leaf }, ['ok']]],
  ['allOf', leaf => [{ allOf: [leaf] }, 'ok']],
  ['anyOf', leaf => [{ anyOf: [{ type: 'number' }, leaf] }, 'ok']],
  ['oneOf', leaf => [{ oneOf: [{ type: 'number' }, leaf] }, 'ok']],
  ['then', leaf => [{ if: { type: 'string' }, then: leaf }, 'ok']],
  ['else', leaf => [{ if: { type: 'number' }, else: leaf }, 'ok']],
  ['local reference', leaf => [{ definitions: { value: leaf }, $ref: '#/definitions/value' }, 'ok']],
  ['dependency', leaf => [{ type: 'object', dependencies: { flag: { ...leaf, type: 'object' } } }, { flag: true }]],
]

describe('dependency upgrade: asynchronous schema contracts', () => {
  it('应该明确拒绝默认Draft-07未启用的dependentSchemas关键字', async () => {
    const validator = new Validator({ logger: false })
    try {
      await expect(validator.validateAsync({
        type: 'object', dependentSchemas: { flag: { type: 'object' } },
      }, { flag: true })).rejects.toMatchObject({ name: 'SchemaCompileError' })
    } finally { validator.clearCache() }
  })

  it.each(asyncLocations)('应该在%s拒绝同步执行异步规则，并在异步入口执行规则', async (_name, wrap) => {
    let calls = 0
    const leaf = { type: 'string', _customValidators: [async () => { calls++; return true }] }
    const [schema, data] = wrap(leaf)
    const validator = new Validator({ strict: false, logger: false, smartCoerce: false })
    try {
      const sync = validator.validate(schema, data)
      expect(sync.valid).toBe(false)
      expect(sync.errors?.some(error => error.code === 'ASYNC_VALIDATION_NOT_SUPPORTED')).toBe(true)
      expect(calls).toBe(0)
      await expect(validator.validateAsync(schema, data)).resolves.toEqual(data)
      expect(calls).toBeGreaterThan(0)
    } finally { validator.clearCache() }
  })
})

describe('dependency upgrade: cache identity and schema copying', () => {
  it('应该对属性描述符修改、删除和原型变化失效，且不把重复写入当作变化', () => {
    const source = { type: 'object', properties: { value: { type: 'string' } } }
    const proxy = createMutableSchemaCacheProxy(source)
    const state = getMutableSchemaCacheState(proxy)!
    expect(unwrapMutableSchema(proxy)).toBe(source)
    const value = proxy.properties.value
    expect(proxy.properties.value).toBe(value)
    const before = state.version
    value.type = 'number'
    expect(state.version).toBeGreaterThan(before)
    const unchanged = state.version
    value.type = 'number'
    expect(state.version).toBe(unchanged)
    Object.defineProperty(proxy.properties, 'other', { value: { type: 'boolean' }, configurable: true, enumerable: true })
    expect(state.requiresShapeGuard).toBe(true)
    markSchemaCacheKey(proxy)
    expect(state.cacheKey).toBeTruthy()
    const alias = Object.getOwnPropertyDescriptor(proxy.properties, 'other')!.value
    alias.type = 'number'
    expect(refreshMutableSchemaCacheState(state)).toBe(false)
    expect(state.cacheKey).toBeNull()
    Reflect.deleteProperty(proxy.properties, 'other')
    const version = state.version
    Reflect.setPrototypeOf(proxy.properties, null)
    expect(state.version).toBeGreaterThan(version)
    expect(createMutableSchemaCacheProxy(proxy)).toBe(proxy)
  })

  it('应该识别数组形状变化并保持不可写属性的Proxy约束', () => {
    const schema = { enum: ['a', 'b'] }
    const guard = createSchemaShapeGuard(schema)
    expect(isSchemaShapeGuardCurrent({}, guard)).toBe(false)
    schema.enum.push('c')
    expect(isSchemaShapeGuardCurrent(schema, guard)).toBe(false)
    const locked = Object.freeze({ type: 'string' })
    const source = { child: locked }
    Object.defineProperty(source, 'child', { value: locked, configurable: false, writable: false })
    const proxy = createMutableSchemaCacheProxy(source)
    expect(proxy.child).toBe(locked)
    expect(Object.getOwnPropertyDescriptor(proxy, 'child')!.value).toBe(locked)
    expect(createSchemaCacheKey(Object.assign({}, { value: 1n }))).toBeNull()
  })

  it('应该保留循环引用、getter值与Date/RegExp，并隔离可变副本', () => {
    const symbol = Symbol('metadata')
    const input = { date: new Date('2026-01-01'), pattern: /x/iu, list: [1], [symbol]: { kind: 'schema' } }
    Object.defineProperty(input, 'resolved', { get: () => ({ value: 2 }), enumerable: true, configurable: true })
    Object.defineProperty(input, 'writeOnly', { set: (_value: unknown) => {}, configurable: true })
    const cyclic = input as typeof input & { self?: unknown; resolved?: { value: number } }
    cyclic.self = input
    const copy = cloneSchemaValue(cyclic)
    expect(copy.self).toBe(copy)
    expect(copy.resolved).toEqual({ value: 2 })
    expect(copy.date).toEqual(input.date)
    expect(copy.pattern.flags).toBe(input.pattern.flags)
    copy.list.push(2)
    expect(input.list).toEqual([1])
    expect(copy[symbol]).not.toBe(input[symbol])
    expect(Object.getOwnPropertyDescriptor(copy, 'writeOnly')!.set).toBeDefined()
  })
})

describe('dependency upgrade: custom locale introspection', () => {
  afterEach(() => Locale.reset())
  it('应该同时保留内置语言和自定义语言的消息表', () => {
    Locale.addLocale('test-locale', { rejected: { code: 'DENIED', message: 'denied' } })
    Locale.setMessages({ globalMessage: 'global' })
    expect(Locale.locales['test-locale']!['rejected']).toEqual({ code: 'DENIED', message: 'denied' })
    expect(Locale.locales['en-US']).toBeDefined()
    expect(Locale.getMessages('test-locale')['globalMessage']).toBe('global')
    expect(Locale.getMessage('rejected', {}, 'test-locale')).toEqual({ code: 'DENIED', message: 'denied' })
  })
})

describe('dependency upgrade: isolated runtime configuration', () => {
  it('应该合并各配置表，并在replace/reset时释放旧类型与消息', () => {
    const runtime = createRuntime({
      types: { initial: { type: 'string' } }, dynamicTypes: { dynamicInitial: () => ({ type: 'number' }) },
      messages: { initial: 'initial' }, validator: { allErrors: true },
      patterns: { phone: { test: { pattern: /^abc$/, key: 'test' } } },
    })
    try {
      runtime.configure({
        types: { next: { type: 'boolean' } }, dynamicTypes: { dynamicNext: () => ({ type: 'integer' }) },
        messages: { next: 'next' }, validator: { useDefaults: true },
        patterns: { idCard: { test: { pattern: /^xyz$/, key: 'test' } } }, strict: true,
      })
      expect(runtime.compile('initial').type).toBe('string')
      expect(runtime.compile('next').type).toBe('boolean')
      expect(runtime.compile('dynamicInitial').type).toBe('number')
      expect(runtime.compile('dynamicNext').type).toBe('integer')
      expect(runtime.createI18nError('initial').message).toBe('initial')
      expect(runtime.createI18nError('next').message).toBe('next')
      const item = runtime.compileField('array').items('initial')
      expect(runtime.validate(item, ['abc']).valid).toBe(true)
      expect(runtime.validate(item, [4], { coerce: false }).valid).toBe(false)
      runtime.configure({ strict: true, messages: { replaced: 'replacement' } }, { mode: 'replace' })
      expect(() => runtime.compile('initial')).toThrow()
      expect(runtime.createI18nError('initial').message).toBe('initial')
      expect(runtime.createI18nError('replaced').message).toBe('replacement')
      runtime.configure({}, { mode: 'reset' })
      expect(runtime.getStats().customTypeCount).toBe(0)
      expect(runtime.getStats().dynamicTypeCount).toBe(0)
      expect(runtime.createI18nError('replaced').message).toBe('replaced')
    } finally { runtime.dispose() }
  })

  it('应该隔离快速AJV编译失败，保留contains范围语义并清理缓存', () => {
    const formatter = new RuntimeIssueFormatter({ messages: { custom: { code: 409, message: 'value {value}' } } })
    const engine = new RuntimeValidatorEngine({}, formatter, {})
    try {
      expect(engine.quickValidate({ type: 'unknown' } as JSONSchemaInput, 1)).toBe(false)
      const schema = { type: 'array', contains: { type: 'number' }, minContains: 2, maxContains: 2 }
      expect(engine.quickValidate(schema, [1, 2, 'x'])).toBe(true)
      expect(engine.quickValidate(schema, [1, 'x'])).toBe(false)
      expect(engine.quickValidate(schema, [1, 2, 3])).toBe(false)
      expect(engine.getValidator({ coerceTypes: false })).not.toBe(engine.getDefaultValidator())
      expect(formatter.resolveCode('custom')).toBe(409)
      expect(formatter.resolveCode('missing')).toBe('missing')
      formatter.configure({ messageProvider: undefined })
      expect(formatter.resolveText('custom', { value: 2 })).toBe('value 2')
      engine.clearCache()
      expect(engine.getStats().defaultCache.size).toBe(0)
    } finally { engine.dispose(); formatter.dispose() }
  })
})

describe('dependency upgrade: builder and projection contracts', () => {
  it.each([
    [{ type: ['string', 'number', 'boolean', 'null'] }, ['ok', 2, true, null], [{}, undefined]],
    [{ enum: ['a', 'b', 'c'] }, ['a', 'b', 'c'], ['d', 1]],
    [{ enum: [1, 2, 3, 4] }, [1, 4], [5, '1']],
    [{ type: 'null', enum: [null] }, [null], ['null', 0]],
    [{ type: 'integer', const: 2 }, [2], [3, '2', 1.5]],
  ])('应该在重复验证后保持标量类型、enum与const约束：%j', (schema, accepted, rejected) => {
    const builder = DslBuilder.fromSchema(schema)
    for (let run = 0; run < 2; run++) {
      for (const value of accepted) expect(validate(builder, value, { coerce: false }).valid).toBe(true)
      for (const value of rejected) expect(validate(builder, value, { coerce: false }).valid).toBe(false)
    }
  })

  it('应该在字段投影中保留闭合条件，删除指定字段的嵌套必填约束', () => {
    const schema = {
      type: 'object', properties: { value: { type: 'number' }, dropped: { type: 'string' } },
      required: ['value'], allOf: [{ required: ['value'] }],
      anyOf: [{ required: ['value'] }], oneOf: [{ required: ['value'] }],
      if: { required: ['value'] }, then: { required: ['value'] }, else: { required: ['value'] },
      dependencies: { value: { required: ['value'] } }, dependentSchemas: { value: { required: ['value'] } },
    }
    const optional = SchemaUtils.partial(schema, ['value'])
    expect(optional.required).toBeUndefined()
    expect(optional.allOf?.[0]?.required).toBeUndefined()
    expect(optional.anyOf?.[0]?.required).toBeUndefined()
    expect(optional.dependencies?.['value']).toEqual({})
    const picked = SchemaUtils.pick(schema, ['value'])
    expect(picked.properties).toEqual({ value: { type: 'number' } })
    expect(picked.if).toEqual({ required: ['value'] })
    expect(schema.properties.dropped).toEqual({ type: 'string' })
    expect(() => SchemaUtils.pick({ type: 'object', $ref: '#/definitions/a' }, ['value'])).toThrow(/\$ref/)
  })

  it('应该在文档导出中表达布尔Schema及单侧数值和长度约束', () => {
    const schema = { type: 'object', properties: {
      allowed: true, forbidden: false, short: { type: 'string', minLength: 2 },
      limited: { type: 'string', maxLength: 4 }, range: { type: 'number', minimum: 1, maximum: 3 },
      lower: { type: 'number', minimum: 0 }, upper: { type: 'number', maximum: 5 },
    } }
    for (const result of [SchemaUtils.toMarkdown(schema), SchemaUtils.toHTML(schema)]) {
      for (const constraint of ['any', 'never', 'minLength: 2', 'maxLength: 4', 'range: 1-3', 'minimum: 0', 'maximum: 5']) {
        expect(result).toContain(constraint)
      }
    }
  })
})
