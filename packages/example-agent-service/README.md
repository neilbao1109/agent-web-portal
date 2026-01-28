# @agent-web-portal/example-agent-service

Lightweight storage provider service for Agent Web Portal clients with Cognito authentication.

## Overview

This service provides:

1. **Cognito Authentication** - User signup, email verification, login, token refresh
2. **Blob Storage** - Temporary S3 storage with presigned URLs for agent assets
3. **ULID-based IDs** - Globally unique, time-sortable blob identifiers

## Architecture

```
┌─────────────────┐     ┌─────────────────────────────────────┐
│  Agent Client   │────►│         Agent Service               │
│  (Browser)      │     │  ┌─────────────┐  ┌──────────────┐  │
└─────────────────┘     │  │   Cognito   │  │     S3       │  │
                        │  │  User Pool  │  │  Blob Bucket │  │
                        │  └─────────────┘  └──────────────┘  │
                        └─────────────────────────────────────┘
```

## Endpoints

### Authentication

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/auth/signup` | Register new user | No |
| POST | `/api/auth/confirm` | Confirm email with code | No |
| POST | `/api/auth/resend-code` | Resend confirmation code | No |
| POST | `/api/auth/login` | Login with email/password | No |
| POST | `/api/auth/refresh` | Refresh access token | No |
| POST | `/api/auth/forgot-password` | Initiate password reset | No |
| POST | `/api/auth/reset-password` | Complete password reset | No |
| GET | `/api/auth/userinfo` | Get current user info | Yes |
| POST | `/api/auth/signout` | Sign out (invalidate tokens) | Yes |

### Blob Storage

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/blob/prepare-output` | Create output slot, get presigned PUT URL | Yes |
| POST | `/api/blob/prepare-download` | Get presigned GET URL for a blob | Yes |
| GET | `/api/blob/{id}` | Direct blob read (Service Worker fallback) | Yes |
| PUT | `/api/blob/{id}` | Direct blob write | Yes |

## Usage

### Prerequisites

- AWS CLI configured with appropriate permissions
- SAM CLI installed
- Bun runtime (for local development)

### Local Development

```bash
# Install dependencies
bun install

# Set environment variables
export USER_POOL_ID=us-east-1_xxxxx
export USER_POOL_CLIENT_ID=xxxxx
export BLOB_BUCKET=awp-agent-blobs-dev-xxxxx
export AWS_REGION=us-east-1

# Run local server
bun run dev
```

### Deploy to AWS

```bash
# Build and deploy
bun run sam:build
bun run sam:deploy

# Or step by step
bun run build
sam build
sam deploy --guided
```

### Client Integration

```typescript
import { HttpStorageProvider } from "@agent-web-portal/client-browser";

const storage = new HttpStorageProvider({
  baseUrl: "https://xxx.execute-api.us-east-1.amazonaws.com/dev",
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});

// Create upload slot
const { uri, presignedUrl } = await storage.generatePresignedPutUrl("images");

// Upload blob
await fetch(presignedUrl, {
  method: "PUT",
  body: imageData,
  headers: { "Content-Type": "image/png" },
});

// Get download URL
const downloadUrl = await storage.generatePresignedGetUrl(uri);
```

## API Examples

### Signup

```bash
curl -X POST http://localhost:3500/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123",
    "name": "John Doe"
  }'
```

Response:
```json
{
  "userId": "abc-123-def",
  "userConfirmed": false,
  "codeDeliveryDestination": "u***@example.com"
}
```

### Login

```bash
curl -X POST http://localhost:3500/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

Response:
```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI...",
  "refreshToken": "eyJjdHkiOiJKV1QiLCJlbmMi...",
  "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI...",
  "expiresIn": 3600
}
```

### Prepare Output Blob

```bash
curl -X POST http://localhost:3500/api/blob/prepare-output \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "contentType": "image/png",
    "prefix": "generated"
  }'
```

Response:
```json
{
  "uri": "blob://generated-01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "blobId": "generated-01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "presignedUrl": "https://bucket.s3.amazonaws.com/output/...",
  "expiresAt": "2026-01-28T12:05:00.000Z"
}
```

### Prepare Download

```bash
curl -X POST http://localhost:3500/api/blob/prepare-download \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "uri": "blob://generated-01ARZ3NDEKTSV4RRFFQ69G5FAV"
  }'
```

Response:
```json
{
  "presignedUrl": "https://bucket.s3.amazonaws.com/output/...",
  "contentType": "image/png",
  "expiresAt": "2026-01-28T13:00:00.000Z"
}
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `USER_POOL_ID` | Cognito User Pool ID | Yes |
| `USER_POOL_CLIENT_ID` | Cognito App Client ID | Yes |
| `BLOB_BUCKET` | S3 bucket for blob storage | Yes |
| `AWS_REGION` / `AWS_REGION_NAME` | AWS region | No (default: us-east-1) |
| `PORT` | Local server port | No (default: 3500) |

## S3 Lifecycle

Blobs are automatically cleaned up:

- `output/` prefix: Expires after 1 day
- `temp/` prefix: Expires after 1 day

This ensures temporary agent assets don't accumulate storage costs.

## Security

- All blob endpoints require JWT authentication
- Presigned URLs are short-lived (5 min for upload, 1 hour for download)
- CORS is configured for cross-origin access
- User blobs are namespaced by user ID (`output/{userId}/{blobId}`)

## License

MIT
