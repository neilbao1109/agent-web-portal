# AWP Agent Stack

AWS SAM stack for AWP Agent - includes WebUI hosting and future backend services.

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. AWS SAM CLI installed
3. For custom domain: ACM certificate in **us-east-1** region

## Deployment Steps

### Step 1: Create ACM Certificate (if using custom domain)

If you want to use a custom domain like `agent.awp.shazhou.me`, you need an ACM certificate in **us-east-1**:

```bash
# Request certificate (must be in us-east-1 for CloudFront)
aws acm request-certificate \
  --domain-name "agent.awp.shazhou.me" \
  --validation-method DNS \
  --region us-east-1

# Note the CertificateArn from the output
```

Then validate the certificate via DNS (add CNAME record to your DNS).

### Step 2: Deploy the Stack

#### First time deployment (without custom domain):

```bash
cd packages/awp-agent-stack
sam deploy --guided
```

#### With custom domain:

```bash
cd packages/awp-agent-stack
sam deploy \
  --parameter-overrides \
    CustomDomainName="agent.awp.shazhou.me" \
    CustomDomainCertificateArn="arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERT_ID"
```

Or update `samconfig.toml` and run:

```bash
sam deploy --config-env prod
```

### Step 3: Configure DNS

After deployment, get the CloudFront distribution domain:

```bash
aws cloudformation describe-stacks \
  --stack-name awp-agent \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text
```

Add a CNAME record in your DNS:

```
agent.awp.shazhou.me -> d1234567890.cloudfront.net
```

### Step 4: Deploy UI Files

From the `awp-agent-webui` package:

```bash
cd packages/awp-agent-webui
bun run deploy
```

## Stack Resources

- **S3 Bucket**: Stores static UI files
- **CloudFront Distribution**: CDN with HTTPS support
- **Origin Access Control**: Secures S3 access

## Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `CustomDomainName` | Custom domain for CloudFront | (empty) |
| `CustomDomainCertificateArn` | ACM certificate ARN for custom domain | (empty) |

## Outputs

| Output | Description |
|--------|-------------|
| `UiBucketName` | S3 bucket name |
| `CloudFrontDistributionId` | CloudFront distribution ID |
| `CloudFrontUrl` | CloudFront URL (https://xxx.cloudfront.net) |
| `CustomDomainUrl` | Custom domain URL (if configured) |
