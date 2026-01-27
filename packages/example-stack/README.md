# @agent-web-portal/examples-sst

SAM-based example Lambda portals for Agent Web Portal.

This package demonstrates how to deploy AWP portals using AWS SAM.

## Features

- **SAM Deployment**: Standard AWS SAM template
- **Local Development**: Hot reload with Bun + Vite
- **SAM Local**: Test Lambda locally with `sam local start-api`
- **React UI**: Modern React frontend with MUI

## Available Portals

| Portal | Endpoint | Description |
|--------|----------|-------------|
| Basic | `/basic` | Simple greeting service |
| E-commerce | `/ecommerce` | Shopping cart, product search, checkout |
| JSONata | `/jsonata` | JSONata expression evaluation |
| Auth | `/auth` | Authentication-enabled portal |
| Blob | `/blob` | Image upload/download with blob handling |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime
- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)

### Local Development

```bash
# Install dependencies
bun install
cd ui && bun install && cd ..

# Start local backend server (Bun, no AWS required)
bun run dev:local

# In another terminal, start UI with local backend
bun run dev
```

The UI will be available at `http://localhost:5173`, proxying to local backend at `http://localhost:3400`.

### Development with SAM Local

```bash
# Build the Lambda
bun run sam:build

# Start SAM local API (port 3456)
bun run sam:local

# In another terminal, start UI pointing to SAM
bun run dev --api sam
```

### Development with Remote API

```bash
# Start UI pointing to deployed API
bun run dev --api https://xxx.execute-api.us-east-1.amazonaws.com/prod
```

### Deploy to AWS

```bash
# Build Lambda
bun run build

# Build with SAM
bun run sam:build

# Deploy (first time, guided)
bun run sam:deploy

# Remove stack
bun run sam:remove
```

## Project Structure

```
examples-sst/
├── template.yaml          # SAM template (infrastructure as code)
├── package.json           # Package configuration
├── tsconfig.json          # TypeScript configuration
├── server.ts              # Local development server (Bun)
├── src/
│   ├── handler.ts         # Lambda handler (routes all portals)
│   ├── static.ts          # Static asset serving
│   ├── auth/              # Auth UI templates and session management
│   │   ├── index.ts
│   │   ├── session.ts
│   │   └── ui.ts
│   └── portals/           # Portal definitions
│       ├── index.ts
│       ├── basic.ts       # Basic greeting portal
│       ├── ecommerce.ts   # E-commerce portal
│       ├── jsonata.ts     # JSONata portal
│       ├── auth.ts        # Auth-enabled portal
│       ├── blob.ts        # Blob portal (in-memory storage)
│       └── blob-s3.ts     # S3-based blob storage for Lambda
├── skills/                # Skill definitions (SKILL.md files)
│   ├── automata-transition/
│   └── statistics/
└── ui/                    # React UI
    ├── package.json
    ├── vite.config.ts
    └── src/
```

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start UI (default: local backend at :3400) |
| `bun run dev --api sam` | Start UI with SAM local (:3456) |
| `bun run dev --api <url>` | Start UI with custom API URL |
| `bun run dev:local` | Start local Bun backend server |
| `bun run sam:build` | Build Lambda + SAM |
| `bun run sam:local` | Start SAM local API |
| `bun run sam:deploy` | Deploy to AWS |
| `bun run sam:remove` | Remove AWS stack |

## AWS Resources

The SAM template creates:

- **API Gateway** - HTTP API for all endpoints
- **Lambda Function** - Handles all portal routes
- **DynamoDB Table** - Auth state storage
- **S3 Bucket (Blobs)** - Image/blob storage
- **S3 Bucket (Skills)** - Skill definitions storage (optional)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AUTH_TABLE` | DynamoDB table name for auth |
| `BLOB_BUCKET` | S3 bucket name for blobs |
| `SKILLS_BUCKET` | S3 bucket name for skills |
