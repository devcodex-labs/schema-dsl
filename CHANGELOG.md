# Changelog

All notable changes to this project will be documented in this file.

> 📂 **Detailed changes**: see [`changelogs/`](./changelogs/) for full notes on major versions.

---

## [Unreleased]

### Fixed

- Preserve `type` together with `enum` in the validation fast path.
- Fall back to AJV for simultaneous composition keywords and mark unsupported conjunctions explicitly in the internal IR.
- Match AJV's Unicode pattern semantics, honor `unicodeRegExp: false`, and defer custom `code.regExp` engines to AJV.

---

## [3.0.0] - 2026-07-15

### Changed

- Made the root ESM and CommonJS entries side-effect-free: importing `schema-dsl` no longer mutates `String.prototype`.
- Kept direct String-chain authoring behind the explicit `schema-dsl/compat`, `schema-dsl/register-string`, and `installStringExtensions()` opt-in paths.
- Stopped emitting obsolete transform warnings for the now-safe root entry while retaining the legacy warning code and strict option as compatibility no-ops.
- Documented `required[]` as the object-level requiredness contract; no `isRequired()` / `isOptional()` getters were added.

### Migration

- Existing direct `'email!'.description(...)` code must explicitly import `schema-dsl/compat` or `schema-dsl/register-string` and, for TypeScript, opt into `schema-dsl/string-types`.
- See the bilingual v3 migration guides under `docs/en/migration-v3.md` and `docs/zh/migration-v3.md`.
- Full release verification is recorded in [`changelogs/v3.0.0.md`](./changelogs/v3.0.0.md).

---

## [2.1.6] - 2026-07-13

### Added

- Exported `BabelPeerDependencyError` from `schema-dsl/transform` so optional Babel peer failures can be handled by type as well as by the stable `SCHEMA_DSL_BABEL_PEER_MISSING` code.

### Changed

- Prepared the `2.1.6` patch behind local, exact-SHA, tag, and registry release-verification gates.
- Bound the bilingual performance guide to one tracked 20-row snapshot: 19 comparable scenarios plus one async throw-path diagnostic scenario.
- Calibrated same-environment absolute performance failures against the pinned same-run Zod workload while retaining relative regression protection.
- Required every supported benchmark command to rebuild current sources before measuring and preserved child-process diagnostics on benchmark failures.
- Required npm publish tag commits to be contained in `origin/main`.
- Made every benchmark entry build current sources before measurement and aligned the active Profile with the executable scripts.
- Strengthened the tag-triggered publish workflow with coverage, documentation examples, website build, and performance regression gates.

### Fixed

- Invalidated root, direct `Validator`, cloned, and isolated-runtime caches when public generated schemas are mutated after warm-up.
- Evicted stale AJV identity compilations when caller-owned schemas change structure, and guarded injected child aliases that mutate outside generated Schema proxies.
- Preserved composition-only and dependency-only fields in `SchemaUtils.omit()` projections.
- Made `minContains` / `maxContains` executable through sync, async, and compiled validation paths without changing the Draft 7 base engine.
- Applied `minContains` / `maxContains` when compensating AJV-skipped property schemas, including valid zero-match ranges across sync, async, and quick validation.
- Preserved the active `Validator` instance formats and options while matching AJV-skipped property schemas inside `anyOf`, `oneOf`, `if`, `not`, and `contains`.
- Evicted projected `contains` schemas and async preflight clones by their original public schema owner, preserving mutation invalidation without weakening duplicate-`$id` errors between different schemas.
- Restored explicit deprecated `ValidateOptions.removeAdditional`, `cache`, and `strict` field types for source compatibility.
- Preserved `SchemaUtils.withPerformance()` assignability to the wrapped validator type while exposing performance metadata on validation results.
- Unified Schema-position traversal for `additionalItems` and related applicators across Conditional execution, async custom validators, SchemaUtils projections, exporter loss analysis, and skipped-property compensation.
- Preserved prefix-item versus repeated-item binding for async custom validators and resolved multi-item/local-`$ref` skipped-property validation gaps.
- Limited plugin uninstall hooks to the `PluginManager` instance that installed the plugin while keeping observer unregistration resource-neutral.
- Counted official `custom-format` AJV formats and shared `DslBuilder` types by their actual resource identities so one Validator cannot release another live instance's DSL types.
- Made `PluginManager.clear()` expose failed cleanup through `plugins:clear-error` and `AggregateError`, retain failed plug-ins for retry, and continue cleaning independent plug-ins.
- Recognized Conditional schemas nested under schema-valued keywords in the shared raw JSON Schema classifier, keeping root sync, root async, direct Validator, and isolated runtime behavior aligned.
- Synchronized the documented `SchemaUtils.clone()` / recursive `partial()` behavior and the Draft 7 plus `minContains` / `maxContains` dialect boundary with executable examples.
- Corrected the performance matrix diagnostic classification and refreshed the tracked local matrix to schema-dsl `14/19`, Zod `5/19`.

### Validation

- Full release verification is recorded in [`changelogs/v2.1.6.md`](./changelogs/v2.1.6.md).

---

## [2.1.5] - 2026-07-09

### Changed

- Refreshed README, documentation home pages, package metadata, and website metadata around the progressive TypeScript schema DSL positioning.
- Updated the maintained local performance baseline from `npm run bench:full`: S1 simple valid `~2.132M ops/s`, S2 invalid without i18n formatting `~193K ops/s`, and S3 nested valid `~1.129M ops/s`.
- Recorded the latest extended Zod scenario matrix as schema-dsl `14/19` wins and Zod `5/19` wins. This remains a regression signal, not a public "faster than Zod" claim.

### Fixed

- Fixed root fast-cache invalidation when caller-owned raw JSON Schema dynamic containers are captured before validation and later used to replace existing child schemas.
- Added public `validate()` regression coverage for saved `properties` and `$defs` references so stale fast plans do not survive child-schema replacement.

### Validation

- `npx vitest run test/unit/core/ValidationPlan.test.ts -t "saved raw JSON Schema"`
- `npm run build`
- dist CJS root fast-cache alias mutation smoke
- `npm run bench:full`
- `npm run bench:cache`

---

## [2.1.4] - 2026-07-09

### Added

- Added internal-only `SchemaIR` / `RuleIR` / `SchemaGraph` helpers and projections for JSON Schema, runtime metadata, Conditional metadata, and exporter loss analysis.
- Added focused regression coverage for IR parity, conditional projection, exporter projection, and root raw schema cache invalidation.

### Changed

- Routed internal Validator/exporter follow-up work through IR projection helpers without adding public package exports.
- Kept Conditional projection lazy on the hot path and added `bench:conditional` for targeted Conditional regression evidence.
- Reduced repeated structural cache-key work on public `validate(schema, data)` for reused raw JSON Schema objects.
- Added lighter root schema shape guards, schema-map mutation watchers, and primitive union bitmask validation for successful hot-path checks.
- Refreshed the maintained performance baseline from `npm run bench:full`: S1 simple valid `~1.813M ops/s`, S2 invalid without i18n formatting `~223K ops/s`, and S3 nested valid `~1.291M ops/s`.
- Recorded the latest extended Zod scenario matrix as schema-dsl `12/19` wins and Zod `7/19` wins. This remains a regression signal, not a public "faster than Zod" claim.

### Fixed

- Ensured caller-owned raw JSON Schema mutation scenarios invalidate root fast-cache entries when nested constraints are added, property schemas are replaced, required arrays change, or primitive union branches are replaced.

### Validation

- `npm run typecheck`
- `npm run lint`
- `npm run test:types`
- `npm test`
- `npm run test:coverage`
- `npm run build`
- `npm run test:interop`
- `npm run test:version`
- `npm run docs:linkcheck`
- `npm run examples:typecheck`
- `npm run examples:build`
- `npm run examples:run`
- `npm run bench:full`
- `npm run bench:cache`
- `npm run bench:conditional`
- `npm run build` in `website/`
- `npm pack --dry-run`
- `npm run prepublishOnly`

---

## [2.1.3] - 2026-07-08

### Changed

- Added a bilingual security checklist note that executable `.js` / `.cjs` locale files must be treated as trusted application code.
- Documented `codeLocaleFiles: 'deny'` for data-only or untrusted locale directories.
- Made performance smoke tests use a small best-of sample window to reduce transient host-load noise.
- Added a no-dependency `npm run docs:linkcheck` command for README / docs Markdown relative links and Rspress sidebar/nav local targets.
- Included `docs:linkcheck` in `npm run test:all:with-audit` and documented it in the README development script list.

### Validation

- `npm run docs:linkcheck`
- `npx vitest run test/unit/performance.test.ts`
- `npm run examples:run`
- `npm run test:all:with-audit`
- `npm run build` in `website/`
- dist ESM/CJS import smoke
- `npm pack --dry-run --json`

---

## [2.1.2] - 2026-07-07

### Fixed

- Fixed root smart schema classification for annotation-only JSON Schema inputs such as `{ default: 'fallback' }`, while preserving DSL object semantics for field names like `{ default: 'string!' }`.
- Fixed root fast-path cache invalidation for caller-owned raw schema mutations so mutable schema reuse does not retain stale validation plans or compiled validators.
- Fixed legacy JSON Schema `validate` keyword handling so async and Promise-returning validators no longer pass silently in sync validation, and `validateAsync()` executes them through the async custom validation traversal.
- Updated GitHub security policy metadata for the 2.1.x line and fixed the issue template FAQ link.
- Added CI coverage for FastPlan fallback reasons, smart coercion metadata, public entry fast paths, official plugin examples, and AJV skipped-property applicators.

### Changed

- Updated the maintained release-candidate performance baseline from the Node.js v20.20.2 / Windows x64 full benchmark: S1 simple valid `~1.822M ops/s`, S2 invalid without i18n formatting `~243K ops/s`, and S3 nested valid `~1.067M ops/s`.
- Re-ran the extended Zod scenario matrix and recorded the current actual result as schema-dsl `14/19` wins and Zod `5/19` wins. This remains an internal regression signal rather than a public "faster than Zod" claim.
- Synchronized the performance guide, FAQ, and design philosophy pages with the current benchmark output.

### Validation

- `npx vitest run test/unit/verified-issues-regression.test.ts -t "P0-33"`
- `npx vitest run test/unit/validators/CustomKeywords.test.ts`
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm run test:types`
- `npm test`
- `npm run test:coverage`
- `npm run test:interop`
- `npm run test:version`
- `npm run test:audit`
- `npm run examples:typecheck`
- `npm run examples:build`
- `npm run examples:run`
- `npm run bench:full`
- `npm run bench:cache`
- `npm run build` in `website/`
- `npm pack --dry-run`

---

## [2.1.1] - 2026-06-30

### Fixed

- Hardened schema object construction and validation for reserved property names such as `__proto__`, bounded the static `Validator.quickValidate()` AJV schema cache, and added a compatibility-safe `codeLocaleFiles: 'deny'` option for JSON-only i18n directory loading.
- Bounded `patternProperties` matcher reuse in both normal and conditional validation paths, including `clearCache()` cleanup, to reduce repeated `RegExp` allocation without introducing an unbounded long-lived map.
- Prewarmed `Validator.validateBatch()` through the managed compile cache while keeping each item on the same validation path as `validate()`.
- Expanded exporter loss reporting to follow local `$ref` targets and avoid recursive traversal loops when schema objects contain circular references.

---

## [2.1.0] - 2026-06-26

### Added

- Added side-effect controlled package entries: `schema-dsl/pure`, `schema-dsl/compat`, `schema-dsl/register-string`, `schema-dsl/string-types`, `schema-dsl/runtime`, `schema-dsl/transform`, and `schema-dsl/esbuild`.
- Added runtime isolation with `createRuntime()`, instance-level locale/messages/type registry/cache state, and lifecycle helpers.
- Added the shared `s` / `dsl` namespace API, including chainable factories and the `.require()` alias.
- Added compile-time String DSL transform coverage and optional esbuild adapter support.
- Added declarative custom extension registration with `registerExtensions([... ] as const)` and `runtime.registerExtensions([...])`, so one definition can power pure DSL strings, `s('...')` builder seeds, and typed `s.xxx()` factories.
- Added extension `params` parsing, parameter defaults, factory object/positional arguments, `segmentMode: 'none' | 'params' | 'constraint'`, and structured extension diagnostics for `compileWithDiagnostics()`.
- Added DSL object support for array item schemas through `s.array({ ... })` and `.items({ ... })`.

### Changed

- Babel AST and esbuild integrations now use optional peer dependencies for the transform/esbuild subpaths instead of forcing ordinary runtime consumers to install them.
- Custom extension docs and runnable examples now use the three-entry model and keep range syntax on the existing dash form, such as `age-range:18-65!`.
- Documentation, examples, and website navigation were synchronized around the current public API surface and side-effect controlled entry model.

### Fixed

- Hardened parser, validator, schema utility, exporter, and type inference behavior across the verified regression suite.
- Unified raw JSON Schema detection across runtime, root helpers, conditional branches, and `SchemaUtils.extend()`, including boolean schemas and string-valued JSON Schema keywords such as `const`, `format`, and `title`.
- Completed Conditional execution coverage for nested applicators, local `$ref` chains, `definitions` / `$defs`, dependencies, `prefixItems`, `contains`, `propertyNames`, and related public `Validator.validate()` paths.
- Aligned `coerce`, `smartCoerce`, `allErrors`, and async custom validator behavior across sync and async validation paths.
- Preserved boolean `false` schemas and dependent constraints in `SchemaUtils.pick()` / `omit()` / `partial()` workflows.
- Improved exporter loss reporting and SQL constraint coverage for MySQL and PostgreSQL.
- Made `SchemaHelper` comparison and schema ID generation handle circular arrays and process-local function identity more accurately.

### Validation

- `npm run test:all:with-audit`
- `npm run test:coverage`
- `npm run examples:run`
- `npm run build` in `website/`
- `npm pack --dry-run`

## Version History

| Version | Date | Type | Key Theme |
|---------|------|------|-----------|
| [2.1.5] | 2026-07-09 | Patch | Root fast-cache alias invalidation fix, package metadata refresh, and updated local performance baseline [View](./changelogs/v2.1.5.md) |
| [2.1.4] | 2026-07-09 | Patch | Internal IR foundation, Conditional hot-path laziness, root raw schema cache optimization, and refreshed performance baseline [View](./changelogs/v2.1.4.md) |
| [2.1.3] | 2026-07-08 | Patch | Docs security checklist hardening, less noisy performance smoke, and docs linkcheck release gate [View](./changelogs/v2.1.3.md) |
| [2.1.2] | 2026-07-07 | Patch | Release-readiness sync, raw JSON Schema `default` classification, legacy validate async handling, FastPlan cache safety, and refreshed performance baselines [View](./changelogs/v2.1.2.md) |
| [2.1.1] | 2026-06-30 | Patch | Validation cache lifecycle tightening, batch compile reuse, and local `$ref` exporter loss reporting [View](./changelogs/v2.1.1.md) |
| [2.1.0] | 2026-06-26 | Minor | Side-effect controlled entries, runtime isolation, shared `s` namespace, declarative extensions, array item DSL support, and deep validation hardening [View](./changelogs/v2.1.0.md) |
| [2.0.11] | 2026-06-15 | Patch | ESM/CJS shared custom type registry for vext dev route validation and OpenAPI generation [View](./changelogs/v2.0.11.md) |
| [2.0.10] | 2026-06-13 | Patch | Legacy DSL aliases, structured unknown-type diagnostics, and downstream adapter delegation support [View](./changelogs/v2.0.10.md) |
| [2.0.9] | 2026-06-11 | Patch | Documentation/example convergence, Markdown label preservation, cache-hub 2.2.4, and release dependency audit cleanup [View](./changelogs/v2.0.9.md) |
| [2.0.8] | 2026-06-10 | Patch | Validator/AJV cache lifecycle bounds, locale cache invalidation, and official plugin uninstall cleanup [View](./changelogs/v2.0.8.md) |
| [2.0.7] | 2026-06-10 | Patch | String extension compatibility restoration, English-default documentation site, and canonical package homepage metadata [View](./changelogs/v2.0.7.md) |
| [2.0.6] | 2026-06-09 | Patch | Direct runtime and development dependencies pinned to exact versions for deterministic consumer installs [View](./changelogs/v2.0.6.md) |
| [2.0.5] | 2026-06-04 | Patch | License metadata and package distribution updated to Apache-2.0 [View](./changelogs/v2.0.5.md) |
| [2.0.4] | 2026-06-03 | Patch | Explicit String extension installation, v1 compatibility guard coverage, and documentation alignment [View](./changelogs/v2.0.4.md) |
| [2.0.3] | 2026-06-01 | Patch | Async custom validation runtime fix, public-doc example alignment, docs site and link cleanup [View](./changelogs/v2.0.3.md) |
| [2.0.2] | 2026-06-01 | Patch | v1 consumer compatibility: root error type exports, `dsl(object, options?)`, builder typing, validate input typing, release metadata hygiene [View](./changelogs/v2.0.2.md) |
| [2.0.1] | 2026-05-22 | Patch | Post-release security & correctness fixes: safe-regex bypass, XSS escaping, reset completeness, cache rebuild, SQL injection in exporters |
| [2.0.0] | 2026-05-09 | Major | Full release: BC-2/4/5/6/7 fixes, string:N compat, English comments, 58 enriched examples, 1095 tests [View](./changelogs/v2.0.0.md) |
| [2.0.0-beta.2] | 2026-04-12 | Major | Full TypeScript rewrite: ESM+CJS dual format, AJV 8, tsup build, 1052 tests passing [View](./changelogs/v2.0.0-beta.2.md) |
| [v1.2.5] | 2026-03-09 | Patch | Feature: `DslBuilder.toJsonSchema()` — exports clean JSON Schema, strips internal markers |
| [v1.2.4] | 2026-03-09 | Patch | P1 Fix: `enum:a,b,c` comma-separated format parsing completely broken |
| [v1.2.3] | 2026-03-03 | Patch | Feature: i18n sub-directory merging; collaborative locale maintenance with auto-merge + conflict detection [View](./changelogs/v1.2.3.md) |
| [v1.2.2] | 2026-02-06 | Minor | Major feature: smart type coercion — auto-converts string numbers, full Web API support [View](./changelogs/v1.2.2.md) |
| [v1.1.8] | 2026-01-30 | Patch | Feature: smart argument detection, simplified syntax `dsl.error.throw('key', 'locale')` [View](./changelogs/v1.1.8.md) |
| [v1.1.7] | 2026-01-27 | Patch | Fix: error message path display — all error types now show field name only |
| [v1.1.6] | 2026-01-23 | Patch | Fix: enum and additionalProperties error message template variables not substituted [View](./changelogs/v1.1.6.md) |
| [v1.1.5] | 2026-01-17 | Patch | Feature: error config object format; locale messages now support `{ code, message }` object format [View](./changelogs/v1.1.5.md) |
| [v1.1.4] | 2026-01-13 | Patch | TS fix: remove duplicate function signatures + multilingual docs improvements [View](./changelogs/v1.1.4.md) |
| [v1.1.3] | 2026-01-09 | Patch | Fix: type error message template variables not substituted [View](./changelogs/v1.1.3.md) |
| [v1.1.2] | 2026-01-06 | Patch | Feature: numeric comparison operators + bug fixes [View](./changelogs/v1.1.2.md) |
| [v1.1.1] | 2026-01-06 | Patch | Feature: ConditionalBuilder independent message support [View](./changelogs/v1.1.1.md) |
| [v1.1.0] | 2026-01-05 | Minor | Major: cross-type union validation + enhanced plugin system [View](./changelogs/v1.1.0.md) |
| [v1.0.9] | 2026-01-04 | Patch | Major improvement: complete i18n support + full TypeScript types [View](./changelogs/v1.0.9.md) |
| v1.0.8 | 2026-01-04 | Patch | Improvement: enhanced error message filtering |
| v1.0.7 | 2026-01-04 | Patch | Fix: dsl.match/dsl.if nesting now supports dsl() wrapper |
| v1.0.6 | 2026-01-04 | Patch | 🚨 Critical fix: TypeScript type pollution |
| v1.0.5 | 2026-01-04 | Patch | Test coverage raised to 97% |
| v1.0.4 | 2025-12-31 | Patch | Full TypeScript support, validateAsync, ValidationError |
| v1.0.3 | 2025-12-31 | Patch | ⚠️ Breaking change: single-value syntax fix |
| v1.0.2 | 2025-12-31 | Patch | 15 new validators, complete docs, 75 tests |
| v1.0.1 | 2025-12-31 | Patch | Enum support, auto type detection, unified error messages |
| [v1.0.0] | 2025-12-29 | Pre-release | Initial release [View](./changelogs/v1.0.0.md) |

---

## [2.0.11] — 2026-06-15

### Fixes

- **Interop:** custom types registered through `DslBuilder.registerType()` or `TypeRegistry.register()` are now shared across the package's ESM and CJS entrypoints in the same Node.js process.
- **Framework compatibility:** fixes `vext dev` route files compiled to CJS registering a custom type while vext's ESM OpenAPI/validation chain resolved the same type as unknown.

### Validation

- `npm run build`
- `npm run test:interop`

---

## [2.0.10] — 2026-06-13

### Changes

- **Compatibility:** added legacy and adapter-facing DSL aliases for `int`, `float`, `double`, `decimal`, `mixed`, `buffer` and `objectid`.
- **Diagnostics:** added structured unknown-type diagnostics and `compileWithDiagnostics()` so downstream libraries can delegate parsing to schema-dsl without duplicating type allowlists.
- **Parser:** propagated parser options through object DSL compilation for nested schema diagnostics.
- **Website/docs:** carried forward the unreleased homepage spacing, alignment and footer navigation refinements.

### Validation

- `npm run typecheck`
- `npm test`
- targeted parser/diagnostics tests
- CJS smoke import

---

## [2.0.9] — 2026-06-11

### Changes

- **Docs/examples:** completed a full document-to-example review, added the runnable `examples:run` gate, and expanded high-risk documentation examples with assertions.
- **Markdown output:** aligned `MarkdownExporter` and `SchemaUtils` with label-vs-description documentation so labels and descriptions are preserved distinctly.
- **Dependencies:** upgraded `cache-hub` to `2.2.4` and moved Vitest tooling to the Node 18-compatible `3.2.6` security patch line.
- **Website/docs:** kept the refreshed documentation site theme, localized navigation, and responsive home page button fixes in the release notes.

### Validation

- `npm run build`
- `npm run typecheck`
- `npm run examples:typecheck`
- `npm run examples:run`
- `npm test`
- `npm run lint`
- `npm run test:version`
- `npm run test:audit`
- `npm run build` in `website/`
- `npm pack --dry-run`
- tarball install smoke for ESM, CJS, and plugin subpath exports
- `npm publish --dry-run --access public`

---

## [2.0.8] — 2026-06-10

### Fixes

- **Validation cache:** repeated DSL definitions and `DslBuilder` materialization now reuse stable internal cache keys, and Validator eviction / `clearCache()` release managed AJV schema refs.
- **Remove additional:** `_removeAdditional` validation paths now use a bounded internal compile cache instead of growing independent AJV refs.
- **Locale cache:** flattened locale message caching is now bounded and invalidated when runtime locale messages change.
- **Plugin cleanup:** official plugin uninstall paths now clean custom formats, types, keywords, global plugin state, and Validator caches.

### Docs & Tests

- Added `DslBuilder.unregisterType(name)` documentation in English and Chinese API / custom type / union type guides.
- Added focused memory lifecycle tests and official plugin uninstall cleanup coverage.

---

## [2.0.7] — 2026-06-10

### Changes

- Restored v1-style direct string DSL chains through the root entry while keeping String extension descriptors non-enumerable, conflict-aware, and uninstallable.
- Published the English-default Rspress documentation site with Chinese docs under `/zh/` and 58-page content/link parity across both languages.
- Updated README and package homepage metadata to `https://vextjs.github.io/schema-dsl`.

---

## [2.0.5] — 2026-06-04

### Changes

- Updated package license metadata, lockfile metadata, README badge, LICENSE text, and release notes to Apache-2.0.

---

## [2.0.4] — 2026-06-03

### Fixes

- **String extensions:** root import no longer installs `String.prototype` extensions globally; consumers opt in through `installStringExtensions()`.
- **Compatibility:** `installStringExtensions()` keeps the v1 no-argument call form and restores the legacy string DSL methods when explicitly invoked.
- **Docs:** quick-start, API reference, string-extension docs, and current document version headers now describe the explicit installation path.

---

## [2.0.3] — 2026-06-01

### Fixes

- **Validation:** `validateAsync()` now executes Promise-returning `.custom()` validators after the base AJV validation pass, while synchronous `validate()` still reports an explicit async-custom error.
- **Validation errors:** async custom validator failures now preserve nested field paths and surface false/string/object/throw outcomes consistently.
- **Examples:** documentation examples now use only the documented root public API and pass `examples:typecheck` / `examples:build`.
- **Docs:** synchronized async custom validator wording, document version headers, Rspress navigation, internal links, release gate documentation and historical changelog links.

---

## [2.0.2] — 2026-06-01

### Fixes

- **Compatibility (entry types)**: exported `ErrorMessages` and `ErrorCodeMap` from the root entry so existing consumers can import public error template types directly from `schema-dsl`.
- **Compatibility (`dsl` overloads)**: restored the optional `SchemaIOOptions` second argument for `dsl(object, options?)` and `dsl(string, options?)`, preserving v1-style call sites.
- **Compatibility (`dsl` builder typing)**: narrowed the root `dsl('...')` overload to the concrete `DslBuilder` type so builder-specific APIs remain type-safe for consumers.
- **Compatibility (`validate` generics)**: relaxed the top-level `validate<T>()` and `validateAsync<T>()` input parameter to `unknown` while preserving typed return data.
- **Release**: synchronized package metadata, changelog coverage, lockfile versioning, audit gate and npm repository URL normalization before tag-based publish.

---

## [2.0.1] — 2026-05-22

### Fixes

- **Security (DslBuilder)**: built-in string validators (`domain`, `ip`, `base64`, `jwt`, `phone`, `idCard`, `slugChain`, `creditCard`, `licensePlate`, `postalCode`, `passport`, `username`, `password`) now use a new private `_setPattern()` that bypasses the safe-regex check. Public `.pattern()` still enforces the check for user-supplied patterns; this prevents false-positive ReDoS rejections on pre-approved, production-tested regex patterns.
- **Security (SchemaUtils)**: `toHTML()` now escapes all dynamic content (`title`, field names, types, labels) through `_escapeHtml()`, preventing XSS when field names or labels contain `<`, `>`, `&`, `"`, or `'`. `toMarkdown()` escapes pipe characters and newlines through `_escapeMdCell()`, preventing broken table rendering.
- **Security (Exporters)**: `PostgreSQLExporter._formatDefaultValue()` and `MySQLExporter._formatDefaultValue()` now call `_escapeString()` on JSON-stringified object/array default values, preventing SQL injection when default values contain single quotes (e.g. `{ name: "O'Brien" }`). `MySQLExporter` also no longer emits `[object Object]` for object-type defaults.
- **Correctness (index)**: `resetRuntimeState()` now fully resets all runtime-mutable globals: `_strictMode` (TypeRegistry), custom types (DslBuilder + TypeRegistry), locale registry (Locale.reset()), and user-added pattern keys in `PATTERNS.phone / .idCard / .creditCard` via an initial-keys snapshot — preventing cross-test or cross-tenant leakage.
- **Correctness (CacheManager)**: the `options` setter now rebuilds the internal `MemoryCache` instance when `maxSize` changes, migrating existing entries to the new capacity. Previously, only the `_maxSize` field was updated while the cache instance retained its original capacity.
- **Correctness (TypeConverter)**: `toMySQLType()` and `toPostgreSQLType()` no longer map the JSON Schema `"null"` type to the SQL keyword `NULL` (which is a constraint, not a data type). Both now return `TEXT`.
- **DX (Plugins)**: removed `console.log` calls from `install()` and `uninstall()` in `custom-format`, `custom-validator`, and `custom-type-example` example plugins. Runtime error logging via `console.error` is preserved.
- **DX (SchemaUtils)**: added JSDoc to `SchemaUtils.validateBatch()` noting that it recompiles the schema on every call (no caching), with a recommendation to use `Validator.validateBatch()` for repeated validations of the same schema.

---

## [2.0.0] — 2026-05-09

### Breaking Changes (v1 → v2)

- **BC-2**: `DslAdapter.parseObject()` now returns `ObjectDslBuilder` (chainable: `.strict()`, `.requireAll()`, `.toSchema()`, `.toJsonSchema()`) instead of plain `JSONSchema`. Call `.toSchema()` to get the raw schema.
- **BC-4**: `DslAdapter.typeMap` is now a Proxy getter; `DslAdapter.registerType()` method added for direct registration.
- **BC-5**: `ConditionalBuilder.require(field)` method added for v1 field-requirement compatibility.
- **BC-6**: `Validator.validateAsync()` added; async custom validators in sync `validate()` now return `{ valid: false }` with an error message instead of silently passing.
- **BC-7**: `string:N` single-value DSL now expands to `{ minLength: N, maxLength: N }` (exactLength compat, consistent with v1 behavior).

### New Features

- **ObjectDslBuilder**: New class wrapping object schemas; supports `.strict()`, `.requireAll()`, `.toSchema()`, `.toJsonSchema()`, `.toString()`.
- **validateAsync()**: Full async validation support with typed return (`Promise<T>`); throws `ValidationError` on failure.
- **installStringExtensions()**: Opt-in String.prototype extension; auto-installed at module load for v1 compatibility.

### Documentation & Examples

- 58 example files in `examples/docs/` fully enriched (90–130+ lines each) with complete API coverage.
- All code comments translated to English (CJK locales and output strings preserved).
- `docs/api-reference.md`: fixed 4 doc inconsistencies (string:N behavior, validateAsync signature, LocaleMessage params, exactOptionalPropertyTypes notes).

### Quality

- 1095 tests passing (75 test files).
- 0 TypeScript errors in source and examples.
- ESM + CJS dual format build.

### Fixes

- **Security**: replace the custom regex ReDoS heuristic in `CustomKeywords` with `safe-regex`, so catastrophic patterns such as `((a)+)+$` are rejected before execution.
- **Validation**: stop caching `DslBuilder.toSchema()` results inside `Validator`, so chain mutations made after the first validation call are honored by both `validate()` and `validateAsync()`.
- **Validation**: make `ConditionalBuilder` cache `Validator` instances by constructor-level option set, so repeated calls with different `allErrors` / `useDefaults` configurations no longer reuse a stale validator.
- **Exporters**: fix MySQL integer sizing so `TypeConverter.toMySQLType()` checks both `minimum` and `maximum` before choosing `TINYINT` / `SMALLINT` / `INT`, avoiding undersized column types.
- **Exporters**: escape Markdown table cell content in `MarkdownExporter`, so field names, constraint text, and multiline descriptions containing `|` or newlines no longer break rendered tables.
- **Tests**: add focused regression coverage for unsafe regex rejection while preserving the existing invalid-regex error path.

## Links

- [GitHub Repository](https://github.com/vextjs/schema-dsl)
- [Online Documentation](https://vextjs.github.io/schema-dsl)
- [Detailed Changelogs](./changelogs/)
- [Contributing Guide](./CONTRIBUTING.md)

[Unreleased]: https://github.com/vextjs/schema-dsl/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/vextjs/schema-dsl/compare/v2.1.6...v3.0.0
[2.1.6]: https://github.com/vextjs/schema-dsl/compare/v2.1.5...v2.1.6
[2.1.5]: https://github.com/vextjs/schema-dsl/compare/v2.1.4...v2.1.5
[2.1.4]: https://github.com/vextjs/schema-dsl/compare/v2.1.3...v2.1.4
[2.1.3]: https://github.com/vextjs/schema-dsl/compare/v2.1.2...v2.1.3
[2.1.2]: https://github.com/vextjs/schema-dsl/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/vextjs/schema-dsl/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/vextjs/schema-dsl/compare/v2.0.11...v2.1.0
[2.0.11]: https://github.com/vextjs/schema-dsl/compare/v2.0.10...v2.0.11
[2.0.10]: https://github.com/vextjs/schema-dsl/compare/v2.0.9...v2.0.10
[2.0.9]: https://github.com/vextjs/schema-dsl/compare/v2.0.8...v2.0.9
[2.0.8]: https://github.com/vextjs/schema-dsl/compare/v2.0.7...v2.0.8
[2.0.7]: https://github.com/vextjs/schema-dsl/compare/v2.0.6...v2.0.7
[2.0.6]: https://github.com/vextjs/schema-dsl/compare/v2.0.5...v2.0.6
[2.0.5]: https://github.com/vextjs/schema-dsl/compare/v2.0.4...v2.0.5
[2.0.4]: https://github.com/vextjs/schema-dsl/compare/v2.0.3...v2.0.4
[2.0.3]: https://github.com/vextjs/schema-dsl/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/vextjs/schema-dsl/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/vextjs/schema-dsl/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/vextjs/schema-dsl/compare/v2.0.0-beta.2...v2.0.0
[2.0.0-beta.2]: https://github.com/vextjs/schema-dsl/releases/tag/v2.0.0-beta.2
[v1.2.5]: https://github.com/vextjs/schema-dsl/compare/v1.2.4...v1.2.5
[v1.2.4]: https://github.com/vextjs/schema-dsl/compare/v1.2.3...v1.2.4
[v1.2.3]: https://github.com/vextjs/schema-dsl/compare/v1.2.2...v1.2.3
[v1.2.2]: https://github.com/vextjs/schema-dsl/compare/v1.1.8...v1.2.2
[v1.1.8]: https://github.com/vextjs/schema-dsl/compare/v1.1.7...v1.1.8
[v1.1.7]: https://github.com/vextjs/schema-dsl/compare/v1.1.6...v1.1.7
[v1.1.6]: https://github.com/vextjs/schema-dsl/compare/v1.1.5...v1.1.6
[v1.1.5]: https://github.com/vextjs/schema-dsl/compare/v1.1.4...v1.1.5
[v1.1.4]: https://github.com/vextjs/schema-dsl/compare/v1.1.3...v1.1.4
[v1.1.3]: https://github.com/vextjs/schema-dsl/compare/v1.1.2...v1.1.3
[v1.1.2]: https://github.com/vextjs/schema-dsl/compare/v1.1.1...v1.1.2
[v1.1.1]: https://github.com/vextjs/schema-dsl/compare/v1.1.0...v1.1.1
[v1.1.0]: https://github.com/vextjs/schema-dsl/compare/v1.0.9...v1.1.0
[v1.0.9]: https://github.com/vextjs/schema-dsl/compare/v1.0.8...v1.0.9
[v1.0.0]: https://github.com/vextjs/schema-dsl/releases/tag/v1.0.0

