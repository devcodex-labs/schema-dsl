import assert from 'node:assert/strict'
import { test } from 'node:test'
import { artifactIdentity, verifyBytes, verifyRegistry } from './release-artifact.mjs'

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
