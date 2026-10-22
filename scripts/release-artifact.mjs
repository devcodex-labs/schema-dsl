/** Preserve one verified tarball across publication and registry acceptance. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, '.tmp/release')
const receiptPath = join(output, 'artifact.json')
const registry = 'https://registry.npmjs.org'
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const save = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)

/** Match npm's published hashes using the exact compressed bytes. */
export function artifactIdentity(bytes) {
  return {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    shasum: createHash('sha1').update(bytes).digest('hex'),
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  }
}

/** A changed tarball must fail before npm receives it. */
export function verifyBytes(receipt, bytes) {
  const actual = artifactIdentity(bytes)
  for (const key of Object.keys(actual)) assert.equal(actual[key], receipt[key], `Artifact ${key} mismatch`)
}

/** Registry visibility may lag; a visible identity mismatch must fail immediately. */
export function verifyRegistry(receipt, metadata) {
  assert.equal(metadata.name, receipt.name, 'Registry name mismatch')
  assert.equal(metadata.version, receipt.version, 'Registry version mismatch')
  assert.equal(metadata.dist.integrity, receipt.integrity, 'Registry integrity mismatch')
  assert.equal(metadata.dist.shasum, receipt.shasum, 'Registry shasum mismatch')
  if (metadata.gitHead) assert.equal(metadata.gitHead, receipt.gitHead, 'Registry gitHead mismatch')
  assert.ok(metadata.dist.attestations?.url, 'Registry provenance missing')
}

function verifiedReceipt() {
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  assert.equal(git('rev-parse', 'HEAD'), receipt.gitHead, 'Source commit changed')
  assert.equal(git('status', '--porcelain', '--untracked-files=no'), '', 'Tracked source changed')
  verifyBytes(receipt, readFileSync(join(output, receipt.filename)))
  return receipt
}

async function main(command) {
  mkdirSync(output, { recursive: true })
  if (command === 'create') {
    assert.ok(!existsSync(receiptPath), 'Artifact already exists; reuse it instead of repacking')
    assert.equal(git('status', '--porcelain', '--untracked-files=no'), '', 'Tracked source changed')
    const nodeDirectory = dirname(process.execPath)
    const npmCli = [process.env.npm_execpath, join(nodeDirectory, 'node_modules/npm/bin/npm-cli.js'), join(nodeDirectory, '../lib/node_modules/npm/bin/npm-cli.js')]
      .find(path => path && /\.[cm]?js$/i.test(path) && existsSync(path))
    assert.ok(npmCli, 'Cannot locate npm-cli.js')
    const [pack] = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', output], { cwd: root, encoding: 'utf8' }))
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    assert.equal(pack.name, manifest.name)
    assert.equal(pack.version, manifest.version)
    const receipt = {
      schemaVersion: 'ExactReleaseArtifactReceiptV1', createdAt: new Date().toISOString(),
      name: pack.name, version: pack.version, filename: pack.filename, entryCount: pack.entryCount,
      gitHead: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD^{tree}'),
      qualification: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : 'local-verification',
      ...artifactIdentity(readFileSync(join(output, pack.filename))),
    }
    assert.equal(receipt.integrity, pack.integrity)
    save(receiptPath, receipt)
    console.log(JSON.stringify(receipt))
  } else if (command === 'verify') {
    console.log(JSON.stringify(verifiedReceipt()))
  } else if (command === 'published') {
    const receipt = verifiedReceipt()
    save(join(output, 'published.json'), { schemaVersion: 'PublishedArtifactReceiptV1', publishedAt: new Date().toISOString(), publishExitCode: 0, registry, artifact: receipt })
  } else if (command === 'finalize') {
    const published = JSON.parse(readFileSync(join(output, 'published.json'), 'utf8'))
    const receipt = published.artifact
    verifyBytes(receipt, readFileSync(join(output, receipt.filename)))
    for (let attempt = 0; attempt < 8; attempt++) {
      const response = await fetch(`${registry}/${encodeURIComponent(receipt.name)}/${receipt.version}`, { headers: { 'cache-control': 'no-cache' } })
      if (response.status === 404 && attempt < 7) {
        await new Promise(resolve => setTimeout(resolve, 5000))
        continue
      }
      assert.ok(response.ok, `Registry HTTP ${response.status}; retry finalize only`)
      const metadata = await response.json()
      verifyRegistry(receipt, metadata)
      save(join(output, 'registry.json'), metadata)
      if (!metadata.gitHead) console.warn('Registry gitHead absent; provenance must identify the source commit')
      console.log(`Registry identity accepted: ${receipt.name}@${receipt.version}`)
      return
    }
  } else throw new Error('Usage: node scripts/release-artifact.mjs create|verify|published|finalize')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv[2])
