# Agent Web Portal (AWP) 开发指南

> 本文档面向人类开发者和 Coding Agent，介绍如何开发和扩展 AWP。

## 1. 概念介绍

### 1.1 什么是 AWP？

Agent Web Portal (AWP) 是一个**场景导向、MCP 兼容**的框架，用于将网站功能暴露给 AI Agent。

**核心公式：**

```
AWP = Controller + Skills + Tools
```

- **Controller**: AgentWebPortal 实例，负责协调 Tools 和 Skills
- **Tools**: 原子化的功能单元，带有 Zod 输入/输出验证
- **Skills**: 场景化的能力描述（Markdown 文档），告诉 Agent 如何组合使用 Tools 完成特定任务

### 1.2 设计理念

AWP 采用"场景优先"的设计理念：

1. **Skills 定义场景**：每个 Skill 是一份 Markdown 文档，描述一个具体使用场景
2. **Tools 提供能力**：Tools 是底层的 API，由 Skills 引用
3. **Agent 按需执行**：Agent 根据 Skill 描述选择合适的 Tools 执行

```
┌─────────────────────────────────────────────────────────┐
│                   Agent Web Portal                       │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   Tools     │  │   Skills    │  │  HTTP Handler   │  │
│  │  Registry   │  │  Registry   │  │  (MCP + AWP)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                    MCP Protocol Layer                    │
│  • initialize    • tools/list    • tools/call           │
│  • skills/list (AWP extension)                          │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 相对于 MCP 的增强

AWP 完全兼容 MCP 协议，同时提供以下增强功能：

### 2.1 Skills 概念 (AWP Extension)

MCP 只定义了 Tools，而 AWP 新增了 Skills 层：

| 特性 | MCP | AWP |
|------|-----|-----|
| Tools | ✅ | ✅ |
| Skills | ❌ | ✅ |
| Resources | ✅ | ⏳ 暂不支持 |
| Prompts | ✅ | ⏳ 暂不支持 |

**Skills 的价值**：

- 提供使用场景的上下文
- 定义允许使用的 Tools 列表 (`allowed-tools`)
- 支持跨 MCP 服务器引用 (`mcp_alias:tool_name`)

### 2.2 Blob 交换机制

AWP 提供基于预签名 URL 的二进制数据交换机制：

```
Client                         AWP Server                    Storage (S3)
  │                                │                              │
  │  1. tools/call + _blobContext  │                              │
  │  ─────────────────────────────>│                              │
  │  (含预签名 GET/PUT URL)        │                              │
  │                                │                              │
  │                                │  2. fetch input blob         │
  │                                │  ────────────────────────────>│
  │                                │  <────────────────────────────│
  │                                │                              │
  │                                │  3. PUT output blob          │
  │                                │  ────────────────────────────>│
  │                                │                              │
  │  4. result (含 output URI)     │                              │
  │  <─────────────────────────────│                              │
```

### 2.3 Auth 协商机制

AWP 提供灵活的认证机制，支持：

- **OAuth 2.0** (RFC 9728 Protected Resource Metadata)
- **HMAC Signature** (适用于微服务间通信)
- **API Key** (简单静态密钥)

401 响应会返回所有支持的认证方案，让 Client 选择：

```json
{
  "error": "unauthorized",
  "error_description": "Authentication required",
  "supported_schemes": [
    { "scheme": "oauth2", "resource_metadata_url": "/.well-known/oauth-protected-resource" },
    { "scheme": "api_key", "header": "X-API-Key" }
  ]
}
```

### 2.4 暂不支持的 MCP 功能

以下 MCP 功能暂时不支持，后续版本会逐步添加：

- **Resources**: 资源暴露机制
- **Prompts**: 提示模板

---

## 3. 主要 Packages

### 3.1 `@agent-web-portal/core`

核心包，提供：

- `createAgentWebPortal()` - 创建 Portal Builder
- `registerTool()` - 注册 Tool
- `registerSkills()` - 注册 Skills
- `defineTool()` / `blob()` - 高级 Tool 定义 (带 blob 支持)
- HTTP Handler (MCP 协议实现)

```bash
bun add @agent-web-portal/core
```

### 3.2 `@agent-web-portal/auth`

认证中间件包，提供：

- `createAuthMiddleware()` - 创建认证中间件
- OAuth 2.0 / HMAC / API Key 验证
- `/.well-known/oauth-protected-resource` 端点

```bash
bun add @agent-web-portal/auth
```

### 3.3 `@agent-web-portal/client`

客户端 SDK，提供：

- `AwpClient` - AWP 客户端类
- 自动 blob 处理 (预签名 URL 生成)
- Storage Provider 抽象 (S3 等)

```bash
bun add @agent-web-portal/client
```

### 3.4 `@agent-web-portal/aws-lambda`

AWS Lambda 运行时适配器：

- Lambda Handler 工厂
- API Gateway 集成

```bash
bun add @agent-web-portal/aws-lambda
```

### 3.5 `@agent-web-portal/aws-cli`

CLI 工具，用于：

- 解析 SKILL.md 文件
- 部署 Skills 到云端

```bash
bun add -D @agent-web-portal/aws-cli
```

---

## 4. 声明 Tool 的方法

### 4.1 基础方法：`registerTool()`

适用于简单的 Tool，没有二进制数据交换需求：

```typescript
import { createAgentWebPortal } from "@agent-web-portal/core";
import { z } from "zod";

const portal = createAgentWebPortal({ name: "my-portal" })
  .registerTool("greet", {
    // 输入 Schema (Zod)
    inputSchema: z.object({
      name: z.string().describe("The name of the person to greet"),
      language: z.enum(["en", "zh", "ja"]).optional().default("en"),
    }),
    // 输出 Schema (Zod)
    outputSchema: z.object({
      message: z.string(),
      timestamp: z.string(),
    }),
    // 描述 (可选，用于 tools/list)
    description: "Generate a greeting message",
    // Handler
    handler: async ({ name, language }) => {
      const greetings = { en: "Hello", zh: "你好", ja: "こんにちは" };
      return {
        message: `${greetings[language]}, ${name}!`,
        timestamp: new Date().toISOString(),
      };
    },
  })
  .build();
```

**关键点**：

- 使用 Zod 定义输入输出 Schema
- Handler 接收经过验证的输入，返回值会被验证
- 输出 Schema 用于本地验证，不会暴露给 MCP Client (遵循 MCP 规范)

### 4.2 高级方法：`defineTool()` (带 Blob 支持)

适用于需要处理二进制数据 (图片、PDF 等) 的 Tool：

```typescript
import { defineTool, blob } from "@agent-web-portal/core";
import { z } from "zod";

const processDocument = defineTool({
  name: "process-document",
  description: "Process a PDF document and generate a thumbnail",

  // 输入定义：使用 blob() 标记二进制字段
  input: {
    document: blob({ mimeType: "application/pdf", maxSize: 10 * 1024 * 1024 }),
    options: z.object({
      quality: z.number().min(1).max(100),
    }),
  },

  // 输出定义：使用 blob() 标记输出的二进制字段
  output: {
    thumbnail: blob({ mimeType: "image/png" }),
    metadata: z.object({
      pageCount: z.number(),
      title: z.string().optional(),
    }),
  },

  // Handler：blob 字段通过 context 访问
  handler: async (args, context) => {
    // args 只包含非 blob 字段 (options)
    // context.blobs.input.document 是预签名 GET URL
    // context.blobs.output.thumbnail 是预签名 PUT URL

    // 1. 读取输入 blob
    const pdfResponse = await fetch(context.blobs.input.document);
    const pdfData = await pdfResponse.arrayBuffer();

    // 2. 处理文档...
    const { thumbnail, pageCount, title } = await processPdf(pdfData, args.options.quality);

    // 3. 写入输出 blob
    await fetch(context.blobs.output.thumbnail, {
      method: "PUT",
      body: thumbnail,
      headers: { "Content-Type": "image/png" },
    });

    // 4. 返回非 blob 字段 (blob 字段由框架自动填充 URI)
    return {
      metadata: { pageCount, title },
    };
  },
});

// 注册到 Portal (需要使用 registerDefinedTool，但目前通过解构注册)
portal.registerTool(processDocument.name, {
  inputSchema: processDocument.inputSchema,
  outputSchema: processDocument.outputSchema,
  handler: processDocument.handler,
  description: processDocument.description,
});
```

**Blob 处理流程**：

1. Client SDK 识别 blob 字段，生成预签名 URL
2. 预签名 URL 通过 `_blobContext` 传递给 Server
3. Handler 通过 `context.blobs` 访问预签名 URL
4. 框架自动将 `outputUri` 填入返回结果的 blob 字段

### 4.3 `blob()` 函数详解

```typescript
import { blob } from "@agent-web-portal/core";

// 基础用法
const imageField = blob();

// 带 MIME 类型约束
const pdfField = blob({ mimeType: "application/pdf" });

// 带大小限制
const avatarField = blob({
  mimeType: "image/png",
  maxSize: 5 * 1024 * 1024, // 5MB
  description: "User avatar image",
});
```

---

## 5. 声明 Skills 的方法

### 5.1 代码中注册 Skills

使用 `registerSkills()` 批量注册：

```typescript
portal.registerSkills({
  "greeting-assistant": {
    // Skill 内容的 URL (Agent 会请求这个 URL 获取 Markdown)
    url: "/skills/greeting-assistant.md",
    // Frontmatter 元数据
    frontmatter: {
      name: "Greeting Assistant",
      description: "A skill for greeting users in multiple languages",
      version: "1.0.0",
      "allowed-tools": ["greet"],
    },
  },
  "shopping-assistant": {
    url: "/skills/shopping-assistant.md",
    frontmatter: {
      name: "Shopping Assistant",
      description: "Complete e-commerce shopping flow",
      version: "2.0.0",
      "allowed-tools": [
        "search_products",
        "manage_cart",
        "checkout",
        "external_reviews:get_reviews", // 跨 MCP 引用
      ],
      // 定义跨 MCP 服务器的 URL
      "mcp-servers": {
        external_reviews: "https://reviews-api.example.com/mcp",
      },
    },
  },
});
```

### 5.2 SKILL.md 文件格式

Skills 以 Markdown 文件形式存储，使用 YAML Frontmatter：

```markdown
---
name: Statistics Calculator
description: Perform statistical calculations on record lists using JSONata
version: 1.0.0
allowed-tools:
  - jsonata_eval
---

# Statistics Calculator Skill

This skill uses the `jsonata_eval` tool to perform statistical calculations.

## Usage Examples

### Example 1: Basic Aggregations

Calculate sum, average, min, max, and count for a list of numbers:

\`\`\`json
{
  "expression": "{ 'sum': $sum(values), 'average': $average(values) }",
  "input": {
    "values": [10, 20, 30, 40, 50]
  }
}
\`\`\`

**Result:**
\`\`\`json
{
  "sum": 150,
  "average": 30
}
\`\`\`

## Tips

1. Use `$lookup()` for safe property access
2. Use `$reduce()` to process sequences
```

### 5.3 Frontmatter 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | ❌ | Skill 的人类可读名称 |
| `description` | `string` | ❌ | Skill 的描述 |
| `version` | `string` | ❌ | Skill 版本号 |
| `allowed-tools` | `string[]` | ❌ | 允许使用的 Tool 列表 |
| `mcp-servers` | `Record<string, string>` | ❌ | 跨 MCP 服务器的别名到 URL 映射 |

---

## 6. Skill 定义方式的调整

### 6.1 Tool 引用格式

Skills 支持两种 Tool 引用格式：

```yaml
allowed-tools:
  # 本地 Tool (同一个 AWP 实例)
  - search_products
  - manage_cart
  
  # 跨 MCP 引用 (其他 MCP 服务器)
  - external_reviews:get_reviews
  - payment_service:process_payment

# 定义跨 MCP 服务器的 URL
mcp-servers:
  external_reviews: https://reviews-api.example.com/mcp
  payment_service: https://payment.example.com/mcp
```

**格式规则**：

- **本地 Tool**: `tool_name`
- **跨 MCP Tool**: `mcp_alias:tool_name`
- **MCP Server URL**: 在 `mcp-servers` 中定义 `mcp_alias` 到 URL 的映射

### 6.2 构建时验证

调用 `build()` 时，AWP 会验证所有 Skills：

- **本地 Tool**: 必须已注册，否则抛出 `SkillValidationError`
- **跨 MCP Tool**: 不验证 (运行时由 Agent 调度)

```typescript
try {
  const portal = builder.build();
} catch (error) {
  if (error instanceof SkillValidationError) {
    console.error("Missing tools:", error.message);
    // 输出: Skill "shopping-assistant" references missing tools: checkout
  }
}
```

### 6.3 在 Markdown 中引用 Tool

在 Skill 的 Markdown 内容中，可以使用 `{{tool_name}}` 语法引用 Tool：

```markdown
## How to Search

Use the {{search_products}} tool to find items.

For reviews, use {{external_reviews:get_reviews}}.
```

框架提供了工具来解析和重写这些引用：

```typescript
import { SkillRegistry } from "@agent-web-portal/core";

const registry = new SkillRegistry();

// 提取引用
const refs = registry.extractToolReferences(markdown);
// [{ original: "search_products", toolName: "search_products", isCrossMcp: false }, ...]

// 重写引用
const rewritten = registry.rewriteToolReferences(markdown, new Map([
  ["external_reviews:get_reviews", "local_reviews"],
]));
```

---

## 7. Auth 协商机制

### 7.1 支持的认证方式

#### OAuth 2.0 (推荐用于公开 API)

```typescript
import { createAuthMiddleware } from "@agent-web-portal/auth";

const auth = createAuthMiddleware({
  schemes: [
    {
      type: "oauth2",
      resourceMetadata: {
        resource: "https://api.example.com",
        authorization_servers: ["https://auth.example.com"],
        scopes_supported: ["read", "write"],
      },
      validateToken: async (token) => {
        // 验证 JWT token
        const claims = await verifyJwt(token);
        return { valid: true, claims };
      },
    },
  ],
});
```

#### HMAC Signature (适用于微服务)

```typescript
{
  type: "hmac",
  secret: process.env.HMAC_SECRET,
  // 或使用密钥查找函数
  secret: async (keyId) => {
    return await getSecretForService(keyId);
  },
  algorithm: "sha256",
  signatureHeader: "X-AWP-Signature",
  keyIdHeader: "X-AWP-Key-Id",
  timestampHeader: "X-AWP-Timestamp",
  maxClockSkew: 300, // 5 分钟
}
```

#### API Key (简单场景)

```typescript
{
  type: "api_key",
  header: "X-API-Key",
  validateKey: async (key) => {
    const user = await db.findUserByApiKey(key);
    if (user) {
      return { valid: true, metadata: { userId: user.id } };
    }
    return { valid: false, error: "Invalid API key" };
  },
}
```

### 7.2 401 Challenge Response

当认证失败时，AWP 返回包含所有支持方案的 401 响应：

**HTTP Headers**:

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="mcp", resource_metadata="/.well-known/oauth-protected-resource"
WWW-Authenticate: AWP-HMAC realm="mcp", algorithm="sha256"
WWW-Authenticate: AWP-API-Key realm="mcp", header="X-API-Key"
Content-Type: application/json
```

**Response Body**:

```json
{
  "error": "unauthorized",
  "error_description": "Authentication required",
  "supported_schemes": [
    {
      "scheme": "oauth2",
      "resource_metadata_url": "/.well-known/oauth-protected-resource"
    },
    {
      "scheme": "hmac",
      "algorithm": "sha256",
      "signature_header": "X-AWP-Signature",
      "key_id_header": "X-AWP-Key-Id",
      "timestamp_header": "X-AWP-Timestamp"
    },
    {
      "scheme": "api_key",
      "header": "X-API-Key"
    }
  ]
}
```

### 7.3 OAuth Protected Resource Metadata (RFC 9728)

AWP 自动暴露 `/.well-known/oauth-protected-resource` 端点：

```json
{
  "resource": "https://api.example.com",
  "authorization_servers": ["https://auth.example.com"],
  "scopes_supported": ["read", "write"],
  "bearer_methods_supported": ["header"],
  "resource_name": "My API",
  "resource_description": "Description of my API"
}
```

### 7.4 完整的 Auth Portal 示例

以下是一个完整的带认证的 Portal 实现示例：

```typescript
import { createAgentWebPortal } from "@agent-web-portal/core";
import {
  type AuthConfig,
  type AuthHttpRequest,
  createAuthMiddleware,
  handleWellKnown,
  WELL_KNOWN_PATHS,
} from "@agent-web-portal/auth";
import { z } from "zod";

// 定义认证配置
const authConfig: AuthConfig = {
  schemes: [
    {
      type: "oauth2",
      resourceMetadata: {
        resource: "https://api.example.com/auth",
        authorization_servers: ["https://auth.example.com"],
        scopes_supported: ["read", "write", "admin"],
        bearer_methods_supported: ["header"],
        resource_name: "Auth-Protected Portal",
      },
      validateToken: async (token) => {
        // 验证 Bearer token
        if (token === "valid-token") {
          return { valid: true, claims: { sub: "user-123" } };
        }
        return { valid: false, error: "Invalid token" };
      },
    },
    {
      type: "api_key",
      header: "X-API-Key",
      validateKey: async (key) => {
        if (key === "secret-api-key") {
          return { valid: true, metadata: { apiKeyId: "key-1" } };
        }
        return { valid: false, error: "Invalid API key" };
      },
    },
  ],
  excludePaths: ["/health", "/.well-known/"],
};

// 创建认证中间件
const authMiddleware = createAuthMiddleware(authConfig);

// 创建 Portal
const authPortal = createAgentWebPortal({
  name: "auth-portal",
  version: "1.0.0",
})
  .registerTool("secure_greet", {
    inputSchema: z.object({ name: z.string() }),
    outputSchema: z.object({ message: z.string(), authenticatedAs: z.string() }),
    description: "A greeting that requires authentication",
    handler: async ({ name }) => ({
      message: `Hello, ${name}! (Authenticated)`,
      authenticatedAs: "user-123",
    }),
  })
  .build();

// HTTP 处理函数
async function handleAuthPortal(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const authReq = req as unknown as AuthHttpRequest;

  // 处理 well-known 端点 (不需要认证)
  if (url.pathname.includes("/.well-known/")) {
    const modifiedUrl = new URL(req.url);
    modifiedUrl.pathname = WELL_KNOWN_PATHS.OAUTH_PROTECTED_RESOURCE;
    const modifiedReq = { ...authReq, url: modifiedUrl.toString() };
    const wellKnownResponse = handleWellKnown(modifiedReq, authConfig);
    if (wellKnownResponse) {
      return wellKnownResponse;
    }
  }

  // 执行认证
  const authResult = await authMiddleware(authReq);
  if (!authResult.authorized) {
    return authResult.challengeResponse!;
  }

  // 认证成功，处理请求
  return authPortal.handleRequest(req);
}

// 启动服务器
Bun.serve({
  port: 3000,
  fetch: handleAuthPortal,
});
```

### 7.5 认证测试

E2E 测试覆盖以下场景：

1. **Well-Known 端点测试**：
   - 返回正确的 Protected Resource Metadata
   - 包含正确的 Cache-Control 头

2. **401 Challenge 响应测试**：
   - 未认证请求返回 401
   - 响应包含 WWW-Authenticate 头
   - 响应体包含 supported_schemes

3. **认证成功测试**：
   - Bearer token 认证
   - API Key 认证
   - 认证后成功调用 Tool

4. **路径排除测试**：
   - well-known 端点不需要认证
   - health 端点不需要认证

---

## 8. Blob 交换机制

### 8.1 概述

Blob 机制解决了以下问题：

- LLM 无法直接处理二进制数据
- 大文件不应内联在 JSON 中传输
- 需要访问控制和安全存储

### 8.2 BlobContext 结构

```typescript
interface BlobContext {
  /** 输入 blob 的预签名 GET URL */
  input: Record<string, string>;
  /** 输出 blob 的预签名 PUT URL */
  output: Record<string, string>;
  /** 输出 blob 的永久 URI (如 s3://bucket/key) */
  outputUri: Record<string, string>;
}
```

### 8.3 完整流程

```
1. Client 调用 tools/call，附带 _blobContext
   {
     "method": "tools/call",
     "params": {
       "name": "process-document",
       "arguments": {
         "document": "s3://my-bucket/input/doc.pdf",
         "options": { "quality": 80 }
       },
       "_blobContext": {
         "input": {
           "document": "https://s3.../doc.pdf?X-Amz-Signature=..."
         },
         "output": {
           "thumbnail": "https://s3.../thumb.png?X-Amz-Signature=..."
         },
         "outputUri": {
           "thumbnail": "s3://my-bucket/output/thumb.png"
         }
       }
     }
   }

2. Server Handler 通过 context.blobs 访问预签名 URL

3. Handler 读取输入、写入输出

4. Server 返回结果，自动填充 outputUri
   {
     "thumbnail": "s3://my-bucket/output/thumb.png",
     "metadata": { "pageCount": 10 }
   }
```

### 8.4 Client SDK 使用

```typescript
import { AwpClient } from "@agent-web-portal/client";
import { S3StorageProvider } from "@agent-web-portal/client/storage";

const client = new AwpClient({
  endpoint: "https://my-awp-server.com/mcp",
  storage: new S3StorageProvider({
    region: "us-east-1",
    bucket: "my-bucket",
  }),
  outputPrefix: "output",
});

// 调用带 blob 的 Tool
const result = await client.callTool("process-document", {
  document: "s3://my-bucket/input/doc.pdf",
  options: { quality: 80 },
});

console.log(result.data.thumbnail); // "s3://my-bucket/output/thumb.png"
console.log(result.data.metadata);  // { pageCount: 10 }
```

### 8.5 JSON Schema 中的 Blob 标记

AWP 使用 `x-awp-blob` 扩展标记 blob 字段：

```json
{
  "type": "object",
  "properties": {
    "document": {
      "type": "string",
      "x-awp-blob": {
        "mimeType": "application/pdf",
        "maxSize": 10485760
      }
    },
    "options": {
      "type": "object",
      "properties": {
        "quality": { "type": "number" }
      }
    }
  }
}
```

Client SDK 通过识别 `x-awp-blob` 来自动生成预签名 URL。

---

## 9. 快速开始示例

### 9.1 最简示例

```typescript
import { createAgentWebPortal } from "@agent-web-portal/core";
import { z } from "zod";

const portal = createAgentWebPortal({ name: "hello-world" })
  .registerTool("hello", {
    inputSchema: z.object({ name: z.string() }),
    outputSchema: z.object({ message: z.string() }),
    handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
  })
  .registerSkills({
    "hello-skill": {
      url: "/skills/hello.md",
      frontmatter: { "allowed-tools": ["hello"] },
    },
  })
  .build();

Bun.serve({
  port: 3000,
  fetch: (req) => portal.handleRequest(req),
});
```

### 9.2 带认证的示例

```typescript
import { createAgentWebPortal } from "@agent-web-portal/core";
import { createAuthMiddleware } from "@agent-web-portal/auth";

const auth = createAuthMiddleware({
  schemes: [
    {
      type: "api_key",
      validateKey: async (key) => ({
        valid: key === process.env.API_KEY,
      }),
    },
  ],
});

const portal = createAgentWebPortal({ name: "secure-portal" })
  // ... register tools and skills
  .build();

Bun.serve({
  port: 3000,
  fetch: async (req) => {
    const authResult = await auth(req);
    if (!authResult.authorized) {
      return authResult.challengeResponse!;
    }
    return portal.handleRequest(req);
  },
});
```

---

## 10. 开发命令

```bash
# 安装依赖
bun install --no-cache

# 运行测试
bun test

# 运行示例
bun run packages/examples/basic.ts
bun run packages/examples/advanced.ts

# 构建所有包
bun run build

# 类型检查
bun run typecheck

# 代码格式化
bun run format
```

---

## 11. 常见问题

### Q: AWP 和 MCP 的关系是什么？

A: AWP 是 MCP 的超集。AWP 实现了 MCP 协议的所有 Tool 相关端点
(`initialize`, `tools/list`, `tools/call`)，同时新增了 Skills 层 (`skills/list`)。
任何 MCP Client 都可以与 AWP Server 通信。

### Q: 为什么需要 Skills？

A: Tools 是原子操作，而 Skills 提供场景上下文。Agent 可以先读取 Skill 描述，了解如何组合多个 Tools 完成复杂任务。

### Q: Blob 字段在 Handler 中如何访问？

A: Blob 字段不会出现在 `args` 中，而是通过 `context.blobs.input[fieldName]` (预签名 GET URL) 访问。
输出 blob 通过 `context.blobs.output[fieldName]` (预签名 PUT URL) 写入。

### Q: 如何处理跨 MCP 的 Tool 引用？

A: 使用 `mcp_alias:tool_name` 格式引用工具，并在 `mcp-servers` 中定义对应的 URL。
例如：`external_reviews:get_reviews` 需要配合 `mcp-servers: { external_reviews: "https://..." }`。
AWP 不验证这些引用，它们由 Agent 在运行时根据 URL 调度。

---

## 参与贡献

欢迎提交 Issue 和 Pull Request！
