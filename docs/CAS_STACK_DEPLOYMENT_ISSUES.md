# CAS Stack 部署问题排查指南

本文档记录了在部署 CAS Stack 到 AWS 时遇到的问题及解决方案。

## 问题 1: SSL 证书不匹配 (ERR_CERT_COMMON_NAME_INVALID)

### 症状

浏览器访问自定义域名（如 `https://cas-console.awp.shazhou.me`）时报错：

```
net::ERR_CERT_COMMON_NAME_INVALID
```

使用 `openssl` 检查证书，发现 SAN (Subject Alternative Name) 只包含 CloudFront 默认域名：

```bash
openssl s_client -connect cas-console.awp.shazhou.me:443 -servername cas-console.awp.shazhou.me 2>/dev/null | openssl x509 -noout -text | grep -A1 "Subject Alternative Name"

# 输出:
#   X509v3 Subject Alternative Name:
#       DNS:cloudfront.net, DNS:*.cloudfront.net
```

### 原因

CloudFront Distribution 默认使用 AWS 自带的 `*.cloudfront.net` 证书。即使 DNS 指向了 CloudFront，但 CloudFront 没有配置自定义域名和对应的 ACM 证书，因此返回的是默认证书。

### 解决方案

1. **确保 ACM 证书存在**（必须在 `us-east-1` 区域）：

```bash
aws acm list-certificates --region us-east-1 --query 'CertificateSummaryList[*].[DomainName,CertificateArn,Status]' --output table
```

2. **在 SAM 模板中配置 CloudFront 自定义域名**：

```yaml
Parameters:
  CustomDomainName:
    Type: String
    Default: ""
    Description: Custom domain name for CloudFront (e.g., cas-console.example.com)
  CustomDomainCertificateArn:
    Type: String
    Default: ""
    Description: ACM certificate ARN for the custom domain (must be in us-east-1)

Conditions:
  HasCustomDomain: !And
    - !Not [!Equals [!Ref CustomDomainName, ""]]
    - !Not [!Equals [!Ref CustomDomainCertificateArn, ""]]

Resources:
  CloudFrontDistribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        Aliases: !If
          - HasCustomDomain
          - [!Ref CustomDomainName]
          - !Ref AWS::NoValue
        ViewerCertificate: !If
          - HasCustomDomain
          - AcmCertificateArn: !Ref CustomDomainCertificateArn
            SslSupportMethod: sni-only
            MinimumProtocolVersion: TLSv1.2_2021
          - CloudFrontDefaultCertificate: true
        # ... 其他配置
```

3. **部署时传入参数**：

```bash
sam deploy --parameter-overrides \
  "CustomDomainName=cas-console.awp.shazhou.me" \
  "CustomDomainCertificateArn=arn:aws:acm:us-east-1:123456789:certificate/xxx-xxx"
```

4. **验证证书配置**：

```bash
openssl s_client -connect cas-console.awp.shazhou.me:443 -servername cas-console.awp.shazhou.me 2>/dev/null | openssl x509 -noout -text | grep -A1 "Subject Alternative Name"

# 应该输出:
#   X509v3 Subject Alternative Name:
#       DNS:cas-console.awp.shazhou.me
```

---

## 问题 2: CORS 预检请求失败 (OPTIONS 返回 500)

### 症状

浏览器控制台报错：

```
Access to fetch at 'https://cas-console.awp.shazhou.me/api/...' from origin 'http://localhost:5174'
has been blocked by CORS policy: Response to preflight request doesn't pass access control check:
It does not have HTTP ok status.
```

使用 curl 测试 OPTIONS 请求返回 500：

```bash
curl -v -X OPTIONS "https://cas-console.awp.shazhou.me/api/auth/agent-tokens/init" \
  -H "Origin: http://localhost:5174" \
  -H "Access-Control-Request-Method: POST"

# 返回 HTTP/1.1 500 Internal Server Error
```

但 POST 请求正常工作。

### 原因

SAM 模板中的 `Cors` 配置会让 API Gateway 自动生成 OPTIONS 响应，但这个自动生成的响应有时会失败。同时，SAM 的 `ANY` 方法不包括 OPTIONS 方法，导致 OPTIONS 请求无法路由到 Lambda。

### 解决方案

1. **移除 SAM 的自动 CORS 配置**：

```yaml
CasApi:
  Type: AWS::Serverless::Api
  Properties:
    Name: !Sub "${AWS::StackName}-api"
    StageName: prod
    # 移除 Cors 配置，由 Lambda 处理
    BinaryMediaTypes:
      - "application/octet-stream"
      - "*/*"
```

2. **显式添加 OPTIONS 路由到 Lambda**：

```yaml
CasFunction:
  Type: AWS::Serverless::Function
  Properties:
    # ... 其他配置
    Events:
      ProxyRoute:
        Type: Api
        Properties:
          Path: /{proxy+}
          Method: ANY
          RestApiId: !Ref CasApi
      # 显式添加 OPTIONS 路由
      ProxyOptionsRoute:
        Type: Api
        Properties:
          Path: /{proxy+}
          Method: OPTIONS
          RestApiId: !Ref CasApi
      RootRoute:
        Type: Api
        Properties:
          Path: /
          Method: ANY
          RestApiId: !Ref CasApi
      RootOptionsRoute:
        Type: Api
        Properties:
          Path: /
          Method: OPTIONS
          RestApiId: !Ref CasApi
```

3. **确保 Lambda 代码正确处理 OPTIONS 请求**：

```typescript
// router.ts
if (request.method === "OPTIONS") {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,X-AWP-Pubkey,X-AWP-Timestamp,X-AWP-Signature",
      "Access-Control-Max-Age": "86400",
    },
  });
}
```

4. **验证 OPTIONS 请求**：

```bash
curl -v -X OPTIONS "https://cas-console.awp.shazhou.me/api/auth/agent-tokens/init" \
  -H "Origin: http://localhost:5174" \
  -H "Access-Control-Request-Method: POST"

# 应该返回:
# HTTP/1.1 204 No Content
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
# Access-Control-Allow-Headers: Content-Type,Authorization,...
```

---

## 问题 3: CORS 头缺失 (之前遇到的问题)

### 症状

```
Access to fetch at '...' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

### 解决方案

如果 CloudFront 缓存导致 CORS 头丢失，可以添加 CloudFront Response Headers Policy：

```yaml
CorsResponseHeadersPolicy:
  Type: AWS::CloudFront::ResponseHeadersPolicy
  Properties:
    ResponseHeadersPolicyConfig:
      Name: !Sub "${AWS::StackName}-cors-policy"
      CorsConfig:
        AccessControlAllowCredentials: false
        AccessControlAllowHeaders:
          Items:
            - Content-Type
            - Authorization
            - X-AWP-Pubkey
            - X-AWP-Timestamp
            - X-AWP-Signature
        AccessControlAllowMethods:
          Items: [GET, POST, PUT, DELETE, OPTIONS]
        AccessControlAllowOrigins:
          Items: ["*"]
        AccessControlMaxAgeSec: 86400
        OriginOverride: true

CloudFrontDistribution:
  Type: AWS::CloudFront::Distribution
  Properties:
    DistributionConfig:
      CacheBehaviors:
        - PathPattern: /api/*
          ResponseHeadersPolicyId: !Ref CorsResponseHeadersPolicy
          # ... 其他配置
```

---

## 调试技巧

### 1. 测试 CORS 预检请求

```bash
curl -v -X OPTIONS "https://your-domain.com/api/endpoint" \
  -H "Origin: http://localhost:5174" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"
```

### 2. 检查 SSL 证书

```bash
openssl s_client -connect your-domain.com:443 -servername your-domain.com 2>/dev/null | openssl x509 -noout -text | grep -A1 "Subject Alternative Name"
```

### 3. 直接测试 API Gateway（绕过 CloudFront）

```bash
curl -v "https://xxx.execute-api.us-east-1.amazonaws.com/prod/api/endpoint"
```

### 4. 查看 Lambda 日志

```bash
aws logs tail /aws/lambda/your-function-name --since 5m --format short
```

### 5. 检查 ACM 证书状态

```bash
aws acm list-certificates --region us-east-1 --query 'CertificateSummaryList[*].[DomainName,Status]' --output table
```
