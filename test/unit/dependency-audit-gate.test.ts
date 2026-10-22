import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
const fixtures: string[] = []

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true })
})

/** Exercise the real npm gate wiring without registry access or running unrelated build commands. */
function runGate(script: string, auditExit: number) {
  const npmCli = process.env.npm_execpath
  if (!npmCli || !/\.[cm]?js$/i.test(npmCli)) throw new Error('Run audit gate tests through npm test')
  const fixture = mkdtempSync(join(process.env.SCHEMA_DSL_TEST_TMPDIR || tmpdir(), 'schema-dsl-audit-gate-'))
  fixtures.push(fixture)
  const scripts = Object.fromEntries(Object.keys(manifest.scripts).map(name => [name, 'node -e "process.exit(0)"']))
  for (const name of ['test:audit:website', 'test:all:with-audit', 'prepublishOnly']) scripts[name] = manifest.scripts[name]
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: 'audit-gate-fixture', version: '1.0.0', private: true, scripts }))
  mkdirSync(join(fixture, 'website'))
  writeFileSync(join(fixture, 'website/package.json'), JSON.stringify({
    name: 'website-audit-fixture', private: true,
    scripts: { 'test:audit': 'node -e "console.log(\'website-audit-fixture\');process.exit(Number(process.env.AUDIT_FIXTURE_STATUS))"' },
  }))
  return spawnSync(process.execPath, [npmCli, 'run', script], {
    cwd: fixture,
    env: { ...process.env, AUDIT_FIXTURE_STATUS: String(auditExit), npm_config_update_notifier: 'false' },
    encoding: 'utf8', timeout: 45_000,
  })
}

describe('website dependency audit gates', () => {
  it('allows a successful website audit through the root entry', () => {
    const result = runGate('test:audit:website', 0)
    expect(result.error).toBeUndefined()
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(result.stdout).toContain('website-audit-fixture')
  }, 60_000)

  it.each(['test:audit:website', 'test:all:with-audit', 'prepublishOnly'])('%s propagates website audit failure', (script) => {
    const result = runGate(script, 42)
    expect(result.error).toBeUndefined()
    expect(result.status, result.stdout + result.stderr).toBe(42)
    expect(result.stdout).toContain('website-audit-fixture')
  }, 60_000)
})
