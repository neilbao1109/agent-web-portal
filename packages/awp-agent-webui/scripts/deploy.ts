#!/usr/bin/env bun

/**
 * Deploy AWP Agent WebUI to S3 and invalidate CloudFront
 *
 * Usage:
 *   bun run deploy              # Auto-detect from stack
 *   bun run deploy <stack-name> # Use specific CloudFormation stack
 *
 * Environment:
 *   AWS_PROFILE - AWS profile to use (uses default credential chain if not set)
 *   AWS_REGION  - AWS region (default: us-east-1)
 *   STACK_NAME  - CloudFormation stack name (default: awp-agent-webui)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { extname, join } from "node:path";
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";
import {
  PutObjectCommand,
  S3Client,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const UI_DIST_DIR = join(import.meta.dir, "../dist");
const DEFAULT_STACK_NAME = process.env.STACK_NAME || "awp-agent";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

// AWS client config
const awsConfig = { region: AWS_REGION };

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
  cloudFrontUrl?: string;
  customDomainUrl?: string;
}

async function getStackOutputs(stackName: string): Promise<StackOutputs> {
  try {
    const cf = new CloudFormationClient(awsConfig);
    const response = await cf.send(
      new DescribeStacksCommand({ StackName: stackName })
    );

    const outputs = response.Stacks?.[0]?.Outputs || [];

    return {
      uiBucket: outputs.find((o) => o.OutputKey === "UiBucketName")?.OutputValue,
      cloudFrontId: outputs.find((o) => o.OutputKey === "CloudFrontDistributionId")
        ?.OutputValue,
      cloudFrontUrl: outputs.find((o) => o.OutputKey === "CloudFrontUrl")
        ?.OutputValue,
      customDomainUrl: outputs.find((o) => o.OutputKey === "CustomDomainUrl")
        ?.OutputValue,
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

async function clearBucket(s3: S3Client, bucket: string): Promise<void> {
  console.log(`🗑️  Clearing existing files from ${bucket}...`);

  let continuationToken: string | undefined;

  do {
    const listResult = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      })
    );

    const objects = listResult.Contents ?? [];
    if (objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: objects.map((obj) => ({ Key: obj.Key })),
          },
        })
      );
      console.log(`   Deleted ${objects.length} objects`);
    }

    continuationToken = listResult.NextContinuationToken;
  } while (continuationToken);
}

async function main() {
  const stackName = process.argv[2] || DEFAULT_STACK_NAME;

  console.log("=".repeat(60));
  console.log("AWP Agent WebUI Deploy");
  console.log("=".repeat(60));
  console.log();

  console.log(`🔍 Looking up UI bucket from CloudFormation stack: ${stackName}`);
  const { uiBucket, cloudFrontId, cloudFrontUrl, customDomainUrl } =
    await getStackOutputs(stackName);

  if (!uiBucket) {
    console.error("❌ Could not find UiBucketName in stack outputs.");
    console.error("   Make sure the stack is deployed first.");
    console.error("");
    console.error("   To deploy the stack:");
    console.error("   cd packages/awp-agent-webui-stack");
    console.error("   sam deploy --guided");
    process.exit(1);
  }

  console.log(`✅ Found UI bucket: ${uiBucket}`);
  if (cloudFrontId) {
    console.log(`✅ Found CloudFront distribution: ${cloudFrontId}`);
  }
  console.log("");

  // Build the UI
  console.log("🔨 Building UI...");
  const build = spawn("bun", ["run", "build"], {
    cwd: join(import.meta.dir, ".."),
    stdio: "inherit",
  });
  const buildExit = await new Promise<number | null>((resolve) => {
    build.on("exit", (code) => resolve(code ?? null));
  });
  if (buildExit !== 0) {
    console.error("❌ Build failed.");
    process.exit(1);
  }
  console.log("✅ Build complete.");
  console.log("");

  // Check if dist exists
  if (!existsSync(UI_DIST_DIR)) {
    console.error(`❌ ${UI_DIST_DIR} does not exist.`);
    process.exit(1);
  }

  const s3 = new S3Client(awsConfig);

  // Clear existing files
  await clearBucket(s3, uiBucket);
  console.log("");

  // Get all files
  const files = getAllFiles(UI_DIST_DIR);
  console.log(`📦 Uploading ${files.length} files to S3...`);

  for (const file of files) {
    const ext = extname(file.key);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const content = readFileSync(file.path);

    // Set cache control based on file type
    const cacheControl =
      file.key === "index.html"
        ? "no-cache, no-store, must-revalidate"
        : file.key.startsWith("assets/") ||
          file.key.endsWith(".js") ||
          file.key.endsWith(".css")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=0, must-revalidate";

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
  console.log("=".repeat(60));
  console.log("🎉 UI deployment complete!");
  console.log(`   Files uploaded: ${files.length}`);
  if (customDomainUrl) {
    console.log(`🌐 URL: ${customDomainUrl}`);
  } else if (cloudFrontUrl) {
    console.log(`🌐 URL: ${cloudFrontUrl}`);
  }
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
