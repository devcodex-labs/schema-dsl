import { Ajv } from 'ajv'
import { describe, expect, it } from 'vitest'
import { Validator, type ValidatorOptions } from '../../src/core/Validator.js'
import { createRuntime } from '../../src/runtime.js'
import type { JSONSchemaInput } from '../../src/types/schema.js'

interface ParityCase {
  name: string
  schema: JSONSchemaInput
  data: unknown
  valid: boolean
  options?: ValidatorOptions
}

const customRegExp = Object.assign((source: string, flags: string) =>
  new RegExp(source === '^..$' ? '^x$' : source, flags), { code: 'customRegExp' })

const cases: ParityCase[] = [
  { name: 'F01 type与enum冲突', schema: { type: 'string', enum: [1] }, data: 1, valid: false },
  { name: 'F01 混合enum拒绝错误类型', schema: { type: 'string', enum: ['x', 1, null] }, data: 1, valid: false },
  { name: 'F01 混合enum接受匹配字符串', schema: { type: 'string', enum: ['x', 1, null] }, data: 'x', valid: true },
  { name: 'F01 nullable enum接受null', schema: { type: ['string', 'null'], enum: ['x', 1, null] }, data: null, valid: true },
  { name: 'F01 nullable enum拒绝number', schema: { type: ['string', 'null'], enum: ['x', 1, null] }, data: 1, valid: false },
  { name: 'F01 integer拒绝小数enum', schema: { type: 'integer', enum: [1, 1.5] }, data: 1.5, valid: false },
  { name: 'F01 integer接受整数enum', schema: { type: 'integer', enum: [1, 1.5] }, data: 1, valid: true },
  { name: 'F01 number接受小数enum', schema: { type: 'number', enum: [1, 1.5] }, data: 1.5, valid: true },
  { name: 'F01 无type保留混型enum', schema: { enum: [1, 'x', null] }, data: 1, valid: true },
  { name: 'F01 单独null类型拒绝字符串', schema: { type: 'null', enum: [null, 'x'] }, data: 'x', valid: false },
  { name: 'F02 冲突组合拒绝', schema: { anyOf: [{ type: 'string' }], oneOf: [{ type: 'number' }] }, data: 'x', valid: false },
  { name: 'F02 组合交集接受', schema: { anyOf: [{ type: 'string' }], oneOf: [{ type: 'string', minLength: 2 }] }, data: 'xx', valid: true },
  { name: 'F02 组合交集拒绝', schema: { anyOf: [{ type: 'string' }], oneOf: [{ type: 'string', minLength: 2 }] }, data: 'x', valid: false },
  { name: 'F02 oneOf多重命中拒绝', schema: { anyOf: [{ type: 'number' }], oneOf: [{ type: 'number' }, { type: 'integer' }] }, data: 1, valid: false },
  { name: 'F02 oneOf单重命中接受', schema: { anyOf: [{ type: 'number' }], oneOf: [{ type: 'number' }, { type: 'integer' }] }, data: 1.5, valid: true },
  { name: 'F02 三个组合关键词合取', schema: { allOf: [{ type: 'number' }], anyOf: [{ minimum: 1 }], oneOf: [{ maximum: 3 }] }, data: 4, valid: false },
  { name: 'F03 emoji不是两个码点', schema: { type: 'string', pattern: '^..$' }, data: '😀', valid: false },
  { name: 'F03 两个emoji是两个码点', schema: { type: 'string', pattern: '^..$' }, data: '😀😀', valid: true },
  { name: 'F03 Unicode字符类', schema: { type: 'string', pattern: '^\\p{L}+$' }, data: '中文', valid: true },
  { name: 'F03 Unicode字符类拒绝数字', schema: { type: 'string', pattern: '^\\p{L}+$' }, data: '12', valid: false },
  { name: 'F03 单个代理对匹配一个码点', schema: { type: 'string', pattern: '^.$' }, data: '\uD83D\uDE00', valid: true },
  { name: 'F03 显式关闭Unicode接受两个码元', schema: { type: 'string', pattern: '^..$' }, data: '😀', valid: true, options: { unicodeRegExp: false } },
  { name: 'F03 显式关闭Unicode拒绝单码元匹配', schema: { type: 'string', pattern: '^.$' }, data: '😀', valid: false, options: { unicodeRegExp: false } },
  { name: 'F03 自定义正则拒绝emoji', schema: { type: 'string', pattern: '^..$' }, data: '😀', valid: false, options: { code: { regExp: customRegExp } } },
  { name: 'F03 自定义正则接受x', schema: { type: 'string', pattern: '^..$' }, data: 'x', valid: true, options: { code: { regExp: customRegExp } } },
]

const shapes = [
  { name: '根节点', wrap: (schema: JSONSchemaInput, data: unknown) => ({ schema, data }) },
  { name: '对象字段', wrap: (schema: JSONSchemaInput, data: unknown) => ({ schema: { type: 'object', properties: { value: schema }, required: ['value'] } as JSONSchemaInput, data: { value: data } }) },
  { name: '数组元素', wrap: (schema: JSONSchemaInput, data: unknown) => ({ schema: { type: 'array', items: schema } as JSONSchemaInput, data: [data] }) },
]

describe.each([true, false])('FastPlan与AJV一致性 cache=%s', cache => {
  describe.each(shapes)('$name', shape => {
    it.each(cases)('应该保持$name的同步、异步及runtime语义', async entry => {
      const options: ValidatorOptions = {
        strict: false, logger: false, allErrors: true,
        useDefaults: false, coerceTypes: false, removeAdditional: false,
        ...entry.options,
      }
      const input = shape.wrap(entry.schema, entry.data)
      const oracle = new Ajv(options).compile(input.schema)
      expect(oracle(structuredClone(input.data))).toBe(entry.valid)
      const validator = new Validator({ ...options, cache })
      const runtime = createRuntime({ validator: { ...options, cache } })
      try {
        const compiled = validator.compile(input.schema)
        for (let repeat = 0; repeat < 2; repeat++) {
          expect(compiled(structuredClone(input.data))).toBe(entry.valid)
          expect(validator.validate(input.schema, structuredClone(input.data)).valid).toBe(entry.valid)
          expect(runtime.validate(input.schema, structuredClone(input.data), { coerce: false }).valid).toBe(entry.valid)
          if (entry.valid) {
            await expect(validator.validateAsync(input.schema, structuredClone(input.data))).resolves.toEqual(input.data)
            await expect(runtime.validateAsync(input.schema, structuredClone(input.data), { coerce: false })).resolves.toEqual(input.data)
          } else {
            await expect(validator.validateAsync(input.schema, structuredClone(input.data))).rejects.toMatchObject({ name: 'ValidationError' })
            await expect(runtime.validateAsync(input.schema, structuredClone(input.data), { coerce: false })).rejects.toMatchObject({ name: 'ValidationError' })
          }
        }
      } finally {
        validator.clearCache()
        runtime.dispose()
      }
    })
  })
})
