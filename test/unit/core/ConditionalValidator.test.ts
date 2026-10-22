import { describe, expect, it, vi } from 'vitest'
import { ConditionalValidator, type ConditionalInternalSchema } from '../../../src/core/ConditionalValidator.js'
import { CONDITIONAL_RUNTIME_STATE } from '../../../src/core/ConditionalRuntime.js'
import type { JSONSchema } from '../../../src/types/schema.js'
import type { ValidateOptions, ValidationErrorItem, ValidationResult } from '../../../src/types/validate.js'

const issue = (path: string, message: string, keyword = 'conditional'): ValidationErrorItem => ({
  path,
  message,
  keyword,
  params: {},
})

function createValidator(overrides: Partial<ConstructorParameters<typeof ConditionalValidator>[0]> = {}) {
  const validateSchema = vi.fn((schema: JSONSchema, data: unknown): ValidationResult<unknown> => {
    if (schema.type === 'number' && typeof data !== 'number') {
      return { valid: false, data, errors: [issue('value', 'must be number', 'type')], errorMessage: 'must be number' }
    }
    if (schema.type === 'string' && typeof data !== 'string') {
      return { valid: false, data, errors: [issue('value', 'must be string', 'type')], errorMessage: 'must be string' }
    }
    return { valid: true, data, errors: [] }
  })
  const internalError = vi.fn((error: unknown, data: unknown): ValidationResult<unknown> => ({
    valid: false,
    data,
    errors: [issue('', error instanceof Error ? error.message : String(error), 'internal')],
    errorMessage: error instanceof Error ? error.message : String(error),
  }))
  const getMessageText = vi.fn((key: string, params: Record<string, unknown>) => {
    const label = params['label'] ? `${String(params['label'])} ` : ''
    return `${label}${key}`
  })

  const hooks = {
    validateSchema,
    internalError,
    getMessageText,
    parseString: vi.fn((dsl: string) => ({ type: dsl.replace(/[!?].*$/, '') } as JSONSchema)),
    parseObject: vi.fn((dsl: Record<string, unknown>) => ({
      type: 'object',
      properties: Object.fromEntries(Object.keys(dsl).map(key => [key, { type: 'string' }])),
    } as JSONSchema)),
    ...overrides,
  }

  return { validator: new ConditionalValidator(hooks), hooks }
}

describe('ConditionalValidator', () => {
  it.each([
    ['anyOf', [{ type: 'number' }, 'conditional'], 'bad', false],
    ['anyOf', [{ type: 'number' }, 'conditional'], 7, true],
    ['anyOf', [{ type: 'string' }, 'conditional'], 'bad', true],
    ['oneOf', [{ type: 'number' }, 'conditional'], 'bad', false],
    ['oneOf', [{ type: 'string' }, 'conditional'], 'bad', true],
    ['oneOf', [{ type: 'number' }, 'conditional'], 7, false],
    ['oneOf', [{ type: 'string' }, 'conditional'], 7, true],
  ] as const)('应该保留条件%s分支匹配：%j / %j', (keyword, branches, data, valid) => {
    const { validator } = createValidator()
    const conditional: ConditionalInternalSchema = {
      _isConditional: true,
      conditions: [{ then: { type: 'number' } }],
      _evaluateCondition: () => ({ result: true }),
    }
    const schema = { [keyword]: branches.map(branch => branch === 'conditional' ? conditional : branch) }
    const result = validator.validateWithConditionals(schema, data, {})
    expect(result.valid).toBe(valid)
    if (!valid) expect(result.errors?.length).toBeGreaterThan(0)
  })

  it('应该在执行contains条件项前跳过结构不匹配的候选项', () => {
    const { validator } = createValidator()
    const schema: ConditionalInternalSchema = {
      type: 'array', contains: {
        type: 'string', _isConditional: true,
        conditions: [{ then: { type: 'string' } }],
        _evaluateCondition: () => ({ result: true }),
      } as ConditionalInternalSchema,
      allOf: [{ type: 'array' }],
    }
    expect(validator.validateWithConditionals(schema, [123, 'ok'], {}).valid).toBe(true)
  })

  it('detects conditional schemas recursively', () => {
    const { validator } = createValidator()

    expect(validator.hasAnyConditional({ properties: {} })).toBe(false)
    expect(validator.hasAnyConditional({
      properties: {
        profile: {
          type: 'object',
          properties: {
            code: { _isConditional: true },
          },
        },
      },
    } as ConditionalInternalSchema)).toBe(true)
    expect(validator.hasAnyConditional({
      type: 'array',
      items: { _isConditional: true },
    } as ConditionalInternalSchema)).toBe(true)
    expect(validator.hasAnyConditional({
      allOf: [{ properties: { code: { _isConditional: true } } }],
    } as ConditionalInternalSchema)).toBe(true)
  })

  it('aggregates base, field and nested conditional errors with normalized paths', () => {
    const baseError = issue('name', 'name invalid', 'type')
    const { validator, hooks } = createValidator({
      validateSchema: vi.fn((schema: JSONSchema, data: unknown): ValidationResult<unknown> => {
        if ((schema as any).properties?.name) {
          return { valid: false, data, errors: [baseError], errorMessage: baseError.message }
        }
        if (schema.type === 'number' && typeof data !== 'number') {
          return { valid: false, data, errors: [issue('value', 'must be number', 'type')], errorMessage: 'must be number' }
        }
        return { valid: true, data, errors: [] }
      }),
    })
    const schema: ConditionalInternalSchema = {
      type: 'object',
      required: ['name', 'score'],
      properties: {
        name: { type: 'string' },
        score: {
          _isConditional: true,
          conditions: [{ then: { type: 'number' } }],
          _evaluateCondition: () => ({ result: true }),
        },
        profile: {
          type: 'object',
          properties: {
            code: {
              _isConditional: true,
              conditions: [{ then: { type: 'number' } }],
              _evaluateCondition: () => ({ result: true }),
            },
          },
        },
      },
    }

    const result = validator.validateWithConditionals(schema, {
      name: 123,
      score: 'bad',
      profile: { code: 'bad' },
    }, {})

    expect(result.valid).toBe(false)
    expect(result.errors?.map(error => error.path)).toEqual(['name', 'score', 'profile/code'])
    expect(hooks.validateSchema).toHaveBeenCalled()
  })

  it('preserves __proto__ properties while stripping conditional nodes', () => {
    const conditionalNumber: ConditionalInternalSchema = {
      _isConditional: true,
      conditions: [{ then: { type: 'number' } }],
      _evaluateCondition: () => ({ result: true }),
    }
    const properties = Object.create(null)
    properties['__proto__'] = { type: 'string' }
    properties['score'] = conditionalNumber

    const { validator, hooks } = createValidator({
      validateSchema: vi.fn((schema: JSONSchema, data: unknown): ValidationResult<unknown> => {
        const props = (schema as any).properties
        if (props && Object.prototype.hasOwnProperty.call(props, '__proto__')) {
          expect(Object.getPrototypeOf(props)).toBeNull()
          if (typeof (data as Record<string, unknown>)['__proto__'] !== 'string') {
            return { valid: false, data, errors: [issue('__proto__', 'must be string', 'type')], errorMessage: 'must be string' }
          }
        }
        return { valid: true, data, errors: [] }
      }),
    })

    const result = validator.validateWithConditionals({
      type: 'object',
      required: ['__proto__'],
      properties,
    } as ConditionalInternalSchema, JSON.parse('{"__proto__":123,"score":1}'), {})

    expect(result.valid).toBe(false)
    expect(result.errors?.[0]).toMatchObject({ path: '__proto__', keyword: 'type' })
    expect(hooks.validateSchema).toHaveBeenCalled()
  })

  it('validates missing nested conditional objects through a partial schema', () => {
    const nestedMissing = issue('/profile', 'profile required', 'required')
    const { validator } = createValidator({
      validateSchema: vi.fn((schema: JSONSchema, data: unknown): ValidationResult<unknown> => {
        if ((schema as any).properties?.profile) {
          return { valid: false, data, errors: [nestedMissing], errorMessage: nestedMissing.message }
        }
        return { valid: true, data, errors: [] }
      }),
    })
    const schema: ConditionalInternalSchema = {
      type: 'object',
      required: ['profile'],
      properties: {
        profile: {
          type: 'object',
          properties: {
            code: { _isConditional: true },
          },
        },
      },
    }

    const result = validator.validateWithConditionals(schema, {}, {})

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([nestedMissing])
  })

  it('runs conditional schemas in array items and composite branches', () => {
    const { validator } = createValidator()
    const conditionalNumber: ConditionalInternalSchema = {
      _isConditional: true,
      conditions: [{ then: { type: 'number' } }],
      _evaluateCondition: () => ({ result: true }),
    }

    const arrayResult = validator.validateWithConditionals({
      type: 'array',
      items: conditionalNumber,
    } as ConditionalInternalSchema, ['bad'], {})

    const compositeResult = validator.validateWithConditionals({
      type: 'object',
      allOf: [{
        properties: {
          score: conditionalNumber,
        },
      }],
    } as ConditionalInternalSchema, { score: 'bad' }, {})

    expect(arrayResult.valid).toBe(false)
    expect(arrayResult.errors?.[0]?.path).toBe('0')
    expect(compositeResult.valid).toBe(false)
    expect(compositeResult.errors?.[0]?.path).toBe('score')
  })

  it('covers ref, dependency and invalid-pattern traversal edge branches', () => {
    const { validator } = createValidator()
    const conditionalNumber: ConditionalInternalSchema = {
      _isConditional: true,
      conditions: [{ then: { type: 'number' } }],
      _evaluateCondition: () => ({ result: true }),
    }

    expect(validator.validateWithConditionals({
      $ref: '#/definitions/Value',
      definitions: { Value: conditionalNumber },
    } as ConditionalInternalSchema, 'bad', {}).valid).toBe(false)

    expect(validator.validateWithConditionals({
      $ref: 'https://example.test/Value',
      allOf: [conditionalNumber],
    } as ConditionalInternalSchema, 'bad', {}).valid).toBe(false)

    expect(validator.validateWithConditionals({
      $ref: '#',
      allOf: [conditionalNumber],
    } as ConditionalInternalSchema, 'bad', {}).valid).toBe(false)

    expect(validator.validateWithConditionals({
      $ref: '#/missing/Value',
      allOf: [conditionalNumber],
    } as ConditionalInternalSchema, 'bad', {}).valid).toBe(false)

    expect(validator.validateWithConditionals({
      $ref: '#/%E0%A4%A/missing',
      allOf: [conditionalNumber],
    } as ConditionalInternalSchema, 'bad', {}).valid).toBe(false)

    const dependenciesResult = validator.validateWithConditionals({
      type: 'object',
      dependencies: {
        absent: conditionalNumber,
        enabled: ['value'],
        loose: { type: 'number' },
        gate: conditionalNumber,
      },
    } as ConditionalInternalSchema, { enabled: true, loose: true, gate: true }, {})

    expect(dependenciesResult.valid).toBe(false)
    expect(validator.validateWithConditionals({
      type: 'object',
      dependencies: { gate: conditionalNumber },
    } as ConditionalInternalSchema, 'bad', {}).valid).toBe(true)

    const invalidPatternResult = validator.validateWithConditionals({
      type: 'object',
      patternProperties: {
        '[': conditionalNumber,
      },
      additionalProperties: conditionalNumber,
    } as ConditionalInternalSchema, { extra: 'bad' }, {})

    expect(invalidPatternResult.valid).toBe(false)
    expect(invalidPatternResult.errors?.[0]?.path).toBe('extra')
  })

  it('creates not-keyword errors when a conditional not branch matches', () => {
    const { validator } = createValidator()
    const conditionalString: ConditionalInternalSchema = {
      _isConditional: true,
      conditions: [{ then: { type: 'string' } }],
      _evaluateCondition: () => ({ result: true }),
    }

    const result = validator.validateWithConditionals({
      not: conditionalString,
    } as ConditionalInternalSchema, 'ok', {})

    expect(result.valid).toBe(false)
    expect(result.errors?.[0]).toMatchObject({ keyword: 'not', path: 'value' })
  })

  it('runs conditional branches selected by a plain if schema', () => {
    const { validator } = createValidator()
    const conditionalNumber: ConditionalInternalSchema = {
      _isConditional: true,
      conditions: [{ then: { type: 'number' } }],
      _evaluateCondition: () => ({ result: true }),
    }

    const result = validator.validateWithConditionals({
      if: { type: 'string' },
      then: conditionalNumber,
    } as ConditionalInternalSchema, 'bad', {})

    expect(result.valid).toBe(false)
    expect(result.errors?.[0]).toMatchObject({ keyword: 'type', path: 'value' })
  })

  it('reports serialized runtime-only conditional schemas explicitly', () => {
    const { validator } = createValidator()

    const result = validator.validateConditional({
      _runtimeOnlyConditional: true,
      conditions: [],
    }, {}, null, 'value', {})

    expect(result.valid).toBe(false)
    expect(result.errors?.[0].message).toContain('runtime-only')
  })

  it('handles throw, requirement-failed, null else and internal error branches', () => {
    const { validator, hooks } = createValidator()

    expect(validator.validateConditional({
      conditions: [{ action: 'throw', message: 'blocked', type: 'flag' }],
      _evaluateCondition: () => ({ result: true, failedMessage: 'blocked-now' }),
    }, {}, null, 'value', {}).errorMessage).toBe('blocked-now')

    expect(validator.validateConditional({
      conditions: [{ message: 'required when enabled' }],
      _evaluateCondition: () => ({ result: false, requirementFailed: true }),
    }, {}, null, 'value', {}).errorMessage).toBe('required when enabled')

    expect(validator.validateConditional({
      conditions: [{ then: { type: 'number' } }],
      _evaluateCondition: () => ({ result: false }),
      else: null,
    }, {}, null, 'value', {}).valid).toBe(true)

    const internal = validator.validateConditional({
      conditions: [{ then: { type: 'number' } }],
      _evaluateCondition: () => {
        throw new Error('condition error')
      },
    }, {}, null, 'value', {})
    expect(internal.valid).toBe(false)
    expect(hooks.internalError).toHaveBeenCalled()
  })

  it('executes string, builder, nested conditional and object-definition then branches', () => {
    const { validator, hooks } = createValidator()
    const builder = { toSchema: () => ({ type: 'number' }) }
    const nested: ConditionalInternalSchema = {
      _isConditional: true,
      conditions: [{ then: { type: 'string' } }],
      _evaluateCondition: () => ({ result: true }),
    }

    expect(validator.validateConditional({
      conditions: [{ then: 'number!' }],
      _evaluateCondition: () => ({ result: true }),
    }, {}, null, 1, {}).valid).toBe(true)
    expect(hooks.parseString).toHaveBeenCalledWith('number!', undefined)

    expect(validator.validateConditional({
      conditions: [{ then: builder }],
      _evaluateCondition: () => ({ result: true }),
    }, {}, null, 1, {}).valid).toBe(true)

    expect(validator.validateConditional({
      conditions: [{ then: nested }],
      _evaluateCondition: () => ({ result: true }),
    }, {}, null, 'ok', {}).valid).toBe(true)

    expect(validator.validateConditional({
      conditions: [{ then: { name: 'string' } }],
      _evaluateCondition: () => ({ result: true }),
    }, {}, null, { name: 'Ada' }, {}).valid).toBe(true)
    expect(hooks.parseObject).toHaveBeenCalledWith({ name: 'string' }, undefined)
  })

  it('does not parse JSON Schema metadata then branches as DSL objects', () => {
    const { validator, hooks } = createValidator()

    const result = validator.validateConditional({
      conditions: [{ then: { type: 'object', title: 'Plain object schema' } }],
      _evaluateCondition: () => ({ result: true }),
    }, {}, null, {}, {})

    expect(result.valid).toBe(true)
    expect(hooks.parseObject).not.toHaveBeenCalled()
  })

  it('allows optional empty values and formats required missing messages', () => {
    const { validator } = createValidator()
    const optional = validator.validateConditional({
      conditions: [{ then: { type: 'string' } }],
      _evaluateCondition: () => ({ result: true }),
    }, {}, 'nickname', '', {})
    const required = validator.validateConditional({
      conditions: [{
        then: {
          type: 'string',
          _required: true,
          _label: 'Email',
          _customMessages: { required: 'custom required' },
        },
      }],
      _evaluateCondition: () => ({ result: true }),
    }, {}, 'email', undefined, { messages: { required: 'default required' } } as ValidateOptions)

    expect(optional.valid).toBe(true)
    expect(required.valid).toBe(false)
    expect(required.errorMessage).toBe('Email custom required')
  })

  it('uses attached runtime state before serializable condition fields', () => {
    const { validator } = createValidator()
    const schema = {
      conditions: [{ then: { type: 'number' } }],
      _evaluateCondition: () => ({ result: false }),
      [CONDITIONAL_RUNTIME_STATE]: {
        conditions: [{ then: { type: 'string' } }],
        elseSchema: { type: 'number' },
        evaluateCondition: () => ({ result: true }),
      },
    } as ConditionalInternalSchema

    expect(validator.validateConditional(schema, {}, null, 'ok', {}).valid).toBe(true)
  })
})
