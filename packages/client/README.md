# @agent-web-portal/client

Agent Web Portal 客户端 SDK，提供自动 Blob 处理、预签名 URL 管理和基于密钥对的认证支持。

## 概述

`@agent-web-portal/client` 提供：

- **AwpClient** - 高级客户端类
- **Blob 自动处理** - 自动生成预签名 URL
- **Storage Provider** - 抽象存储接口 (支持 S3)
- **AwpAuth** - 基于 ECDSA P-256 密钥对的认证

## 安装

```bash
bun add @agent-web-portal/client

# 如果使用 S3 存储
bun add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## 快速开始

```typescript
import { AwpClient, AwpAuth, FileKeyStorage, S3StorageProvider } from "@agent-web-portal/client";

// 创建认证处理器
const auth = new AwpAuth({
  clientName: "My AI Agent",
  keyStorage: new FileKeyStorage({ directory: "~/.awp/keys" }),
  callbacks: {
    onAuthRequired: async (challenge) => {
      console.log("请访问:", challenge.authUrl);
      console.log("验证码:", challenge.verificationCode);
      // 等待用户完成授权...
      return true;
    },
  },
});

const client = new AwpClient({
  endpoint: "https://my-awp-server.com/mcp",
  auth,
  storage: new S3StorageProvider({
    region: "us-east-1",
    bucket: "my-bucket",
  }),
});

// 调用 Tool
const result = await client.callTool("greet", { name: "World" });
console.log(result.output); // { message: "Hello, World!" }
console.log(result.blobs);  // {} (无 blob 输出)
```

## 认证机制

AWP 使用基于 ECDSA P-256 密钥对的认证方案，流程如下：

```
┌─────────────────────────────────────────────────────────────────┐
│                        认证流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 首次请求 → Server 返回 401 + auth_endpoint                   │
│                                                                  │
│  2. Client 生成密钥对 + 验证码                                   │
│     - 生成 ECDSA P-256 keypair                                   │
│     - 生成 32-byte 随机数 nonce                                  │
│     - 签名生成 8 位验证码                                        │
│                                                                  │
│  3. 引导用户访问 authUrl                                         │
│     authUrl = authEndpoint?pubkey=...&nonce=...&client=...      │
│                                                                  │
│  4. 用户在 Server 登录后输入验证码                               │
│     Server 验签成功 → 存储 pubkey + userId + TTL                 │
│                                                                  │
│  5. Client 后续请求签名                                          │
│     签名内容: timestamp.METHOD.path.bodyHash                     │
│     Headers: X-AWP-Pubkey, X-AWP-Timestamp, X-AWP-Signature     │
│                                                                  │
│  6. Server 验签 → 获取关联的 userId → 处理请求                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 基本用法

```typescript
import { AwpAuth, FileKeyStorage } from "@agent-web-portal/client";

const auth = new AwpAuth({
  clientName: "Claude Desktop",
  keyStorage: new FileKeyStorage({ directory: "~/.awp/keys" }),
  callbacks: {
    // 需要授权时调用
    onAuthRequired: async (challenge) => {
      console.log("请访问以下链接完成授权:");
      console.log(challenge.authUrl);
      console.log("验证码:", challenge.verificationCode);
      
      // 在 CLI 中可以等待用户确认
      const confirmed = await askUserConfirmation("授权完成后按回车继续...");
      return confirmed;
    },
    
    // 授权成功
    onAuthSuccess: () => {
      console.log("授权成功！");
    },
    
    // 授权失败
    onAuthFailed: (error) => {
      console.error("授权失败:", error.message);
    },
  },
});
```

### Key Storage 实现

提供三种开箱即用的存储实现：

```typescript
// 文件存储 (适用于 CLI/服务端)
import { FileKeyStorage } from "@agent-web-portal/client";
const storage = new FileKeyStorage({ directory: "~/.awp/keys" });

// 内存存储 (适用于测试)
import { MemoryKeyStorage } from "@agent-web-portal/client";
const storage = new MemoryKeyStorage();

// localStorage 存储 (适用于浏览器)
import { LocalStorageKeyStorage } from "@agent-web-portal/client";
const storage = new LocalStorageKeyStorage({ prefix: "awp-key:" });
```

### 密钥轮换

密钥可以在过期前自动或手动轮换，无需用户重新授权：

```typescript
// 手动轮换
await auth.rotateKey(endpoint, `${endpoint}/auth/rotate`);

// 自动轮换提醒 (通过回调)
const auth = new AwpAuth({
  // ...
  autoRotateDays: 7, // 剩余 7 天时提醒
  callbacks: {
    onKeyExpiring: (daysRemaining) => {
      console.log(`密钥将在 ${daysRemaining} 天后过期`);
      // 可以自动触发轮换
    },
  },
});
```

## Blob 处理

客户端自动处理 Blob 字段，将复杂的 presigned URL 管理对调用方透明化：

### 输入/输出格式转换

假设有一个 Tool，其服务端定义如下：
- **输入**: `{ foo: string, bar: string }` 其中 `foo` 是 input blob，`bar` 是 output blob
- **输出**: `{ xyz: number }`

客户端会进行如下转换：

**调用方看到的接口**：
```typescript
// listTools() 返回的 inputSchema 不包含 output blob 字段
const { tools } = await client.listTools();
// tools[0].inputSchema = { foo: string }  // bar 被移除了
// tools[0].inputBlobFields = ['foo']      // 标记 foo 需要 s3:// URI
// tools[0].outputBlobFields = ['bar']     // 标记 bar 会出现在 result.blobs 中

// 调用时只需提供 input blob 字段
const result = await client.callTool("process-image", {
  foo: "s3://my-bucket/input/image.png",  // Input blob (s3:// URI)
});

// 结果分为 output 和 blobs 两部分
console.log(result.output); // { xyz: 123 }
console.log(result.blobs);  // { bar: "s3://my-bucket/output/bar-xxx.png" }
```

**客户端内部传给 AWP Tool 的内容**：
```typescript
// 客户端自动添加 output blob 的 presigned URL
{
  foo: "https://...presigned-get-url...",  // Input blob -> presigned GET URL
  bar: "https://...presigned-put-url...",  // Output blob -> presigned PUT URL (自动生成)
}
```

### 使用示例

```typescript
// 创建支持 Blob 的客户端
const client = new AwpClient({
  endpoint: "https://my-awp-server.com/mcp",
  storage: new S3StorageProvider({
    region: "us-east-1",
    bucket: "my-bucket",
  }),
});

// 调用带 Blob 的 Tool
const result = await client.callTool("process-document", {
  document: "s3://my-bucket/input/doc.pdf",  // 输入 Blob URI
  options: { quality: 80 },
});

// 结果自动分离
console.log(result.output.metadata);  // { pageCount: 10 }
console.log(result.blobs.thumbnail);  // "s3://my-bucket/output/thumb.png"
```

## API

### `AwpClient`

```typescript
const client = new AwpClient({
  endpoint: string,           // AWP 服务器 URL
  auth?: AwpAuth,             // 认证处理器 (可选)
  storage?: StorageProvider,  // 存储提供者 (Blob 处理时需要)
  outputPrefix?: string,      // 输出 Blob 前缀
  headers?: Record<string, string>,  // 自定义请求头
  fetch?: typeof fetch,       // 自定义 fetch 函数
});

// 方法
await client.initialize();                    // 初始化连接
await client.listTools();                     // 列出所有 Tools (output blob 已从 inputSchema 移除)
await client.listToolsRaw();                  // 列出原始 Tools (服务端返回的格式)
await client.callTool(name, args, schema?);   // 调用 Tool，返回 { output, blobs, isError }
await client.getToolBlobSchema(name);         // 获取 Tool 的 Blob Schema
client.setToolBlobSchema(name, schema);       // 设置 Tool 的 Blob Schema
```

### `ToolCallResult`

```typescript
interface ToolCallResult<TOutput, TBlobs> {
  output: TOutput;            // 非 Blob 输出字段
  blobs: TBlobs;              // Blob 输出字段 (s3:// URIs)
  isError?: boolean;          // 是否出错
}
```

### `AwpToolSchema`

```typescript
interface AwpToolSchema {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;  // Output blob 字段已移除
  inputBlobFields: string[];             // Input blob 字段名
  outputBlobFields: string[];            // Output blob 字段名
}
```

### `AwpAuth`

```typescript
const auth = new AwpAuth({
  clientName: string,         // 客户端名称 (授权时显示)
  keyStorage: KeyStorage,     // 密钥存储实现
  callbacks?: AuthCallbacks,  // 事件回调
  autoRotateDays?: number,    // 自动轮换提醒天数 (默认 7)
});

// 方法
await auth.hasValidKey(endpoint);             // 是否有有效密钥
await auth.sign(endpoint, method, url, body); // 签名请求
await auth.handleUnauthorized(endpoint, res); // 处理 401 响应
await auth.rotateKey(endpoint, rotateUrl);    // 轮换密钥
await auth.clearKey(endpoint);                // 清除密钥
```

### `S3StorageProvider`

```typescript
const storage = new S3StorageProvider({
  region: "us-east-1",
  bucket: "my-bucket",
  keyPrefix?: "data/",        // 可选前缀
  defaultExpiresIn?: 3600,    // 预签名 URL 有效期 (秒)
});
```

### 自定义 Key Storage

实现 `KeyStorage` 接口：

```typescript
interface KeyStorage {
  load(endpoint: string): Promise<StoredKeyData | null>;
  save(endpoint: string, data: StoredKeyData): Promise<void>;
  delete(endpoint: string): Promise<void>;
  list(): Promise<string[]>;
}
```

### 自定义 Storage Provider

实现 `StorageProvider` 接口：

```typescript
interface StorageProvider {
  canHandle(uri: string): boolean;
  generatePresignedGetUrl(uri: string): Promise<string>;
  generatePresignedPutUrl(prefix: string): Promise<PresignedUrlPair>;
}

interface PresignedUrlPair {
  uri: string;          // 永久 URI (如 s3://bucket/key)
  presignedUrl: string; // 预签名 URL
}
```

## 类型导出

- `AwpClient` - 客户端类
- `AwpClientOptions` - 客户端选项
- `AwpAuth` - 认证处理器
- `AwpAuthOptions` - 认证选项
- `AuthCallbacks` - 认证回调
- `AuthChallenge` - 授权挑战信息
- `KeyStorage` - 密钥存储接口
- `FileKeyStorage` - 文件存储实现
- `MemoryKeyStorage` - 内存存储实现
- `LocalStorageKeyStorage` - 浏览器存储实现
- `S3StorageProvider` - S3 存储提供者
- `StorageProvider` - 存储提供者接口
- `BlobInterceptor` - Blob 拦截器
- `ToolBlobSchema` - Tool Blob Schema

## License

MIT
