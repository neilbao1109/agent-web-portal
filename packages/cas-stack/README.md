# @agent-web-portal/cas-stack

CAS (Content-Addressable Storage) service with global deduplication and scope-based access control.

## Features

- **Content-Addressable Storage**: Uses SHA-256 hash as keys for global deduplication
- **Scope-based Access Control**: Each user has isolated storage scope (`usr_xxx`)
- **Three-tier Authentication**: User Token → Agent Token → Ticket
- **DAG Support**: Upload and resolve Merkle DAG structures
- **AWS Native**: Built on Lambda, DynamoDB, S3, and Cognito

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CAS Stack                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  /auth/*     │  │  /cas/{scope}│  │   Middleware         │  │
│  │  - login     │  │  - resolve   │  │   - Token parsing    │  │
│  │  - agent-token│ │  - node/:key │  │   - Scope validation │  │
│  │  - ticket    │  │  - dag       │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                            │                                    │
│         ┌──────────────────┼──────────────────┐                │
│         ▼                  ▼                  ▼                │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│  │  DynamoDB   │   │  DynamoDB   │   │     S3      │          │
│  │  (tokens)   │   │ (ownership) │   │   (blobs)   │          │
│  └─────────────┘   └─────────────┘   └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Authentication Chain

```
OAuth/Cognito ──► User Token ──► Agent Token ──► Ticket
     │                │               │             │
     │                │               │             └─► AWP Tool
     │                │               └─► Agent
     │                └─► User (Web UI)
     └─► Login
```

## API Endpoints

### Auth API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | - | Login with email/password |
| POST | `/auth/refresh` | Refresh Token | Refresh user token |
| POST | `/auth/agent-token` | User | Issue agent token |
| GET | `/auth/agent-tokens` | User | List agent tokens |
| DELETE | `/auth/agent-token/:id` | User | Revoke agent token |
| POST | `/auth/ticket` | User/Agent | Issue ticket |
| DELETE | `/auth/ticket/:id` | User/Agent | Revoke ticket |

### CAS API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/cas/{scope}/resolve` | All | Check which nodes exist |
| PUT | `/cas/{scope}/node/:key` | Write | Upload single node |
| GET | `/cas/{scope}/node/:key` | Read | Download single node |
| GET | `/cas/{scope}/dag/:key` | Read | Download DAG as tar |
| POST | `/cas/{scope}/dag` | Write | Upload DAG (multipart) |

**Scope**: `@me` (current user) or explicit `usr_xxx`

## Development

### Local Development

```bash
# Install dependencies
bun install

# Start local server (uses in-memory storage)
bun run dev

# Server runs at http://localhost:3500
```

### Local DynamoDB (Docker)

For persistent local storage, use DynamoDB Local in Docker:

```bash
# From repo root: start DynamoDB Local
docker compose up -d dynamodb

# Create CAS tables in local DynamoDB
cd packages/cas-stack && bun run create-local-tables

# In project root .env, add:
#   DYNAMODB_ENDPOINT=http://localhost:8000
#   TOKENS_TABLE=awp-cas-tokens
#   CAS_REALM_TABLE=awp-cas-cas-realm
#   CAS_DAG_TABLE=awp-cas-cas-dag

# Start CAS server (will use DynamoDB when DYNAMODB_ENDPOINT is set)
bun run dev
```

### Deploy to AWS

```bash
# Build and deploy
bun run deploy

# Or step by step:
bun run sam:build
bun run sam:deploy
```

### Configuration

Set Cognito domain for OAuth:

```bash
sam deploy --parameter-overrides CognitoDomain=my-unique-domain
```

## Usage Example

```typescript
// 1. Login and get user token
const loginRes = await fetch('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'user@example.com', password: 'xxx' }),
});
const { userToken } = await loginRes.json();

// 2. Issue agent token
const agentRes = await fetch('/auth/agent-token', {
  method: 'POST',
  headers: { Authorization: `Bearer ${userToken}` },
  body: JSON.stringify({
    name: 'My Agent',
    permissions: { read: true, write: true, issueTicket: true },
  }),
});
const { token: agentToken } = await agentRes.json();

// 3. Resolve DAG (check what's missing)
const resolveRes = await fetch('/cas/@me/resolve', {
  method: 'POST',
  headers: { Authorization: `Bearer ${agentToken}` },
  body: JSON.stringify({
    root: 'sha256:abc123...',
    nodes: ['sha256:abc123...', 'sha256:def456...'],
  }),
});
const { missing } = await resolveRes.json();

// 4. Upload missing nodes
for (const key of missing) {
  await fetch(`/cas/@me/node/${key}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${agentToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: nodeContent,
  });
}

// 5. Issue ticket for AWP tool
const ticketRes = await fetch('/auth/ticket', {
  method: 'POST',
  headers: { Authorization: `Bearer ${agentToken}` },
  body: JSON.stringify({
    type: 'read',
    key: 'sha256:abc123...',
  }),
});
const { id: ticketId } = await ticketRes.json();

// 6. AWP tool reads with ticket
const content = await fetch(`/cas/@me/node/sha256:abc123...`, {
  headers: { Authorization: `Ticket ${ticketId}` },
});
```

## License

MIT
