/** 验证同一发布包在指定 Node 版本下的运行与类型消费契约。 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const tarball = process.argv[2]
if (!tarball || !tarball.endsWith('.tgz')) {
  throw new Error('Usage: node scripts/verify-runtime-consumer.mjs <package.tgz> [--types]')
}
const tempRoot = mkdtempSync(join(process.env.SCHEMA_DSL_TEST_TMPDIR || tmpdir(), 'schema-dsl-runtime-'))
const nodeDirectory = dirname(process.execPath)
const npmCli = [
  process.env.npm_execpath,
  join(nodeDirectory, 'node_modules/npm/bin/npm-cli.js'),
  join(nodeDirectory, '../lib/node_modules/npm/bin/npm-cli.js'),
].find(candidate => candidate && /\.[cm]?js$/i.test(candidate) && existsSync(candidate))

/** 使用消费者自身的依赖解析与所选 Node 运行验证。 */
function run(command, args) {
  execFileSync(command, args, {
    cwd: tempRoot,
    stdio: 'inherit',
    env: process.env,
  })
}

/** 直接调用 npm，确保 Windows 上含空格的包路径也按字面传递。 */
function runNpm(args) {
  if (!npmCli) throw new Error('Cannot locate npm-cli.js; invoke this check with npm run test:runtime')
  run(process.execPath, [npmCli, ...args])
}

try {
  writeFileSync(join(tempRoot, 'package.json'), JSON.stringify({ name: 'schema-dsl-runtime-consumer', private: true, type: 'module' }))
  // 旧 Node 任务只安装发布包的运行依赖。
  runNpm(['install', resolve(tarball), '--omit=dev', '--omit=optional', '--ignore-scripts', '--engine-strict', '--no-audit', '--no-fund'])
  const manifest = JSON.parse(readFileSync(join(tempRoot, 'node_modules/schema-dsl/package.json'), 'utf8'))
  const specifiers = Object.keys(manifest.exports).map(key => key === '.' ? 'schema-dsl' : `schema-dsl${key.slice(1)}`)
  const checks = `
const { strict: assert } = require('node:assert')
const cases = [
  [{ type: 'string', enum: [1] }, 1, false],
  [{ type: 'string', enum: ['x', 1] }, 'x', true],
  [{ anyOf: [{ type: 'string' }], oneOf: [{ type: 'number' }] }, 'x', false],
  [{ anyOf: [{ type: 'string' }], oneOf: [{ type: 'string', minLength: 2 }] }, 'xx', true],
  [{ type: 'string', pattern: '^..$' }, '😀', false],
  [{ type: 'string', pattern: '^..$' }, '😀😀', true],
]
const shapes = [
  (schema, data) => [schema, data],
  (schema, data) => [{ type: 'object', properties: { value: schema }, required: ['value'] }, { value: data }],
  (schema, data) => [{ type: 'array', items: schema }, [data]],
]
for (const entry of [await load('schema-dsl'), await load('schema-dsl/pure')]) {
  assert.equal(typeof ''.label, 'undefined', 'ordinary entries must not install String methods')
  const validator = new entry.Validator({ smartCoerce: false })
  try {
    for (const [schema, data, expected] of cases) for (const wrap of shapes) {
      const [inputSchema, input] = wrap(schema, data)
      const compiled = validator.compile(inputSchema)
      for (let repeat = 0; repeat < 2; repeat++) {
        assert.equal(compiled(input), expected)
        assert.equal(validator.validate(inputSchema, input).valid, expected)
        if (expected) assert.deepEqual(await validator.validateAsync(inputSchema, input), input)
        else await assert.rejects(() => validator.validateAsync(inputSchema, input), { name: 'ValidationError' })
      }
    }
    const units = new entry.Validator({ smartCoerce: false, unicodeRegExp: false })
    assert.equal(units.validate({ type: 'string', pattern: '^..$' }, '😀').valid, true)
    units.clearCache()
    const refs = { $id: 'https://example.test/schemas/user', type: 'object', definitions: { name: { type: 'string', minLength: 2 } }, properties: { name: { $ref: '#/definitions/name' } }, required: ['name'] }
    assert.equal(validator.validate(refs, { name: 'ok' }).valid, true)
    assert.equal(validator.validate(refs, { name: 'x' }).valid, false)
  } finally { validator.clearCache() }
}
const runtime = (await load('schema-dsl/runtime')).createRuntime()
try {
  for (const [schema, data, expected] of cases) {
    assert.equal(runtime.validate(schema, data, { coerce: false }).valid, expected)
    if (expected) assert.deepEqual(await runtime.validateAsync(schema, data, { coerce: false }), data)
    else await assert.rejects(() => runtime.validateAsync(schema, data, { coerce: false }), { name: 'ValidationError' })
  }
} finally { runtime.dispose() }
const transform = await load('schema-dsl/transform')
assert.throws(() => transform.transformSchemaDsl('const field = "email!".label("Email")'), { code: 'SCHEMA_DSL_BABEL_PEER_MISSING' })
for (const specifier of ${JSON.stringify(specifiers)}) await load(specifier)
console.log('[schema-dsl] runtime consumer ' + process.version + ' OK (' + mode + ')')
`
  writeFileSync(join(tempRoot, 'consumer.mjs'), `import { createRequire } from 'node:module'\nconst require = createRequire(import.meta.url)\nconst load = specifier => import(specifier)\nconst mode = 'ESM'\n${checks}`)
  writeFileSync(join(tempRoot, 'consumer.cjs'), `(async () => {\nconst load = specifier => Promise.resolve(require(specifier))\nconst mode = 'CJS'\n${checks}\n})().catch(error => { console.error(error); process.exitCode = 1 })`)
  run(process.execPath, ['consumer.mjs'])
  run(process.execPath, ['consumer.cjs'])

  if (process.argv.includes('--types')) {
    runNpm(['install', '--save-dev', 'typescript@5.9.3', '@types/node@18', '--ignore-scripts', '--engine-strict', '--no-audit', '--no-fund'])
    const fixture = `import { s, validate, Validator } from 'schema-dsl/pure'\nimport { createRuntime } from 'schema-dsl/runtime'\nconst schema = s({ age: 'number!' })\nconst valid: boolean = validate(schema, { age: 21 }).valid\nconst validator = new Validator()\nconst runtime = createRuntime()\nvoid valid; void validator.compile(schema); runtime.dispose()\n`
    writeFileSync(join(tempRoot, 'consumer.mts'), fixture)
    writeFileSync(join(tempRoot, 'consumer.cts'), fixture)
    writeFileSync(join(tempRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'Node16', moduleResolution: 'Node16', strict: true, noEmit: true, skipLibCheck: false, types: ['node'] }, files: ['consumer.mts', 'consumer.cts'] }))
    run(process.execPath, [join(tempRoot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'])
    console.log('[schema-dsl] packed ESM/CJS types with Node 18 declarations OK')
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
