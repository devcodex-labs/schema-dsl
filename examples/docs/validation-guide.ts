import { s, validate, validateAsync, ValidationError, Validator } from '../../dist/pure.js'

function expect(label: string, condition: boolean): void {
  if (!condition) throw new Error(`validation-guide expectation failed: ${label}`)
}

// ============================================================
// Validation guide — from quick usage to production patterns
// ============================================================

// ============================================================
// 1. Quick one-liner: validate()
// ============================================================

const quickSchema = s({
  username: 'string:3-32!',
  email:    'email!',
  age:      'integer:18-120',
})

const ok = validate(quickSchema, { username: 'alice', email: 'alice@example.com', age: 28 })
console.log('validation-guide.quick.valid        =', ok.valid)   // true
console.log('validation-guide.quick.data.age     =', (ok.data as any)?.age)  // 28
expect('quick validation accepts valid input', ok.valid)

// ============================================================
// 2. allErrors — collect every problem, not just the first
// ============================================================

const failAll = validate(quickSchema, { username: 'x', email: 'bad', age: 12 }, { allErrors: true })
console.log('validation-guide.allErrors.valid    =', failAll.valid)              // false
console.log('validation-guide.allErrors.count    =', failAll.errors?.length)     // 3
expect('allErrors returns multiple errors', (failAll.errors?.length ?? 0) >= 3)

const firstOnlyValidator = new Validator({ allErrors: false })
const failFirstOnly = firstOnlyValidator.validate(quickSchema, { username: 'x', email: 'bad', age: 12 })
console.log('validation-guide.allErrors.firstOnly =', failFirstOnly.errors?.length) // 1
expect('allErrors false returns one error', failFirstOnly.errors?.length === 1)

// ============================================================
// 3. Stateful Validator with coercion + defaults
// ============================================================

const validator = new Validator({
  allErrors:   true,
  coerceTypes: true, // AJV native coercion; Validator also has schema-dsl smart coercion by default
  useDefaults: true,
  cache:       true,
})

const fullSchema = s({
  username: s('string:3-32!').pattern(/^[a-zA-Z0-9_]+$/).label('Username')
    .error({ pattern: 'Username may only contain letters, digits, and underscores' }),
  email:    s('email!').label('Email'),
  age:      s('integer:18-120').label('Age'),
  country:  s('string').default('US'),
})

// Coercion: '28' → 28 — valid with defaults
const r1 = validator.validate(fullSchema, { username: 'alice_01', email: 'alice@example.com', age: '28' })
console.log('validation-guide.coerce.valid       =', r1.valid)                   // true
console.log('validation-guide.coerce.age         =', (r1.data as any)?.age)      // 28  (number)
console.log('validation-guide.coerce.country     =', (r1.data as any)?.country)  // 'US' (default)
expect('validator coerces age to number', typeof (r1.data as any)?.age === 'number')
expect('validator applies default country', (r1.data as any)?.country === 'US')

const noCoerce = validate(fullSchema, { username: 'alice_01', email: 'alice@example.com', age: '28' }, { coerce: false })
console.log('validation-guide.coerce.disabled    =', noCoerce.valid)             // false
expect('coerce false rejects numeric strings', noCoerce.valid === false)

// ============================================================
// 4. Per-field custom errors
// ============================================================

const r2 = validator.validate(fullSchema, { username: 'bad user', email: 'not-email', age: '16' })
console.log('validation-guide.custom.valid       =', r2.valid)                   // false
// Pattern error uses our custom message
const patternErr = r2.errors?.find(e => e.path?.replace(/^\//, '') === 'username')
console.log('validation-guide.custom.patternMsg  =', patternErr?.message?.includes('letters'))  // true
expect('custom pattern message is used', patternErr?.message?.includes('letters') === true)

// ============================================================
// 5. compile() — pre-compile for hot-path
// ============================================================

const validateFn = validator.compile(fullSchema, 'validation-guide-full')
console.log('validation-guide.compile.valid      =',
  validateFn({ username: 'bob_42', email: 'bob@example.com', age: 30 }))         // true
console.log('validation-guide.compile.invalid    =',
  validateFn({ username: 'x',      email: 'bad',             age: 12 }))         // false

// ============================================================
// 6. validateBatch()
// ============================================================

const batchData = [
  { username: 'alice_01', email: 'alice@example.com', age: 28 },
  { username: 'ab',       email: 'bad-email',          age: 16 },
  { username: 'carol_99', email: 'carol@example.com',  age: 22 },
]
const batchResults = validator.validateBatch(fullSchema, batchData)
console.log('validation-guide.batch.total        =', batchResults.length)                         // 3
console.log('validation-guide.batch.validFlags   =', batchResults.map(r => r.valid).join(','))    // 'true,false,true'
console.log('validation-guide.batch.passed       =', batchResults.filter(r => r.valid).length)    // 2
expect('batch validation preserves row count', batchResults.length === 3)
expect('batch validation reports second row invalid', batchResults[1]?.valid === false)

// ============================================================
// 7. Locale-aware errors
// ============================================================

const enErrors = validator.validate(fullSchema, { username: 'x', email: 'bad', age: 12 }, { locale: 'en-US' })
const zhErrors = validator.validate(fullSchema, { username: 'x', email: 'bad', age: 12 }, { locale: 'zh-CN' })

console.log('validation-guide.locale.en          =', typeof enErrors.errors?.[0]?.message)  // 'string'
console.log('validation-guide.locale.zh          =', typeof zhErrors.errors?.[0]?.message)  // 'string'
expect('locale errors produce messages', typeof zhErrors.errors?.[0]?.message === 'string')

// ============================================================
// 8. Practical helper: format errors for API response
// ============================================================

function formatApiErrors(errors: Array<{ path?: string; message?: string }>) {
  return errors.map(e => ({ field: e.path?.replace(/^\//, '') ?? 'root', message: e.message ?? 'Invalid' }))
}

const apiErrors = formatApiErrors(r2.errors ?? [])
console.log('validation-guide.apiErrors.first    =', apiErrors[0]?.field)       // field name
console.log('validation-guide.apiErrors.msg      =', typeof apiErrors[0]?.message)  // 'string'
expect('api error formatter keeps field names', apiErrors.some(e => e.field === 'username'))

// ============================================================
// 9. Async validation — run Promise-returning custom validators
// ============================================================

const signupSchema = s({
  email: s('email!').custom(async value =>
    value !== 'taken@example.com' || 'Email has already been taken'),
  username: 'string:3-32!',
})

try {
  await validateAsync(signupSchema, { email: 'taken@example.com', username: 'alice_01' })
} catch (err) {
  if (err instanceof ValidationError) {
    console.log('validation-guide.async.caught    =', err.getErrorCount())
    console.log('validation-guide.async.email     =', err.hasFieldError('email'))
    expect('async custom validator reports email', err.hasFieldError('email'))
  }
}

const asyncOk = await validateAsync(signupSchema, {
  email: 'new@example.com',
  username: 'new_user',
})
console.log('validation-guide.async.ok          =', (asyncOk as any).email)

// Raw JSON Schema 约束合取，以及 AJV 正则选项的一致性。
const rawValidator = new Validator({ smartCoerce: false })
expect('enum also enforces type', !rawValidator.validate({ type: 'string', enum: [1] }, 1).valid)
expect('both composition keywords must pass', !rawValidator.validate({
  anyOf: [{ type: 'string' }], oneOf: [{ type: 'number' }],
}, 'x').valid)
expect('Unicode pattern counts code points', !rawValidator.validate({ type: 'string', pattern: '^..$' }, '😀').valid)
try {
  await rawValidator.validateAsync({ type: 'string', pattern: '^..$' }, '😀')
  throw new Error('Expected Unicode pattern rejection')
} catch (error) {
  expect('async Unicode pattern rejects', error instanceof ValidationError)
}
rawValidator.clearCache()
const codeUnitValidator = new Validator({ smartCoerce: false, unicodeRegExp: false })
expect('explicit non-Unicode option is honored', codeUnitValidator.validate({ type: 'string', pattern: '^..$' }, '😀').valid)
codeUnitValidator.clearCache()
