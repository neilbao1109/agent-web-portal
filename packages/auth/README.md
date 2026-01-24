# @agent-web-portal/auth

Agent Web Portal 认证中间件，支持 OAuth 2.1、HMAC 签名和 API Key 认证。

## 概述

`@agent-web-portal/auth` 提供灵活的认证机制：

- **OAuth 2.0** - RFC 9728 Protected Resource Metadata 支持
- **HMAC Signature** - 适用于微服务间安全通信
- **API Key** - 简单的静态密钥认证
- **401 Challenge** - 自动返回支持的认证方案

## 安装

```bash
bun add @agent-web-portal/auth
```

## 快速开始

```typescript
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

// 在请求处理中使用
Bun.serve({
  port: 3000,
  fetch: async (req) => {
    const result = await auth(req);
    if (!result.authorized) {
      return result.challengeResponse!;
    }
    return portal.handleRequest(req);
  },
});
```

## 认证方案

### OAuth 2.0

```typescript
{
  type: "oauth2",
  resourceMetadata: {
    resource: "https://api.example.com/mcp",
    authorization_servers: ["https://auth.example.com"],
    scopes_supported: ["read", "write"],
  },
  validateToken: async (token) => {
    const claims = await verifyJwt(token);
    return { valid: true, claims };
  },
}
```

自动暴露 `/.well-known/oauth-protected-resource` 端点。

### HMAC Signature

```typescript
{
  type: "hmac",
  secret: process.env.HMAC_SECRET,
  // 或使用密钥查找函数
  secret: async (keyId) => await getSecretForService(keyId),
  algorithm: "sha256",        // 默认
  signatureHeader: "X-AWP-Signature",
  keyIdHeader: "X-AWP-Key-Id",
  timestampHeader: "X-AWP-Timestamp",
  maxClockSkew: 300,          // 5 分钟
}
```

### API Key

```typescript
{
  type: "api_key",
  header: "X-API-Key",        // 默认
  validateKey: async (key) => {
    const user = await db.findByApiKey(key);
    return user
      ? { valid: true, metadata: { userId: user.id } }
      : { valid: false, error: "Invalid key" };
  },
}
```

## 401 Challenge Response

当认证失败时，返回包含所有支持方案的 401 响应：

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

## Well-Known 端点

```typescript
import { handleWellKnown, WELL_KNOWN_PATHS } from "@agent-web-portal/auth";

// 在路由中处理
if (url.pathname.includes("/.well-known/")) {
  // 适配路径（如果使用前缀路由）
  const modifiedUrl = new URL(req.url);
  modifiedUrl.pathname = WELL_KNOWN_PATHS.OAUTH_PROTECTED_RESOURCE;
  const modifiedReq = { ...req, url: modifiedUrl.toString() };
  
  const wellKnownResponse = handleWellKnown(modifiedReq, config);
  if (wellKnownResponse) {
    return wellKnownResponse;
  }
}
```

## 完整集成示例

```typescript
import { createAgentWebPortal } from "@agent-web-portal/core";
import {
  type AuthConfig,
  type AuthHttpRequest,
  createAuthMiddleware,
  handleWellKnown,
  WELL_KNOWN_PATHS,
} from "@agent-web-portal/auth";

// 配置认证
const authConfig: AuthConfig = {
  schemes: [
    {
      type: "oauth2",
      resourceMetadata: {
        resource: "https://api.example.com/mcp",
        authorization_servers: ["https://auth.example.com"],
        scopes_supported: ["read", "write"],
      },
      validateToken: async (token) => {
        // 验证 JWT 或调用 Auth Server
        const isValid = await verifyToken(token);
        return isValid
          ? { valid: true, claims: { sub: "user-id" } }
          : { valid: false, error: "Invalid token" };
      },
    },
    {
      type: "api_key",
      header: "X-API-Key",
      validateKey: async (key) => {
        const user = await db.findUserByApiKey(key);
        return user
          ? { valid: true, metadata: { userId: user.id } }
          : { valid: false, error: "Invalid API key" };
      },
    },
  ],
  excludePaths: ["/health", "/.well-known/"],
};

const authMiddleware = createAuthMiddleware(authConfig);

// 创建 Portal
const portal = createAgentWebPortal({ name: "secure-portal" })
  .registerTool("secure_action", { /* ... */ })
  .build();

// HTTP 处理
Bun.serve({
  port: 3000,
  fetch: async (req) => {
    const url = new URL(req.url);
    const authReq = req as unknown as AuthHttpRequest;

    // 1. 处理 well-known 端点
    if (url.pathname.includes("/.well-known/")) {
      const modifiedUrl = new URL(req.url);
      modifiedUrl.pathname = WELL_KNOWN_PATHS.OAUTH_PROTECTED_RESOURCE;
      const modifiedReq = { ...authReq, url: modifiedUrl.toString() };
      const wellKnownResponse = handleWellKnown(modifiedReq, authConfig);
      if (wellKnownResponse) return wellKnownResponse;
    }

    // 2. 执行认证
    const authResult = await authMiddleware(authReq);
    if (!authResult.authorized) {
      return authResult.challengeResponse!;
    }

    // 3. 处理 Portal 请求
    return portal.handleRequest(req);
  },
});
```

## API

### `createAuthMiddleware(config)`

创建认证中间件。

### `handleWellKnown(request, config)`

处理 well-known 端点请求。

### `hasAuthCredentials(request, config)`

检查请求是否包含认证凭据。

## 测试

E2E 测试位于 `packages/examples/e2e.test.ts`，覆盖：

- **Well-Known 端点**：Protected Resource Metadata 返回
- **401 Challenge**：未认证请求的响应格式
- **认证流程**：Bearer token 和 API Key 验证
- **路径排除**：well-known 和 health 端点不需要认证

运行测试：

```bash
bun test packages/examples/e2e.test.ts
```

## 类型导出

- `AuthConfig` - 认证配置
- `AuthScheme` - 认证方案联合类型
- `AuthResult` - 认证结果
- `AuthContext` - 认证上下文
- `ProtectedResourceMetadata` - OAuth 资源元数据
- `AuthHttpRequest` - HTTP 请求接口
- `WELL_KNOWN_PATHS` - Well-known 端点路径常量

## License

MIT
