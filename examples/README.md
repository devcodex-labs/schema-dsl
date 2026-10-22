# schema-dsl examples

This directory contains TypeScript examples referenced in the documentation. Examples are built against the current TypeScript build output or the published package `schema-dsl`.

Build and run repository examples on Node.js 24 LTS (or Node.js 22.13.0+ within the 22.x line) after `npm ci --engine-strict`. Published-package runtime compatibility with Node.js >=18.0.0 is checked separately by CI's tarball consumers.

- `examples/docs/*.ts`: Documentation example entry points. Most files map to `docs/*.md`; a few standalone scenario examples, such as `object-dsl-builder.ts` and `real-world.ts`, exercise public APIs that are referenced across multiple docs. `custom-extensions-guide.ts` is kept as an advanced compatibility scenario; the current primary custom-extension companion example is `custom-extensions.ts`.

Documentation examples are part of the public contract. When a document changes, its matching example must be updated in the same change unless the report explicitly records why no code sample is needed. Examples should show realistic success, failure, boundary, and output paths for the documented feature; a minimal smoke demo is not enough for long-form guides or API reference pages.

Type-check all examples:

```powershell
npm run examples:typecheck
```

Build and run every documentation example:

```powershell
npm run examples:run
```

Build and run a single example:

```powershell
npm run examples:build
node .tmp/docs/quick-start.js
```

