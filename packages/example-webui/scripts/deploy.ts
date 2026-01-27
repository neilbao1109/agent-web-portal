#!/usr/bin/env bun

/**
 * Deploy Web UI to S3 and invalidate CloudFront
 *
 * Usage:
 *   bun run deploy              # Auto-detect from stack
 *   bun run deploy <stack-name> # Use specific CloudFormation stack
 *
 * Environment:
 *   AWS_PROFILE - AWS profile to use (uses default credential chain if not set)
 *   STACK_NAME  - CloudFormation stack name (default: awp-examples)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const UI_DIST_DIR = join(import.meta.dir, "../dist");
const DEFAULT_STACK_NAME = process.env.STACK_NAME || "awp-examples";

// AWS client config - uses default credential chain (env vars, ~/.aws/credentials, IAM role, etc.)
const awsConfig = {};

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

interface StackOutputs {
  uiBucket?: string;
  cloudFrontId?: string;
}

async function getStackOutputs(stackName: string): Promise<StackOutputs> {
  try {
    const cf = new CloudFormationClient(awsConfig);
    const response = await cf.send(new DescribeStacksCommand({ StackName: stackName }));

    const outputs = response.Stacks?.[0]?.Outputs || [];

    return {
      uiBucket: outputs.find((o) => o.OutputKey === "UiBucketName")?.OutputValue,
      cloudFrontId: outputs.find((o) => o.OutputKey === "CloudFrontDistributionId")?.OutputValue,
    };
  } catch (error) {
    console.error(`Failed to get stack ${stackName}:`, (error as Error).message);
    return {};
  }
}

function getAllFiles(dir: string, basePath = ""): { path: string; key: string }[] {
  const files: { path: string; key: string }[] = [];

  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name);
    const relativePath = basePath ? `${basePath}/${name}` : name;

    if (statSync(fullPath).isDirectory()) {
      files.push(...getAllFiles(fullPath, relativePath));
    } else {
      files.push({ path: fullPath, key: relativePath });
    }
  }

  return files;
}

async function main() {
  const stackName = process.argv[2] || DEFAULT_STACK_NAME;

  console.log(`🔍 Looking up UI bucket from CloudFormation stack: ${stackName}`);
  const { uiBucket, cloudFrontId } = await getStackOutputs(stackName);

  if (!uiBucket) {
    console.error("❌ Could not find UiBucketName in stack outputs.");
    console.error("   Make sure the stack is deployed with CloudFront enabled.");
    process.exit(1);
  }

  console.log(`✅ Found UI bucket: ${uiBucket}`);
  if (cloudFrontId) {
    console.log(`✅ Found CloudFront distribution: ${cloudFrontId}`);
  }
  console.log("");

  // Check if UI dist exists
  if (!existsSync(UI_DIST_DIR)) {
    console.error(`❌ UI dist directory not found: ${UI_DIST_DIR}`);
    console.error("   Run 'bun run build' first.");
    process.exit(1);
  }

  // Get all files
  const files = getAllFiles(UI_DIST_DIR);
  console.log(`📦 Uploading ${files.length} files to S3...`);

  const s3 = new S3Client(awsConfig);

  for (const file of files) {
    const ext = extname(file.key);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const content = readFileSync(file.path);

    // Set cache control based on file type
    const cacheControl =
      file.key === "index.html"
        ? "no-cache, no-store, must-revalidate"
        : "public, max-age=31536000, immutable";

    await s3.send(
      new PutObjectCommand({
        Bucket: uiBucket,
        Key: file.key,
        Body: content,
        ContentType: contentType,
        CacheControl: cacheControl,
      })
    );

    console.log(`   → ${file.key} (${contentType})`);
  }

  console.log("");
  console.log("✅ UI files uploaded to S3!");

  // Invalidate CloudFront cache
  if (cloudFrontId) {
    console.log("");
    console.log("🔄 Invalidating CloudFront cache...");

    const cloudfront = new CloudFrontClient(awsConfig);

    await cloudfront.send(
      new CreateInvalidationCommand({
        DistributionId: cloudFrontId,
        InvalidationBatch: {
          CallerReference: `deploy-${Date.now()}`,
          Paths: {
            Quantity: 1,
            Items: ["/*"],
          },
        },
      })
    );

    console.log("✅ CloudFront invalidation created!");
  }

  console.log("");
  console.log("🎉 UI deployment complete!");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
