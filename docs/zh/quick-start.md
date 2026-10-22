# schema-dsl 快速上手

如果你第一次使用 schema-dsl，请从本页开始。读完后可以继续看 [DSL 语法](dsl-syntax.md) 理解规则写法，再看 [验证指南](validation-guide.md) 进入完整验证流程。

<a id="-安装"></a>

## 🚀 安装

```bash
npm install schema-dsl
```

> **Node.js 要求**：`>=18.0.0`
> 
> 当前版本以 `Node.js >=18.0.0` 为唯一运行时基线，不再承诺旧 Node 版本兼容。

仓库贡献开发使用 Node.js 24 LTS 和 `npm ci --engine-strict`；完整开发工具链也覆盖 Node.js 22.13.0 及后续 22.x 版本。CI 对 Node.js 18/20 采用独立消费者安装构建包的方式验证运行兼容性。这一区别不改变应用安装库时的要求。

---

<a id="-5分钟快速入门"></a>

## 📖 5分钟快速入门

### 1. Hello World（30秒）

```javascript
import { s, validate } from 'schema-dsl/pure';

// 定义Schema
const schema = s({
  name: 'string:1-50!',
  email: 'email!'
});

// 验证数据（使用便捷函数）
const result = validate(schema, {
  name: '张三',
  email: 'zhangsan@example.com'
});

console.log(result.valid); // true
```

**解释**:
- `'string:1-50!'` - 必填字符串，长度1-50
- `'email!'` - 必填邮箱
- `!` 表示必填

---

### 2. DSL 语法速查（1分钟）

```javascript
// 基本类型
'string'           // 字符串
'number'           // 数字
'integer'          // 整数
'boolean'          // 布尔值
'email'            // 邮箱
'url'              // URL
'date'             // 日期

// 约束
'string:3-32'      // 长度3-32（范围）
'string:100'       // 最大长度100（简写）
'string:-100'      // 最大长度100（明确写法）
'string:10-'       // 最小长度10（无最大限制）
'number:18-120'    // 范围18-120

// 必填
'string!'          // 必填字符串
'email!'           // 必填邮箱

// 枚举
'active|inactive|pending'    // 三选一

// 数组
'array<string>'              // 字符串数组
'array:1-10<string>'         // 1-10个字符串
'array<string:1-50>'         // 带约束的数组元素
```

**语法规则**:
- `type:max` → 最大值（简写）
- `type:min-max` → 范围
- `type:min-` → 只限最小
- `type:-max` → 只限最大

---

### 3. 链式字段（2分钟）

公开文档默认推荐从 `schema-dsl/pure` 导入 `s`。简单字段保留纯 DSL 字符串；需要 `.label()`、`.messages()`、`.pattern()`、`.custom()` 等链式方法时，用 `s('...')` 包裹 DSL seed；想要最完整 TypeScript 方法提示时，用 `s.xxx()` factory。

```javascript
import { s } from 'schema-dsl/pure';

const schema = s({
  // DSL seed + 链式增强
  email: s('email!')
    .pattern(/custom/)
    .label('邮箱地址'),
  
  username: s('string:3-32!')
    .pattern(/^[a-zA-Z0-9_]+$/)
    .messages({
      'pattern': '只能包含字母、数字和下划线'
    })
    .label('用户名'),
  
  // 简单字段仍然保留纯 DSL 字符串
  age: 'number:18-120',
  role: 'user|admin',

  // factory 入口提供完整方法发现
  recoveryEmail: s.email()
    .label('备用邮箱')
    .require()
});
```

**可用方法**:
- `.pattern(regex)` - 正则验证
- `.label(text)` - 字段标签
- `.messages(obj)` - 自定义消息
- `.description(text)` - 描述
- `.custom(fn)` - 自定义验证器

---

### 4. 完整示例（2分钟）

```javascript
import { s, validate } from 'schema-dsl/pure';

// 定义用户注册Schema
const registerSchema = s({
  // 用户名：正则验证
  username: s('string:3-32!')
    .pattern(/^[a-zA-Z0-9_]+$/)
    .label('用户名')
    .error({
      pattern: '只能包含字母、数字和下划线'
    }),
  
  // 邮箱：标签
  email: s('email!').label('邮箱地址'),
  
  // 密码：复杂正则
  password: s('string:8-64!')
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
    .label('密码')
    .error({
      pattern: '必须包含大小写字母和数字'
    }),
  
  // 简单字段
  age: 'number:18-120',
  role: 'user|admin'
});

// 验证数据
const testData = {
  username: 'john_doe',
  email: 'john@example.com',
  password: 'Password123',
  age: 25,
  role: 'user'
};

const result = validate(registerSchema, testData);

if (result.valid) {
  console.log('✅ 验证通过！');
} else {
  console.log('❌ 验证失败:', result.errors);
}
```

---

## 💡 最佳实践

### 1. 简单字段用纯DSL

```javascript
import { s } from 'schema-dsl/pure';

const schema = s({
  name: 'string:1-50!',     // ✅ 简洁
  age: 'number:18-120',     // ✅ 清晰
  role: 'user|admin'        // ✅ 直观
});
```

### 2. 复杂字段用链式 API

```javascript
import { s } from 'schema-dsl/pure';

const schema = s({
  email: s('email!')
    .pattern(/custom/)
    .messages({...})
    .label('邮箱'),
  
  username: s('string:3-32!')
    .pattern(/^\w+$/)
    .custom(checkExists),

  recoveryEmail: s.email()
    .label('备用邮箱')
    .require()
});
```

### 3. 80/20 法则

**简单字段保持纯 DSL 字符串；需要 label、messages、正则或自定义验证时用 `s('...')`；需要最完整 TypeScript 方法发现时用 `s.xxx()` factory。**

---

## 🎯 常见场景

### 表单验证

```javascript
const formSchema = s({
  email: s('email!').label('邮箱地址'),
  password: s('string:8-64!').label('密码'),
  nickname: s('string:2-20').label('昵称'),
  bio: 'string:500',
  website: 'url',
  age: 'number:18-120',
  gender: 'male|female|other'
});
```

### 自定义验证

> `.custom()` 支持同步函数；如果返回 `Promise`，请使用 `validateAsync()`。同步 `validate()` 遇到 Promise-returning custom validator 会返回明确错误。

```javascript
const schema = s({
  username: s('string:3-32!')
    .custom((value) => {
      if (value === 'admin') {
        return '用户名已存在';
      }
    })
});
```

### 嵌套对象

```javascript
const schema = s({
  user: {
    profile: {
      name: s('string:1-50!').label('姓名'),
      avatar: s('url').label('头像'),
      social: {
        twitter: s('url').pattern(/twitter\.com/),
        github: s('url').pattern(/github\.com/)
      }
    }
  }
});
```

### 对象数组

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

<a id="-下一步"></a>

## 📚 下一步

### 深入学习

- [DSL 语法完整指南](./dsl-syntax.md)
- [完整类型列表](./type-reference.md)
- [链式字段方法列表](./chain-methods.md)
- [API 参考文档](./api-reference.md)
- [String 扩展文档](./string-extensions.md)

### 示例代码

- [Quick Start 完整示例](https://github.com/devcodex-labs/schema-dsl/blob/main/examples/docs/quick-start.ts)

其余主题示例现在都已分别挂到各自文档底部，并统一切到稳定 GitHub 示例链接。

<a id="database-export"></a>

### 高级功能

- [自定义验证器](./api-reference.md#customvalidator)
- [条件验证](./conditional-api.md)
- [数据库Schema导出](./api-reference.md#导出器)

---

## 入口选择

普通业务代码默认使用 `schema-dsl/pure`。它提供同一套 schema 编写能力，但不会在导入时安装全局 String 方法。

框架、多租户、插件宿主或测试隔离场景使用 `schema-dsl/runtime`：

```javascript
import { createRuntime } from 'schema-dsl/runtime';

const runtime = createRuntime();
const schema = runtime.s({
  email: 'email!',
  username: runtime.s('string:3-32!').label('用户名')
});
```

如果你确实想写 `'email!'.label('邮箱')` 这样的直接字符串链式源码，请查看 [String 扩展](./string-extensions.md) 和编译期 transform；需要零运行时原型修改时优先使用编译期转换。

设计背景和性能数据请继续阅读 [设计理念](./design-philosophy.md) 与 [性能指南](./performance-guide.md)。

---

## 🆘 常见问题

### Q: String扩展和纯DSL有什么区别？

**A**: 
- **纯DSL**: 适合简单字段，语法简洁
- **`s('...')` 链式 API**: 适合复杂字段，不依赖全局原型修改
- **`s.xxx()` factory**: 适合需要完整 TypeScript 方法发现的字段
- **String 扩展**: 适合有意启用直接字符串链式写法的项目

```javascript
// 纯DSL（简单）
name: 'string:1-50!'

// s() 链式 API（复杂，推荐）
email: s('email!')
  .pattern(/custom/)
  .messages({...})

// String 扩展（显式启用）
import 'schema-dsl/register-string';
import { s } from 'schema-dsl/pure';

const schemaWithStringExtension = s({
  email: 'email!'.pattern(/custom/).messages({...})
});
```

### Q: 如何显式启用 String 扩展？

**A**: 
```javascript
import 'schema-dsl/register-string';
import { s } from 'schema-dsl/pure';

const schema = s({
  email: 'email!'.label('邮箱')
});
```

测试清理或兼容细节见 [String 扩展](./string-extensions.md)。

### Q: 支持TypeScript吗？

**A**: 支持！schema-dsl 提供完整的 TypeScript 类型定义。

---

## 🎉 恭喜！

你已经掌握了 schema-dsl 的核心用法！

**核心要点**:
1. ✅ DSL语法简洁直观
2. ✅ `schema-dsl/pure` + `s` 是普通业务代码的推荐默认入口
3. ✅ `s('...')` 适合显式 DSL 种子 + builder 提示
4. ✅ `s.xxx()` factory 提供最完整的方法发现

**开始使用**: `npm install schema-dsl`

---

## 对应示例文件

**示例入口**: [quick-start.ts](https://github.com/devcodex-labs/schema-dsl/blob/main/examples/docs/quick-start.ts)  
**说明**: 覆盖快速上手中的 Hello World、`schema-dsl/pure` + `s` 编写路径、用户注册示例，以及 `validate()` 与 `Validator.compile()` 的基础复用路径，可直接运行参考。

---

