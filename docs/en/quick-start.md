# schema-dsl Quick Start

Start here if you are new to schema-dsl. After this page, continue with [DSL Syntax](dsl-syntax.md) for authoring rules and [Validation Guide](validation-guide.md) for real validation flows.

## Installation

```bash
npm install schema-dsl
```

> **Node.js requirement**: `>=18.0.0`
>
> The current TypeScript rewrite uses `Node.js >=18.0.0` as the only runtime baseline and no longer promises compatibility with older Node versions.

Repository contributors use Node.js 24 LTS and `npm ci --engine-strict`; the complete development toolchain also runs on Node.js 22.13.0 and later Node.js 22 releases. CI tests Node.js 18/20 by installing the built package in separate runtime-only consumers. This distinction does not change application installation requirements.

---

## 5-minute Quick Start

### 1. Hello World in 30 seconds

```javascript
import { s, validate } from 'schema-dsl/pure';

// Define a schema
const schema = s({
  name: 'string:1-50!',
  email: 'email!'
});

// Validate data with the convenience helper
const result = validate(schema, {
  name: 'John',
  email: 'john@example.com'
});

console.log(result.valid); // true
```

**Explanation**:

- `'string:1-50!'` means a required string with length 1 to 50.
- `'email!'` means a required email field.
- `!` marks a field as required.

---

### 2. DSL syntax cheat sheet in 1 minute

```javascript
// Basic types
'string'           // string
'number'           // number
'integer'          // integer
'boolean'          // boolean
'email'            // email
'url'              // URL
'date'             // date

// Constraints
'string:3-32'      // length 3-32
'string:100'       // max length 100, shorthand
'string:-100'      // max length 100, explicit form
'string:10-'       // min length 10, no maximum
'number:18-120'    // range 18-120

// Required
'string!'          // required string
'email!'           // required email

// Enum
'active|inactive|pending'    // one of three values

// Arrays
'array<string>'              // string array
'array:1-10<string>'         // 1 to 10 strings
'array<string:1-50>'         // array items with constraints
```

**Syntax rules**:

- `type:max` -> maximum value or length, shorthand
- `type:min-max` -> range
- `type:min-` -> minimum only
- `type:-max` -> maximum only

---

### 3. Chainable fields in 2 minutes

The recommended authoring entry is `schema-dsl/pure` with the `s` namespace. Keep simple fields as DSL strings, wrap a DSL seed with `s('...')` when you need chain methods such as `.label()`, `.messages()`, `.pattern()` or `.custom()`, and use `s.xxx()` factories when you want the strongest TypeScript method discovery.

```javascript
import { s } from 'schema-dsl/pure';

const schema = s({
  // DSL seed + chain methods
  email: s('email!')
    .pattern(/custom/)
    .label('email address'),

  username: s('string:3-32!')
    .pattern(/^[a-zA-Z0-9_]+$/)
    .messages({
      pattern: 'Only letters, numbers, and underscores are allowed'
    })
    .label('username'),

  // Simple fields can stay as plain DSL strings
  age: 'number:18-120',
  role: 'user|admin',

  // Factory entry with full method discovery
  recoveryEmail: s.email()
    .label('recovery email')
    .require()
});
```

**Available methods**:

- `.pattern(regex)` - regular expression validation
- `.label(text)` - field label
- `.messages(obj)` - custom messages
- `.description(text)` - description
- `.custom(fn)` - custom validator

---

### 4. Complete example in 2 minutes

```javascript
import { s, validate } from 'schema-dsl/pure';

// Define a user registration schema
const registerSchema = s({
  // Username: regex validation
  username: s('string:3-32!')
    .pattern(/^[a-zA-Z0-9_]+$/)
    .label('username')
    .error({
      pattern: 'Only letters, numbers, and underscores are allowed'
    }),

  // Email: label
  email: s('email!').label('email address'),

  // Password: complex regex
  password: s('string:8-64!')
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
    .label('password')
    .error({
      pattern: 'Must include uppercase letters, lowercase letters, and numbers'
    }),

  // Simple fields
  age: 'number:18-120',
  role: 'user|admin'
});

// Validate data
const testData = {
  username: 'john_doe',
  email: 'john@example.com',
  password: 'Password123',
  age: 25,
  role: 'user'
};

const result = validate(registerSchema, testData);

if (result.valid) {
  console.log('Validation passed!');
} else {
  console.log('Validation failed:', result.errors);
}
```

---

## Best Practices

### 1. Use plain DSL for simple fields

```javascript
import { s } from 'schema-dsl/pure';

const schema = s({
  name: 'string:1-50!',     // concise
  age: 'number:18-120',     // clear
  role: 'user|admin'        // direct
});
```

### 2. Use chain APIs for complex fields

```javascript
import { s } from 'schema-dsl/pure';

const schema = s({
  email: s('email!')
    .pattern(/custom/)
    .messages({...})
    .label('email'),

  username: s('string:3-32!')
    .pattern(/^\w+$/)
    .custom(checkExists),

  recoveryEmail: s.email()
    .label('recovery email')
    .require()
});
```

### 3. The 80/20 rule

**Use plain DSL strings for simple fields. Use `s('...')` when a field needs labels, messages, regexes or custom validators. Use `s.xxx()` factories when you want the most complete TypeScript method discovery.**

---

## Common Scenarios

### Form validation

```javascript
const formSchema = s({
  email: s('email!').label('email address'),
  password: s('string:8-64!').label('password'),
  nickname: s('string:2-20').label('nickname'),
  bio: 'string:500',
  website: 'url',
  age: 'number:18-120',
  gender: 'male|female|other'
});
```

### Custom validation

> `.custom()` supports synchronous functions. If it returns a `Promise`, use `validateAsync()`. Synchronous `validate()` returns an explicit error when it sees a Promise-returning custom validator.

```javascript
const schema = s({
  username: s('string:3-32!')
    .custom((value) => {
      if (value === 'admin') {
        return 'Username already exists';
      }
    })
});
```

### Nested objects

```javascript
const schema = s({
  user: {
    profile: {
      name: s('string:1-50!').label('name'),
      avatar: s('url').label('avatar'),
      social: {
        twitter: s('url').pattern(/twitter\.com/),
        github: s('url').pattern(/github\.com/)
      }
    }
  }
});
```

### Object arrays

```javascript
const orderSchema = s({
  orderNo: 'string!',
  items: s.array({
    sku: 'string!',
    quantity: 'integer:1-999!',
    price: 'number:0-!'
  }).min(1)
});
```

---

## Next Steps

### Learn more

- [Complete DSL Syntax Guide](./dsl-syntax.md)
- [Complete Type List](./type-reference.md)
- [Chain Method List](./chain-methods.md)
- [API Reference](./api-reference.md)
- [String Extensions](./string-extensions.md)

### Example code

- [Complete Quick Start example](https://github.com/devcodex-labs/schema-dsl/blob/main/examples/docs/quick-start.ts)

Other topic examples are linked from the bottom of their own documents and use stable GitHub example links.

<a id="database-export"></a>

### Advanced features

- [Custom validators](./api-reference.md#customvalidator)
- [Conditional validation](./conditional-api.md)
- [Database schema export](./api-reference.md#exporters)

---

## Entry choices

Use `schema-dsl/pure` for ordinary application code. It gives you the same schema authoring API without installing global String methods.

Use `schema-dsl/runtime` when a framework, plugin host or multi-tenant app needs an isolated runtime instance:

```javascript
import { createRuntime } from 'schema-dsl/runtime';

const runtime = createRuntime();
const schema = runtime.s({
  email: 'email!',
  username: runtime.s('string:3-32!').label('username')
});
```

Use String Extensions or the compile-time transform only when you intentionally want direct string-chain authoring such as `'email!'.label('Email')`. See [String Extensions](./string-extensions.md) and [Runtime Isolation](./runtime-isolation.md) for the boundary.

For design background and benchmark data, continue with [Design Philosophy](./design-philosophy.md) and [Performance Guide](./performance-guide.md).

---

## FAQ

### Q: What is the difference between String extensions and plain DSL?

**A**:

- **Plain DSL**: best for simple fields, concise syntax.
- **`s('...')` chain API**: best for complex fields without relying on global prototype changes.
- **`s.xxx()` factories**: best when you want the strongest TypeScript method discovery.
- **String extensions**: available when you intentionally enable direct string-chain authoring.

```javascript
// Plain DSL, simple
name: 'string:1-50!'

// s() chain API, complex and recommended
email: s('email!')
  .pattern(/custom/)
  .messages({...})

// String extensions, explicitly enabled
import 'schema-dsl/register-string';
import { s } from 'schema-dsl/pure';

const schemaWithStringExtension = s({
  email: 'email!'.pattern(/custom/).messages({...})
});
```

### Q: How do I explicitly enable String extensions?

**A**:

```javascript
import 'schema-dsl/register-string';
import { s } from 'schema-dsl/pure';

const schema = s({
  email: 'email!'.label('Email')
});
```

For cleanup in tests or legacy compatibility details, see [String Extensions](./string-extensions.md).

### Q: Does schema-dsl support TypeScript?

**A**: Yes. `schema-dsl` ships complete TypeScript type definitions.

---

## Congratulations

You now know the core `schema-dsl` workflow.

**Key takeaways**:

1. DSL syntax is concise and readable.
2. `schema-dsl/pure` + `s` is the recommended default entry for application code.
3. `s('...')` gives explicit DSL seeds plus builder hints.
4. `s.xxx()` factories provide the strongest method discovery.

**Start using it**: `npm install schema-dsl`

---

## Corresponding Example File

**Example entry**: [quick-start.ts](https://github.com/devcodex-labs/schema-dsl/blob/main/examples/docs/quick-start.ts)
**Description**: Covers the Hello World flow, the `schema-dsl/pure` + `s` authoring path, a user registration example, and the basic `validate()` plus `Validator.compile()` reuse path from the quick start. It can be run directly as a reference.

---
