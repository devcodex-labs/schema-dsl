/** 依赖升级后验证解析边界、跨入口缓存协议与导出错误路径。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { config, dsl, resetRuntimeState, validate } from '../../src/api.js'
import { DslBuilder, DSL_BUILDER_VALIDATION_SCHEMA } from '../../src/core/DslBuilder.js'
import { ConditionalBuilder } from '../../src/core/ConditionalBuilder.js'
import { Validator } from '../../src/core/Validator.js'
import { DslParser } from '../../src/parser/DslParser.js'
import { ConstraintParser } from '../../src/parser/ConstraintParser.js'
import { TypeRegistry } from '../../src/parser/TypeRegistry.js'
import { MongoDBExporter } from '../../src/exporters/MongoDBExporter.js'
import { MySQLExporter } from '../../src/exporters/MySQLExporter.js'
import { PostgreSQLExporter } from '../../src/exporters/PostgreSQLExporter.js'

afterEach(() => resetRuntimeState())

describe('dependency upgrade: parser and namespace boundaries', () => {
  it('应该保留布尔与数值枚举，并拒绝混合或空枚举', () => {
    expect(dsl.enum(true, false).toSchema().enum).toEqual([true, false])
    expect(dsl.enum([1, 2, 3]).toSchema().enum).toEqual([1, 2, 3])
    expect(() => dsl.enum()).toThrow(/at least one/)
    expect(() => dsl.enum('a', 1 as never)).toThrow(/all strings/)
    expect(() => dsl.type(' ')).toThrow(/non-empty/)
    expect(dsl.phone().toSchema().type).toBe('string')
    expect(dsl.username().toSchema().type).toBe('string')
    expect(dsl.password().toSchema().type).toBe('string')
    expect(dsl.array({ type: 'array', items: { type: 'string', _required: true } }).toSchema().items).toEqual({ type: 'array', items: { type: 'string' } })
  })

  it('应该保留嵌套match/if分支、默认分支与布尔选择值', () => {
    const schema = dsl({
      mode: 'string', other: 'string', flag: 'boolean',
      value: dsl.match('mode', {
        a: dsl.match('other', { x: 'number!', _default: 'string!' }),
        b: dsl.if('flag', 'number!', dsl.if('otherFlag', 'boolean!', 'string!')),
        ignored: null,
        _default: dsl.if('flag', 'boolean!', dsl.match('other', { x: 'number!', _default: 'string!' })),
      }),
    })
    for (const [data, valid] of [
      [{ mode: 'a', other: 'x', value: 3 }, true],
      [{ mode: 'a', other: 'x', value: 'bad' }, false],
      [{ mode: 'b', flag: true, value: 3 }, true],
      [{ mode: 'b', flag: false, value: 'ok' }, true],
      [{ mode: 'z', flag: true, value: true }, true],
      [{ mode: 'z', flag: false, other: 'x', value: 3 }, true],
    ] as const) expect(validate(schema, data, { coerce: false }).valid).toBe(valid)
    const booleanSelector = dsl({ flag: { type: ['null', 'boolean'] }, value: dsl.match('flag', { true: 'number!', false: 'string!' }) })
    expect(validate(booleanSelector, { flag: true, value: 'bad' }, { coerce: false }).valid).toBe(false)
    expect(validate(booleanSelector, { flag: false, value: 'ok' }, { coerce: false }).valid).toBe(true)
    const nestedDefault = dsl({ value: dsl.match('kind', { _default: dsl.match('other', { a: 'number!' }) }) })
    expect(validate(nestedDefault, { other: 'a', value: 'bad' }, { coerce: false }).valid).toBe(false)
    const nestedElse = dsl({ value: dsl.if('flag', 'number!', dsl.match('kind', { a: 'string!' })) })
    expect(validate(nestedElse, { flag: false, kind: 'a', value: 9 }, { coerce: false }).valid).toBe(false)
  })

  it('应该拒绝无效数值与布尔约束，并报告被忽略的约束', () => {
    expect(ConstraintParser.parse('true|false', 'boolean')).toEqual({ enum: [true, false] })
    expect(() => ConstraintParser.parse('true|yes', 'boolean')).toThrow(/boolean enum/)
    expect(() => ConstraintParser.parse('1|1.5', 'integer')).toThrow(/integer enum/)
    expect(() => ConstraintParser.parse('1|NaN', 'number')).toThrow(/number enum/)
    expect(ConstraintParser.parse('   ', 'string')).toEqual({})
    expect(ConstraintParser.parse('4', 'array')).toEqual({ maxItems: 4 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(ConstraintParser.parse('-.', 'string')).toEqual({})
      expect(ConstraintParser.parse('unsupported', 'string')).toEqual({})
      expect(warn).toHaveBeenCalledTimes(2)
    } finally { warn.mockRestore() }
  })

  it('应该在转换exactLength时保留循环引用与共享Schema身份', () => {
    const branches: unknown[] = []
    const schema = { type: 'string', exactLength: 3, _label: 'internal', allOf: branches, anyOf: branches }
    branches.push(schema)
    const copy = TypeRegistry.toJsonSchema(schema)
    expect(copy.minLength).toBe(3)
    expect(copy.maxLength).toBe(3)
    expect(copy._label).toBeUndefined()
    expect(copy.allOf).toBe(copy.anyOf)
    expect(copy.allOf?.[0]).toBe(copy)
    expect(() => TypeRegistry.register('', {})).toThrow(/non-empty/)
    expect(() => TypeRegistry.registerDynamic('', () => ({}))).toThrow(/non-empty/)
    expect(() => TypeRegistry.registerDynamic('string', () => ({}))).toThrow(/built-in/)
    expect(DslParser.parseString('resolved', { typeResolver: () => () => ({ type: 'boolean' }) }).type).toBe('boolean')
    expect(DslParser.parseString('resolved', { typeResolver: () => ({ type: 'number' }) }).type).toBe('number')
  })

  it('应该拒绝缺失的可配置模式和无效的预设名称', () => {
    const emptyPatterns = { common: {}, phone: {} }
    for (const name of ['domain', 'ip', 'base64', 'jwt'] as const) {
      expect(() => new DslBuilder('string', { patterns: emptyPatterns })[name]()).toThrow(/Unsupported common pattern/)
    }
    expect(() => new DslBuilder('string', { patterns: emptyPatterns }).phone('missing')).toThrow(/Unsupported country/)
    expect(() => new DslBuilder('string').password('missing')).toThrow(/Invalid password strength/)
    expect(DslBuilder.fromSchema({ type: 'null' }).enum(null).toSchema().enum).toEqual([null])
    expect(DslBuilder.fromSchema({}).enum('a').toSchema().enum).toEqual(['a'])
  })
})

describe('dependency upgrade: async custom rule result contracts', () => {
  it('应该验证属性、元组与additionalItems中被AJV跳过的属性名', async () => {
    const ownString = { type: 'object', properties: JSON.parse('{"__proto__":{"type":"string"}}'), required: ['__proto__'] }
    const tuple = { type: 'array', items: [ownString], additionalItems: ownString }
    const good = JSON.parse('{"__proto__":"ok"}')
    const bad = JSON.parse('{"__proto__":123}')
    expect(Validator.quickValidate(tuple, [good, good])).toBe(true)
    expect(Validator.quickValidate(tuple, [bad, good])).toBe(false)
    expect(Validator.quickValidate(tuple, [good, bad])).toBe(false)
    expect(Validator.quickValidate({ type: 'object', properties: { nested: ownString, missing: ownString } }, { nested: bad })).toBe(false)
    expect(Validator.quickValidate({ type: 'unknown' }, 1)).toBe(false)
    const validator = new Validator({ logger: false })
    try {
      await expect(validator.validateAsync(tuple, [good, bad])).rejects.toMatchObject({ errors: expect.arrayContaining([expect.objectContaining({ path: '1/__proto__' })]) })
    } finally { validator.clearCache() }
  })

  it.each([
    ['string error', () => 'rejected'],
    ['error object', () => ({ error: true, message: 'rejected' })],
    ['thrown string', () => { throw 'rejected' }],
  ])('应该在同步与异步错误格式化中保留%s', async (_name, custom) => {
    const validator = new Validator({ logger: false })
    const schema = { type: 'string', _customValidators: [custom] }
    try {
      expect(validator.validate(schema, 'value').valid).toBe(false)
      await expect(validator.validateAsync(schema, 'value')).rejects.toMatchObject({ message: expect.stringContaining('rejected') })
    } finally { validator.clearCache() }
  })

  it('应该把旧validate异常转换成验证错误，并允许无结果返回', async () => {
    const validator = new Validator({ logger: false })
    try {
      await expect(validator.validateAsync({ type: 'string', validate: async () => undefined }, 'ok')).resolves.toBe('ok')
      await expect(validator.validateAsync({ type: 'string', validate: async () => { throw new Error('legacy rejected') } }, 'ok')).rejects.toMatchObject({ message: expect.stringContaining('legacy rejected') })
      expect(() => validator.validateBatch({ type: 'string' }, 'invalid' as never)).toThrow(/array/)
    } finally { validator.clearCache() }
  })
})

describe('dependency upgrade: shared builder and cache configuration', () => {
  it('应该在缓存命中和变更后更新跨入口builder的验证Schema', () => {
    const builder = new DslBuilder('string')
    const bridge = {
      toSchema: () => builder.toSchema(),
      [DSL_BUILDER_VALIDATION_SCHEMA]: () => builder[DSL_BUILDER_VALIDATION_SCHEMA](),
    }
    for (let round = 0; round < 2; round++) expect(validate(bridge as never, 'ok', { coerce: false }).valid).toBe(true)
    builder.min(3)
    expect(validate(bridge as never, 'ok', { coerce: false }).valid).toBe(false)
    expect(validate(bridge as never, 'long', { coerce: false }).valid).toBe(true)
    expect(validate(bridge as never, 'long', { coerce: false }).valid).toBe(true)
  })

  it('应该应用新旧模式配置，并更新两种验证器的缓存配置', () => {
    validate({ type: 'object', properties: { n: { type: 'number' } } }, { n: '2' })
    validate({ type: 'number' }, 2, { coerce: false })
    const preset = { custom: { pattern: /^custom$/, key: 'custom' } }
    config({ patterns: { phone: preset, idCard: preset, creditCard: preset }, cache: { maxSize: 8 } })
    expect(dsl.phone('custom').toSchema().pattern).toBe('^custom$')
    config({ phone: preset, idCard: preset, creditCard: preset } as never)
    expect(dsl('string').idCard('custom').toSchema().pattern).toBe('^custom$')
    const schema = dsl({ nested: { n: 'number' }, values: 'array<number>' })
    expect(validate(schema, { nested: { n: '2' }, values: ['3'] }).data).toEqual({ nested: { n: 2 }, values: [3] })
    expect(validate(schema, { nested: { n: '2' }, values: ['3'] }).valid).toBe(true)
  })

  it('应该保留elseIf选择，并拒绝无效条件函数', () => {
    for (const method of ['and', 'or', 'elseIf'] as const) {
      expect(() => new ConditionalBuilder().if(() => true)[method](null as never)).toThrow(/function/)
    }
    const conditional = new ConditionalBuilder().if(() => false).then('string').elseIf(() => true).then('number')
    expect(conditional.validate(2).valid).toBe(true)
    expect(conditional.validate('wrong', { coerceTypes: false, smartCoerce: false }).valid).toBe(false)
    const throwing = new ConditionalBuilder().if(() => { throw new Error('condition failed') }).then('number').else('string')
    expect(throwing.validate('fallback').valid).toBe(true)
  })
})

describe('dependency upgrade: exporter edge contracts', () => {
  it('应该投影Mongo联合类型与元组，并拒绝非Schema输入', () => {
    const exporter = new MongoDBExporter()
    expect(() => exporter.export(null)).toThrow(/Invalid JSON Schema/)
    expect(exporter.export({ anyOf: [{ type: 'string' }, { type: 'number' }, {}] }).$jsonSchema.bsonType).toEqual(['string', 'double'])
    expect(exporter.export({ oneOf: [{ type: 'string' }, { type: 'string' }] }).$jsonSchema.bsonType).toBe('string')
    expect(exporter.export({ type: 'array', items: [{ type: 'string' }, { type: 'integer' }] }).$jsonSchema.items).toEqual([{ bsonType: 'string' }, { bsonType: 'int' }])
  })

  it('应该引用SQL标识符，并序列化null、布尔与JSON默认值', () => {
    const schema = { type: 'object', properties: {
      nullable: { type: 'string', default: null }, enabled: { type: 'boolean', default: true },
      disabled: { type: 'boolean', default: false }, settings: { type: 'object', default: { x: "it's" } },
      count: { type: 'number', default: 2, maximum: 5 },
    } }
    const mysql = new MySQLExporter()
    const postgres = new PostgreSQLExporter()
    expect(mysql.generateIndex('table', 'value')).toContain('`idx_table_value`')
    expect(mysql.generateIndex('table', 'value', { name: 'unique_value', unique: true })).toContain('CREATE UNIQUE INDEX')
    const mysqlDDL = mysql.export('table', schema)
    const postgresDDL = postgres.export('table', schema)
    expect(mysqlDDL).toContain('DEFAULT NULL')
    expect(mysqlDDL).toContain('DEFAULT 1')
    expect(mysqlDDL).toContain('DEFAULT 0')
    expect(postgresDDL).toContain('DEFAULT TRUE')
    expect(postgresDDL).toContain('DEFAULT FALSE')
    expect(postgresDDL).toContain('::JSONB')
    expect(postgresDDL).toContain('<= 5')
    expect(() => new PostgreSQLExporter({ schema: '' }).export('table', schema)).toThrow(/identifier/)
    expect(mysql.export('empty', { type: 'object' })).toContain('CREATE TABLE')
    expect(postgres.export('empty', { type: 'object' })).toContain('CREATE TABLE')
  })
})
