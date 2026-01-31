# AWS Lambda Fullstack Template

A template for building fullstack applications with AWS Lambda (SAM) backend and React frontend, deployed via CloudFront + S3.

## Features

- 🚀 **SAM Backend** - AWS Lambda with API Gateway
- ⚛️ **React Frontend** - Vite + Material UI
- 🌐 **CloudFront CDN** - Unified `/api/*` routing to Lambda, static files from S3
- 🔧 **Unified Deployment** - Single command deploys both backend and frontend
- 💻 **Local Development** - Parallel backend + frontend dev servers

## Quick Start

### 1. Clone this template

```bash
# From the monorepo root, copy the template
cp -r packages/aws-lambda-fullstack packages/my-new-app

# Update package name
cd packages/my-new-app
```

### 2. Configure your project

Edit `package.json`:

```json
{
  "name": "@agent-web-portal/my-new-app",
  "description": "My New Fullstack App"
}
```

Edit `samconfig.toml`:

```toml
[default.deploy.parameters]
stack_name = "my-new-app"
s3_prefix = "my-new-app"
# Add custom domain if needed:
# parameter_overrides = "CustomDomainName=\"app.example.com\" CustomDomainCertificateArn=\"arn:aws:acm:...\""
```

Update `scripts/deploy-frontend.ts`:

```typescript
const STACK_NAME = process.env.STACK_NAME || "my-new-app";
```

### 3. Install dependencies

```bash
bun install
```

### 4. Run locally

```bash
# Start both backend and frontend
bun run dev

# Or start separately
bun run dev:backend   # http://localhost:3500
bun run dev:frontend  # http://localhost:5173
```

### 5. Deploy to AWS

```bash
# Deploy everything (backend + frontend)
bun run deploy

# Or deploy separately
bun run deploy:backend   # SAM deploy
bun run deploy:frontend  # S3 + CloudFront
```

## Directory Structure

```
my-new-app/
├── package.json           # Combined dependencies & scripts
├── template.yaml          # SAM CloudFormation template
├── samconfig.toml         # SAM deployment configuration
├── tsconfig.json          # TypeScript configuration
├── backend/
│   ├── src/
│   │   └── handler.ts     # Lambda handler (add routes here)
│   ├── dist/              # Built Lambda bundle
│   └── server.ts          # Local dev server
├── frontend/
│   ├── src/
│   │   ├── App.tsx        # React app entry
│   │   └── main.tsx       # React DOM render
│   ├── dist/              # Vite build output
│   ├── index.html
│   └── vite.config.ts
└── scripts/
    ├── dev.ts             # Parallel dev server launcher
    ├── deploy.ts          # Full stack deploy
    └── deploy-frontend.ts # S3/CloudFront deploy
```

## Scripts Reference

| Command | Description |
|---------|-------------|
| `bun run dev` | Start backend (3500) + frontend (5173) in parallel |
| `bun run dev:backend` | Start only backend API server |
| `bun run dev:frontend` | Start only Vite dev server |
| `bun run build` | Build both backend and frontend |
| `bun run build:backend` | Build Lambda handler to `backend/dist/` |
| `bun run build:frontend` | Build React app to `frontend/dist/` |
| `bun run deploy` | Full stack deploy: SAM → S3 → CloudFront |
| `bun run deploy:backend` | Deploy only backend (SAM) |
| `bun run deploy:frontend` | Deploy only frontend (S3) |
| `bun run sam:local` | Run SAM local API (requires Docker) |
| `bun run typecheck` | TypeScript type checking |
| `bun run lint` | Run Biome linter |

## Adding Backend Routes

Edit `backend/src/handler.ts`:

```typescript
// Add route handler
async function handleUsers(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Your logic here
  return jsonResponse(200, { users: [] });
}

// Register in routes
const routes: Record<string, Record<string, RouteHandler>> = {
  GET: {
    "/api/health": handleHealth,
    "/api/hello": handleHello,
    "/api/users": handleUsers,  // Add new route
  },
  POST: {
    "/api/users": handleCreateUser,
  },
};
```

## Adding AWS Resources

Edit `template.yaml` to add DynamoDB, S3, Cognito, etc.:

```yaml
Resources:
  # Add a DynamoDB table
  MyTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "${AWS::StackName}-data"
      AttributeDefinitions:
        - AttributeName: pk
          AttributeType: S
      KeySchema:
        - AttributeName: pk
          KeyType: HASH
      BillingMode: PAY_PER_REQUEST

  ApiFunction:
    # ... existing config ...
    Environment:
      Variables:
        MY_TABLE: !Ref MyTable
    Policies:
      - DynamoDBCrudPolicy:
          TableName: !Ref MyTable
```

## Custom Domain Setup

1. Create ACM certificate in `us-east-1` region
2. Update `samconfig.toml`:

```toml
parameter_overrides = "CustomDomainName=\"app.example.com\" CustomDomainCertificateArn=\"arn:aws:acm:us-east-1:...\""
```

3. Deploy and add CNAME record pointing to CloudFront domain

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3500` | Backend dev server port |
| `API_PORT` | `3500` | Port for Vite proxy target |
| `AWS_PROFILE` | (default) | AWS credentials profile |
| `AWS_REGION` | `us-east-1` | AWS region |
| `STACK_NAME` | (from samconfig) | CloudFormation stack name |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CloudFront CDN                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   /api/*  ──────────────► API Gateway ──► Lambda Function   │
│                                                             │
│   /*      ──────────────► S3 Bucket (Static Files)          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Extending from Image Workshop

If building a similar app to `image-workshop`, copy additional patterns:

```bash
# Copy auth patterns
cp -r packages/image-workshop/backend/src/db packages/my-app/backend/src/

# Copy Cognito resources from template.yaml
# Copy frontend auth context
```

## Troubleshooting

### SAM Deploy fails

```bash
# Check AWS credentials
aws sts get-caller-identity

# Validate template
sam validate

# Deploy with debug
sam deploy --debug
```

### Frontend not loading after deploy

```bash
# Force CloudFront invalidation
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```

### Local dev API not connecting

- Ensure backend is running on port 3500
- Check Vite proxy config in `frontend/vite.config.ts`
