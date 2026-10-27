<div align="center">

# 🎯 schema-dsl

**Progressive TypeScript schema DSL for concise, serializable field rules — one schema for validation, reuse, export, documentation, and i18n.**

📚 **Documentation**: [https://devcodex-labs.github.io/schema-dsl](https://devcodex-labs.github.io/schema-dsl)

[![npm version](https://img.shields.io/npm/v/schema-dsl.svg?style=flat-square)](https://www.npmjs.com/package/schema-dsl)
[![npm downloads](https://img.shields.io/npm/dm/schema-dsl.svg?style=flat-square)](https://www.npmjs.com/package/schema-dsl)
[![Build Status](https://github.com/devcodex-labs/schema-dsl/workflows/CI/badge.svg)](https://github.com/devcodex-labs/schema-dsl/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-Native-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg?style=flat-square)](https://www.apache.org/licenses/LICENSE-2.0)

[Quick Start](#quick-start) · [Documentation](https://devcodex-labs.github.io/schema-dsl) · [Feature Overview](#feature-overview) · [Compared with Zod](#compared-with-zod) · [Examples](./examples)

```bash
npm install schema-dsl
```

If schema-dsl saves you time, a ⭐ on [GitHub](https://github.com/devcodex-labs/schema-dsl) helps others find it.

</div>

---

## ⚡ TL;DR (30-second intro)

**What is schema-dsl?**

Write field rules like this:

```typescript
import { s, validate } from 'schema-dsl/pure';

const userSchema = s({
  username: s('string:3-32!').label('Username'),
  email:    s('email!').label('Email'),
  role:     'admin|user|guest',
  contact:  'types:email|phone'
});

const contactEmail = s('email!').label('Email').pattern(/custom/);
const accountEmail = s.email().label('Email').pattern(/custom/).require();

const result = validate(userSchema, req.body);
```

Then that **same set of rules** continues to power:

- ✅ **Sync / async validation** — `validate()` / `validateAsync()`
- ✅ **Schema derivation** — `pick / omit / partial` to tailor schemas per endpoint
- ✅ **Database schemas** — export directly to MongoDB / MySQL / PostgreSQL
- ✅ **Field documentation** — auto-generate Markdown
- ✅ **Unified error model** — `ValidationError` + `I18nError`
- ✅ **Internationalization** — 5 built-in locales (zh-CN / en-US / ja-JP / es-ES / fr-FR), switchable at runtime

**5-minute tutorial**: [Quick Start](https://devcodex-labs.github.io/schema-dsl/quick-start) | **Full docs**: [Online Documentation](https://devcodex-labs.github.io/schema-dsl)

---

## 🗺️ Documentation

**Getting started**:
- [Quick Start](https://devcodex-labs.github.io/schema-dsl/quick-start) — up and running in 5 minutes
- [DSL Syntax Reference](#dsl-syntax-reference) — syntax cheatsheet
- [FAQ](https://devcodex-labs.github.io/schema-dsl/faq) — common questions

**Core features**:
- [validate()](https://devcodex-labs.github.io/schema-dsl/validate) — synchronous validation API
- [SchemaUtils](https://devcodex-labs.github.io/schema-dsl/schema-utils) — schema reuse
- [Conditional Validation API](https://devcodex-labs.github.io/schema-dsl/conditional-api) — s.if / s.match
- [Async Validation & Framework Integration](https://devcodex-labs.github.io/schema-dsl/validate-async) — Express / Koa / Fastify
- [Error Handling & i18n](https://devcodex-labs.github.io/schema-dsl/error-handling) — error model

**Export & integration**:
- [Export Guide](https://devcodex-labs.github.io/schema-dsl/export-guide) — MongoDB / MySQL / PostgreSQL
- [TypeScript Guide](https://devcodex-labs.github.io/schema-dsl/typescript-guide) — type inference and usage
- [Extensions and Integration](https://devcodex-labs.github.io/schema-dsl/extensions-overview) — custom business types, keywords, runtime isolation, and plugins

**Full docs**: [Online Documentation](https://devcodex-labs.github.io/schema-dsl) · [Chinese Documentation](./docs/zh/index.md) · [Feature Index](https://devcodex-labs.github.io/schema-dsl/FEATURE-INDEX)

---

## ✨ Why schema-dsl?

### 🎯 Concise field rules — less boilerplate

<table>
<tr>
<td width="50%" valign="top">

**❌ Manual JSON Schema** — verbose

```javascript
const schema = {
  type: 'object',
  properties: {
    username: { type: 'string', minLength: 3, maxLength: 32 },
    email: { type: 'string', format: 'email' },
    age: { type: 'number', minimum: 18, maximum: 120 }
  },
  required: ['username', 'email']
};
```

</td>
<td width="50%" valign="top">

**✅ schema-dsl** — concise and clean

```typescript
// just 3 lines
const schema = s({
  username: 'string:3-32!',
  email:    'email!',
  age:      'number:18-120'
});
```

</td>
</tr>
</table>

### 💪 Full-featured

| Feature | schema-dsl | Notes |
|---------|:----------:|-------|
| **Basic validation** | ✅ | string, number, boolean, date, email, url, phone… |
| **Advanced validation** | ✅ | regex, custom functions, conditional branches, nested objects, arrays… |
| **Cross-type union** | ✅ | `types:email\|phone` — one field accepts multiple types |
| **Error messages** | ✅ | auto-translated + custom messages + field labels |
| **i18n business errors** | ✅ | `I18nError` with numeric error codes |
| **Database export** | ✅ | MongoDB / MySQL / PostgreSQL schema generation |
| **Documentation generation** | ✅ | Markdown field docs auto-generated |
| **TypeScript** | ✅ | Written in native TypeScript with full type inference |
| **Extension system** | ✅ | One business type definition for pure DSL, `s('...')`, and `s.xxx()` entries; plus formats and validators |
| **Schema reuse** | ✅ | pick / omit / partial / extend |
| **Side-effect-controlled entries** | ✅ | root and `schema-dsl/pure` do not install `String.prototype`; `compat` / `register-string` are explicit opt-in entries; `runtime` isolates runtime state |
| **Compile-time transform** | ✅ | `schema-dsl/transform` core and optional `schema-dsl/esbuild` adapter |
| **Progressive `s` authoring** | ✅ | Use plain DSL strings, `s('email!')`, or `s.email()`; all converge to the same builder implementation |

### 🎨 One schema, many uses (unique capability)

```typescript
import { s, exporters, SchemaUtils } from 'schema-dsl/pure';

const userSchema = s({
  id:        'uuid!',
  username:  'string:3-32!',
  email:     'email!',
  password:  'string:8-64!',
  age:       'number:18-120',
  createdAt: 'string!'
});

// 📋 derive scenario-specific schemas
const createSchema = SchemaUtils.omit(userSchema, ['id', 'createdAt']);
const updateSchema = SchemaUtils.partial(SchemaUtils.pick(userSchema, ['username', 'email']));
const publicSchema = SchemaUtils.omit(userSchema, ['password']);

// 🗄️ export the same schema to any database
const mongoSchema = new exporters.MongoDBExporter().export(userSchema);
const mysqlDDL    = new exporters.MySQLExporter().export('users', userSchema);
const pgDDL       = new exporters.PostgreSQLExporter().export('users', userSchema);

// 📝 generate field documentation from the same schema
const markdown = exporters.MarkdownExporter.export(userSchema, { title: 'User Field Reference' });
```

> ⚠️ SQL exporters only accept `anyOf` / `oneOf` when every branch resolves to the **same** SQL column type (for example `ipv4 | ipv6`). Ambiguous unions such as `string | number` now throw an explicit error instead of silently choosing the first branch.

---

## 📦 Installation

```bash
npm install schema-dsl
```

**Runtime requirement**: Node.js >= 18.0.0

The entry points below are part of the package contract and are covered by packed-consumer tests for both ESM and CommonJS.

---

## 📦 Package Entry Points

Starting with v3, the root import is side-effect-free: importing or requiring `schema-dsl` does not install, replace, or remove `String.prototype` properties. Direct string chaining remains available through explicit compatibility entries.

| Entry | Purpose |
|-------|---------|
| `schema-dsl` | Side-effect-free default entry; exports the `s` / `dsl` namespace and validation helpers without installing `String.prototype` extensions. |
| `schema-dsl/pure` | Stable compatibility alias for the same side-effect-free core API. |
| `schema-dsl/runtime` | Runtime adapter factory for per-tenant/per-app isolated Locale messages, messageProvider, TypeRegistry scope, PATTERNS, validator instances and `I18nError` creation. |
| `schema-dsl/compat` | Explicit v1/v2 compatibility entry that installs String extensions on import. |
| `schema-dsl/register-string` | Side-effect entry for explicitly registering String extensions during application startup. |
| `schema-dsl/string-types` | Opt-in TypeScript declarations for String-chain authoring; no runtime prototype installation. |
| `schema-dsl/transform` | Babel AST transform core that rewrites static string-chain calls into helper calls imported from `schema-dsl/pure`. Babel AST packages are optional peer dependencies for projects that use this entry. |
| `schema-dsl/esbuild` | Optional esbuild plugin adapter around the transform core. `esbuild` is an optional peer dependency. |

Migrating from v2? Read the [v3 migration guide](./docs/en/migration-v3.md) or [v3 中文迁移指南](./docs/zh/migration-v3.md).

```typescript
import { s, validate } from 'schema-dsl/pure';
import { transformSchemaDsl } from 'schema-dsl/transform';
import { schemaDslEsbuildPlugin } from 'schema-dsl/esbuild';
import { createRuntime } from 'schema-dsl/runtime';

const schema = s({
  email: 'email!',
  username: s('string:3-32!').label('Username'),
  backupEmail: s.email().label('Backup email').require()
});

const transformed = transformSchemaDsl(
  'export const field = "admin|user|guest".label("Role")',
  { filename: 'schema.ts' }
);

const plugins = [schemaDslEsbuildPlugin()];

const tenantRuntime = createRuntime({
  locale: 'tenant-a',
  messages: {
    'tenant.user.missing': { code: 'TENANT_USER_MISSING', message: 'Tenant user {{#id}} is missing' }
  },
  types: {
    tenantId: { type: 'string', pattern: '^tenant_[a-z0-9]+$' }
  },
  messageProvider: ({ key, locale, fallback }) =>
    key === 'number.min' ? `[${locale}] {{#label}} must be >= {{#limit}}` : fallback
});

const tenantSchema = tenantRuntime.s({
  id: 'tenantId!',
  age: 'number:18-120'
});

const tenantEmail = tenantRuntime.s.email().label('Tenant email').require().toSchema();

const tenantResult = tenantRuntime.validate(tenantSchema, { id: 'tenant_demo', age: 16 });
```

The transform handles static DSL string literals, including naked pipe enums such as `"admin|user|guest"`, and injects imports from `schema-dsl/pure`. By default it rewrites the complete built-in String-chain API (`.label()`, `.pattern()`, `.require()`, `.required()`, `.toJsonSchema()`, and the other methods installed by `schema-dsl`). Use `additionalMethods` for user-defined chain methods, and `additionalTypes` / `additionalTypePatterns` for registered custom DSL type literals such as `"tenant-id!".label("Tenant")`; `methods` remains a legacy replacement set when you intentionally want to override the built-in default list. Dynamic expressions, computed member calls, and already transformed helper calls are left unchanged.

Use `schema-dsl/pure` for ordinary application code. Use `schema-dsl/runtime` when a framework needs independent runtime state per app, tenant, worker, or plugin host. `createRuntime()` keeps message lookup, per-call `messageProvider`, runtime custom types, namespace factories, pattern overrides, validator caches, custom keyword messages, conditional branches, async custom validators, and `createI18nError()` inside that runtime instance. Use one runtime for the app/plugin lifecycle, pass request-level locale, messages, `messageProvider` or `{ coerce: false }` via per-call options, and call `configure(..., { mode: 'replace' | 'reset' })`, `clearCache()`, `getStats()` or `dispose()` for hot reload and shutdown.

`createSchemaDslRuntime()` and `createSchemaDslAdapter()` are equivalent aliases of `createRuntime()` for adapter-oriented integrations.

---

<a id="quick-start"></a>

## 🚀 Quick Start

### 1. Basic validation

```typescript
import { s, validate } from 'schema-dsl/pure';

const userSchema = s({
  username: 'string:3-32!',
  email:    'email!',
  age:      'number:18-120',
  role:     'admin|user|guest',
  tags:     'array<string>'
});

// ✅ validation passed
const result = validate(userSchema, {
  username: 'john_doe',
  email:    'john@example.com',
  age:      25,
  role:     'user',
  tags:     ['verified']
});

console.log(result.valid);   // true
console.log(result.data);    // validated data

// ❌ validation failed
const bad = validate(userSchema, { username: 'ab', email: 'not-email' });
console.log(bad.errors);
// [
//   { path: 'username', message: 'username must be at least 3 characters' },
//   { path: 'email',    message: 'email must be a valid email address' }
// ]
```

### 2. Async validation + Express integration

```typescript
import { s, validateAsync, ValidationError } from 'schema-dsl/pure';

const createUserSchema = s({
  username: 'string:3-32!',
  email:    'email!',
  password: 'string:8-32!'
});

app.post('/api/users', async (req, res, next) => {
  try {
    // throws ValidationError automatically on failure
    const validData = await validateAsync(createUserSchema, req.body);
    const user = await db.users.create(validData);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// global error handler
app.use((error, req, res, next) => {
  if (error instanceof ValidationError) {
    return res.status(400).json({ success: false, errors: error.errors });
  }
  next(error);
});
```

### 3. Schema reuse (create / update / public)

```typescript
import { s, SchemaUtils } from 'schema-dsl/pure';

const userSchema = s({
  id:        'uuid!',
  username:  'string:3-32!',
  email:     'email!',
  password:  'string:8-64!',
  createdAt: 'string!'
});

// create endpoint: remove server-generated fields
const createSchema = SchemaUtils.omit(userSchema, ['id', 'createdAt']);

// update endpoint: pick editable fields, all optional
const updateSchema = SchemaUtils.partial(
  SchemaUtils.pick(userSchema, ['username', 'email'])
);

// public response: hide sensitive fields
const publicSchema = SchemaUtils.omit(userSchema, ['password']);
```

### 4. Database schema export

```typescript
import { s, exporters } from 'schema-dsl/pure';

const productSchema = s({
  name:      'string:1-100!',
  price:     'number:>0!',
  stock:     'integer:0-!',
  category:  'string!',
  createdAt: 'datetime!'
});

// MongoDB $jsonSchema (for db.createCollection() document validation; not a Mongoose model schema)
const mongoSchema = new exporters.MongoDBExporter().export(productSchema);
/*
{
  $jsonSchema: {
    bsonType: 'object',
    properties: {
      name:      { bsonType: 'string', minLength: 1, maxLength: 100 },
      price:     { bsonType: 'double', minimum: 0 },
      stock:     { bsonType: 'int',    minimum: 0 },
      category:  { bsonType: 'string' },
      createdAt: { bsonType: 'string' }
    },
    required: ['name', 'price', 'stock', 'category', 'createdAt']
  }
}
*/

// MySQL DDL
const mysqlDDL = new exporters.MySQLExporter().export('products', productSchema);
/*
CREATE TABLE `products` (
  `name`      VARCHAR(100) NOT NULL,
  `price`     DOUBLE NOT NULL,
  `stock`     BIGINT NOT NULL,
  `category`  VARCHAR(255) NOT NULL,
  `createdAt` DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
*/

// Markdown field documentation
const markdown = exporters.MarkdownExporter.export(productSchema, { title: 'Product Field Reference' });
```

---

<a id="compared-with-zod"></a>

## ⚖️ Compared with Zod

The same schema in both libraries:

```typescript
// Zod
import { z } from 'zod';

const user = z.object({
  username: z.string().min(3).max(32),
  email:    z.string().email(),
  age:      z.number().min(18).max(120).optional(),
  tags:     z.array(z.string()),
});

const result = user.safeParse(input);
```

```typescript
// schema-dsl
import { s, validate } from 'schema-dsl/pure';

const user = s({
  username: 'string:3-32!',
  email:    'email!',
  age:      'number:18-120',
  tags:     'array<string>!',
});

const result = validate(user, input);
```

Key differences:

- **Serializable rules** — schema-dsl field rules are plain strings, so they can be stored as JSON or in a database and loaded at runtime; Zod schemas are code.
- **Built-in exporters** — the same schema exports to MongoDB `$jsonSchema`, MySQL / PostgreSQL DDL, and Markdown field docs.
- **Built-in i18n** — error messages ship in 5 built-in locales, switchable at runtime.
- **Where Zod is stronger** — a much larger ecosystem and full static type inference via `z.infer`; schema-dsl offers lighter value-type extraction (`InferSchema` / `InferDslString`), while constraints stay runtime-only.

---

<a id="feature-overview"></a>

## 🗒️ Feature Overview

### Common use cases

| Use case | API | Docs |
|----------|-----|------|
| API parameter validation | `validateAsync` + `ValidationError` | [Async Validation](https://devcodex-labs.github.io/schema-dsl/validate-async) |
| Form / script validation | `validate()` | [validate()](https://devcodex-labs.github.io/schema-dsl/validate) |
| Batch data validation | `SchemaUtils.validateBatch()` | [SchemaUtils](https://devcodex-labs.github.io/schema-dsl/schema-utils) |
| create / update derivation | `pick / omit / partial` | [SchemaUtils](https://devcodex-labs.github.io/schema-dsl/schema-utils) |
| Database table creation | `MongoDBExporter / MySQLExporter` | [Export Guide](https://devcodex-labs.github.io/schema-dsl/export-guide) |
| Field documentation | `MarkdownExporter` | [Export Guide](https://devcodex-labs.github.io/schema-dsl/export-guide) |
| Multilingual API errors | `I18nError` | [Error Handling](https://devcodex-labs.github.io/schema-dsl/error-handling) |
| Conditional / dynamic rules | `s.if()` / `s.match()` | [Conditional API](https://devcodex-labs.github.io/schema-dsl/conditional-api) |
| Custom DSL types | `registerExtensions([...])` / `s.registerExtension()` | [Extensions Overview](https://devcodex-labs.github.io/schema-dsl/extensions-overview) |
| No global String extension | `schema-dsl/pure` | [API Reference](https://devcodex-labs.github.io/schema-dsl/api-reference) |
| Compile-time string-chain transform | `transformSchemaDsl()` / `schemaDslEsbuildPlugin()` | [API Reference](https://devcodex-labs.github.io/schema-dsl/api-reference) |

---

<a id="dsl-syntax-reference"></a>

## 📖 DSL Syntax Reference

### Basic types

```typescript
s({
  // string
  name:     'string!',         // required
  code:     'string:6',        // exact length 6
  bio:      'string:-500',     // max length 500
  username: 'string:3-32',     // length range 3–32

  // number
  age:   'number:18-120',      // range 18–120
  score: 'integer:0-100',      // integer 0–100
  price: 'number:>0',          // strictly greater than 0
  level: 'number:>=1',         // greater than or equal to 1

  // enum
  status: 'active|inactive|pending',  // string enum
  tier:   'enum:number:1|2|3',        // numeric enum

  // array
  tags:  'array<string>',             // string array
  items: 'array:1-10<number>',        // 1–10 numeric elements

  // boolean
  active: 'boolean!',

  // union type
  contact: 'types:email|phone!',      // email or phone, required
  price2:  'types:number:0-|string',  // number or string
})
```

### Built-in formats

```typescript
s({
  email:     'email!',          // email address
  website:   'url!',            // URL
  birthday:  'date!',           // YYYY-MM-DD
  createdAt: 'datetime!',       // ISO 8601
  userId:    'uuid!',           // UUID
  serverIp:  'ipv4!',           // IPv4 address
  host:      'hostname!',       // hostname
  slug:      'slug:3-100!',     // URL-friendly string
})
```

### Fluent chain API (`s` progressive entries)

```typescript
import { s } from 'schema-dsl/pure';

const schema = s({
  username: s('string:3-32!')
    .username()
    .label('username')
    .messages({ required: 'Username is required' }),

  email: s('email!').label('email address'),

  phone: s('string:8-16!')
    .pattern(/^\+[1-9]\d{6,14}$/)
    .label('phone number (E.164)'),

  recoveryEmail: s.email()
    .label('recovery email')
    .pattern(/@company\.com$/)
    .require(),
});
```

### Conditional validation

```typescript
// s.match — route to different rules based on a field value
const contactSchema = s({
  type:    'email|phone|username',
  contact: s.match('type', {
    email:  'email!',
    phone:  'string:8-16!',
    username: 'string:3-32!',
  })
});

// s.if — simple conditional branch
const orderSchema = s({
  isVip:    'boolean!',
  discount: s.if('isVip', 'number:10-50!', 'number:0-10')
});

// s.if chain assertion
s.if(d => !d.account)
  .message('Account not found')
  .and(d => d.account.balance < amount)
  .message('Insufficient balance')
  .assert(data);
```

---

## 🌍 Internationalization

```typescript
import { s, validate, Locale, I18nError } from 'schema-dsl/pure';

// built-in locales: zh-CN / en-US / ja-JP / es-ES / fr-FR (auto-loaded, no configuration needed)
const result = validate(schema, data, { locale: 'en-US' });
// error messages automatically use the specified locale

// register a custom locale
Locale.addLocale('zh-CN', {
  'user.notFound':    'User not found',
  'user.forbidden':   { code: 40003, message: 'Access forbidden' },
});

// throw i18n business errors
I18nError.assert(user, 'user.notFound');                    // auto-throw when user is falsy
I18nError.throw('user.forbidden', {}, 403);                 // throw directly
I18nError.assert(ok, 'user.notFound', {}, 404, locale);     // specify locale at runtime

// errors carry a numeric code; frontend can branch on it
try {
  await api.getUser(id);
} catch (error) {
  switch (error.code) {
    case 40003: showForbiddenPage(); break;
  }
}
```

---

## 🔌 Extensions and Plugin Packaging

Use custom DSL types when one business type should work through pure DSL strings, `s('...')`, and `s.xxx()` factories. Use `PluginManager` when you want to package validator formats, keywords, lifecycle hooks, or several extension hooks together.

```typescript
import { PluginManager, Validator, s } from 'schema-dsl/pure';

const pluginManager = new PluginManager();

// register a custom format plugin (must provide an install function)
pluginManager.register({
  name: 'extra-formats',
  install(core) {
    const validator = core as Validator;
    // register custom formats on the Validator instance via addFormat
    validator.addFormat('hex-color', {
      validate: (v: string) => /^#[0-9A-F]{6}$/i.test(v)
    });
    validator.addFormat('mac-address', {
      validate: (v: string) => /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(v)
    });
  }
});

// create a Validator and install plugins
const validator = new Validator();
pluginManager.install(validator);

// use the custom formats in a schema
const schema = s({ color: 'hex-color!', mac: 'mac-address' });
const result = validator.validate(schema, { color: '#FF5733', mac: '00:1A:2B:3C:4D:5E' });
```

---

## 🔧 Core API Reference

| API | Purpose | Returns | Docs |
|-----|---------|---------|------|
| `s(schema)` | Create a schema | Schema object | [DSL Syntax](https://devcodex-labs.github.io/schema-dsl/dsl-syntax) |
| `validate(schema, data)` | Synchronous validation | `{ valid, errors, data }` | [validate()](https://devcodex-labs.github.io/schema-dsl/validate) |
| `validateAsync(schema, data)` | Asynchronous validation | Promise (throws on failure) | [Async Validation](https://devcodex-labs.github.io/schema-dsl/validate-async) |
| `SchemaUtils.pick()` | Select fields | New schema | [SchemaUtils](https://devcodex-labs.github.io/schema-dsl/schema-utils) |
| `SchemaUtils.omit()` | Exclude fields | New schema | [SchemaUtils](https://devcodex-labs.github.io/schema-dsl/schema-utils) |
| `SchemaUtils.partial()` | Make all fields optional, or only selected fields optional when `fields` is provided | New schema | [SchemaUtils](https://devcodex-labs.github.io/schema-dsl/schema-utils) |
| `s.if(condition)` | Conditional validation | ConditionalBuilder | [Conditional API](https://devcodex-labs.github.io/schema-dsl/conditional-api) |
| `s.match(field, map)` | Branch validation | ConditionalBuilder | [Conditional API](https://devcodex-labs.github.io/schema-dsl/conditional-api) |
| `I18nError.throw()` | Throw an i18n error | never | [Error Handling](https://devcodex-labs.github.io/schema-dsl/error-handling) |
| `I18nError.assert()` | Assert then throw | void | [Error Handling](https://devcodex-labs.github.io/schema-dsl/error-handling) |
| `schema-dsl/pure` | Import the API without installing String extensions | API namespace | [API Reference](https://devcodex-labs.github.io/schema-dsl/api-reference) |
| `schema-dsl/string-types` | Opt into TypeScript hints for String-chain authoring | Type declarations | [TypeScript Usage](https://devcodex-labs.github.io/schema-dsl/typescript-guide) |
| `transformSchemaDsl()` | Rewrite static string-chain DSL calls at compile time | `{ code, changed, warnings }` | [API Reference](https://devcodex-labs.github.io/schema-dsl/api-reference) |
| `schemaDslEsbuildPlugin()` | Use the transform in esbuild build/context flows | esbuild plugin | [API Reference](https://devcodex-labs.github.io/schema-dsl/api-reference) |

---

## 📝 TypeScript Usage

```typescript
import { s, validateAsync, ValidationError } from 'schema-dsl/pure';

// ✅ wrap strings with s() in TypeScript for builder method hints
const userSchema = s({
  username: s('string:3-32!').label('username'),
  email:    s('email!').label('email'),
  age:      s('number:18-100').label('age')
});

try {
  const validData = await validateAsync(userSchema, payload);
  // validData's static type is controlled by the generic passed to validateAsync<T>.
  // Use InferSchema / InferDslDefinition for schema-literal value type extraction.
} catch (error) {
  if (error instanceof ValidationError) {
    error.errors.forEach(e => console.log(`${e.path}: ${e.message}`));
  }
}
```

> **Note**: In TypeScript projects, use `s('...')` or `s.xxx()` to get builder chain hints without adding global `String` declarations. DSL string literals also support lightweight value-type extraction through `InferSchema` / `InferDslString`, but constraints such as length ranges, regexes, defaults, and custom validators remain runtime schema rules.
> See the [TypeScript Guide](https://devcodex-labs.github.io/schema-dsl/typescript-guide) for details.

---

## 🛠️ Development

Use Node.js 24 LTS for repository development (`.nvmrc`). The complete toolchain is tested on Node.js 22.13.0, the latest Node.js 22, and Node.js 24. Install it with `npm ci --engine-strict`.

The published library keeps its Node.js >=18.0.0 runtime requirement. CI builds one tarball on Node.js 24 and verifies it in runtime-only consumers on Node.js 18.0.0, 18, 20, 22.13.0, 22, and 24. Node.js 18/20 compatibility does not imply upstream Node security maintenance.

```bash
npm run build      # compile TypeScript
npm run test       # run tests
npm run typecheck  # type check
npm run docs:linkcheck # check docs links
npm run test:audit:website # audit the website's separate dependency lockfile
```

To check a previously built package in a consumer using the selected Node version:

```bash
npm run test:runtime -- /absolute/path/schema-dsl-3.0.5.tgz
npm run test:runtime -- /absolute/path/schema-dsl-3.0.5.tgz --types
```

The second command also checks ESM/CJS declarations with TypeScript 5.9.3 and Node.js 18 types. These checks install dependencies in a temporary consumer and remove it on completion.

`npm run test:all:with-audit` checks both the library and website dependency trees. `prepublishOnly` reuses this gate before previewing the package; the website lockfile is audited independently even when its dependencies are not installed locally.

Local documentation preview:

```bash
cd website
npm run dev
```

---

## 🤝 Contributing

```bash
git clone https://github.com/devcodex-labs/schema-dsl.git
cd schema-dsl
npm install
npm test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

---

## 🔗 Links

### 📖 Core documentation
- [Quick Start](https://devcodex-labs.github.io/schema-dsl/quick-start) — up and running in 5 minutes
- [DSL Syntax Guide](https://devcodex-labs.github.io/schema-dsl/dsl-syntax) — complete syntax reference
- [validate()](https://devcodex-labs.github.io/schema-dsl/validate) — synchronous validation API
- [API Reference](https://devcodex-labs.github.io/schema-dsl/api-reference) — complete API docs
- [TypeScript Guide](https://devcodex-labs.github.io/schema-dsl/typescript-guide) — required reading for TS users
- [Best Practices](https://devcodex-labs.github.io/schema-dsl/best-practices) — avoid common pitfalls
- [Troubleshooting](https://devcodex-labs.github.io/schema-dsl/troubleshooting) — diagnosing issues

### 🎯 Feature documentation
- [SchemaUtils](https://devcodex-labs.github.io/schema-dsl/schema-utils)
- [Conditional Validation API](https://devcodex-labs.github.io/schema-dsl/conditional-api)
- [Async Validation](https://devcodex-labs.github.io/schema-dsl/validate-async)
- [Error Handling & i18n](https://devcodex-labs.github.io/schema-dsl/error-handling)
- [Union Types](https://devcodex-labs.github.io/schema-dsl/union-types)
- [Enum Types](https://devcodex-labs.github.io/schema-dsl/enum)

### 🗄️ Export & integration
- [Export Guide](https://devcodex-labs.github.io/schema-dsl/export-guide)
- [MongoDB Exporter](https://devcodex-labs.github.io/schema-dsl/mongodb-exporter)
- [MySQL Exporter](https://devcodex-labs.github.io/schema-dsl/mysql-exporter)
- [PostgreSQL Exporter](https://devcodex-labs.github.io/schema-dsl/postgresql-exporter)
- [Markdown Exporter](https://devcodex-labs.github.io/schema-dsl/markdown-exporter)
- [⚠️ Export Limitations](https://devcodex-labs.github.io/schema-dsl/export-limitations)

### 💻 Examples
- Run all documentation examples with `npm run examples:run`.
- [quick-start.ts](./examples/docs/quick-start.ts) — basic usage and registration form
- [validate-async.ts](./examples/docs/validate-async.ts) — async validation and `ValidationError` handling
- [export-guide.ts](./examples/docs/export-guide.ts) — database export overview
- [error-handling.ts](./examples/docs/error-handling.ts) — field errors and business error handling
- [object-dsl-builder.ts](./examples/docs/object-dsl-builder.ts) — object builder chaining and required-field control
- [real-world.ts](./examples/docs/real-world.ts) — combined production-style schemas for users, products, orders, and queries
- [plugin-system.ts](./examples/docs/plugin-system.ts) — plugin system and hooks

### 📝 Changelog & contributing
- [Changelog](./CHANGELOG.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Security Policy](./SECURITY.md)

---

## 📄 License

[Apache-2.0](./LICENSE)

---

<div align="center">

If this project is useful to you, please consider giving it a Star ⭐

Made with ❤️ by the schema-dsl team

</div>



