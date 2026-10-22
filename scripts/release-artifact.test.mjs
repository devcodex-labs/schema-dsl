import assert from 'node:assert/strict'
import { test } from 'node:test'
import { artifactIdentity, verifyBytes, verifyRegistry, waitForRegistry } from './release-artifact.mjs'

test('publication rejects changed tarball bytes', () => {
  const bytes = Buffer.from('verified artifact')
  const receipt = artifactIdentity(bytes)
  verifyBytes(receipt, bytes)
  assert.throws(() => verifyBytes(receipt, Buffer.from('changed artifact')), /mismatch/)
})

test('registry acceptance rejects version, digest, commit and provenance drift', () => {
  const receipt = { name: 'schema-dsl', version: '3.0.5', gitHead: 'verified-commit', ...artifactIdentity(Buffer.from('artifact')) }
  const metadata = { name: receipt.name, version: receipt.version, gitHead: receipt.gitHead, dist: { integrity: receipt.integrity, shasum: receipt.shasum, attestations: { url: 'https://registry.npmjs.org/attestations' } } }
  verifyRegistry(receipt, metadata)
  for (const key of ['name', 'version', 'gitHead']) assert.throws(() => verifyRegistry(receipt, { ...metadata, [key]: 'changed' }), /mismatch/)
  for (const key of ['integrity', 'shasum']) assert.throws(() => verifyRegistry(receipt, { ...metadata, dist: { ...metadata.dist, [key]: 'changed' } }), /mismatch/)
  assert.throws(() => verifyRegistry(receipt, { ...metadata, dist: { ...metadata.dist, attestations: undefined } }), /provenance missing/)
  verifyRegistry(receipt, { ...metadata, gitHead: undefined })
})

test('finalize accepts delayed registry visibility without publishing again', async () => {
  const receipt = { name: 'schema-dsl', version: '3.0.5', ...artifactIdentity(Buffer.from('artifact')) }
  const metadata = { name: receipt.name, version: receipt.version, dist: { integrity: receipt.integrity, shasum: receipt.shasum, attestations: { url: 'https://registry.npmjs.org/attestations' } } }
  let requests = 0
  let elapsed = 0
  const result = await waitForRegistry(receipt, {
    request: async () => ++requests <= 40 ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => metadata },
    sleep: async milliseconds => { elapsed += milliseconds },
  })
  assert.equal(result, metadata)
  assert.equal(elapsed, 200_000)
})

test('finalize bounds waiting and never retries visible identity drift', async () => {
  const receipt = { name: 'schema-dsl', version: '3.0.5', ...artifactIdentity(Buffer.from('artifact')) }
  await assert.rejects(() => waitForRegistry(receipt, {
    request: async () => ({ ok: false, status: 404 }), sleep: async () => {}, attempts: 3,
  }), /Registry HTTP 404; retry finalize only/)
  let requests = 0
  await assert.rejects(() => waitForRegistry(receipt, {
    request: async () => { requests++; return { ok: true, status: 200, json: async () => ({ name: 'changed' }) } },
    sleep: async () => assert.fail('Visible drift must not be retried'),
  }), /Registry name mismatch/)
  assert.equal(requests, 1)
})
