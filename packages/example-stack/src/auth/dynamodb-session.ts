/**
 * DynamoDB Session Store for SST Example Server
 *
 * Stores sessions in DynamoDB for Lambda-compatible session management.
 * Uses the same table as auth (AuthTable) with different PK prefix.
 */

import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

// =============================================================================
// Types
// =============================================================================

export interface Session {
  userId: string;
  username: string;
  createdAt: number;
  expiresAt: number;
}

export interface User {
  userId: string;
  username: string;
  password: string;
}

// =============================================================================
// Configuration
// =============================================================================

const SESSION_COOKIE_NAME = "awp_session";
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Built-in test users
export const TEST_USERS: Record<string, User> = {
  test: { userId: "test-user-001", username: "test", password: "test123" },
  admin: { userId: "admin-user-001", username: "admin", password: "admin123" },
  demo: { userId: "demo-user-001", username: "demo", password: "demo" },
};

// =============================================================================
// DynamoDB Session Store
// =============================================================================

let dynamoClient: DynamoDBClient | null = null;
let tableName: string | null = null;

/**
 * Initialize the DynamoDB session store
 */
export function initSessionStore(options: { tableName: string; region?: string }) {
  tableName = options.tableName;
  dynamoClient = new DynamoDBClient({
    region: options.region ?? process.env.AWS_REGION ?? "us-east-1",
  });
}

/**
 * Generate a random session ID
 */
function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create a new session for a user
 */
export async function createSession(user: User): Promise<{ sessionId: string; session: Session }> {
  if (!dynamoClient || !tableName) {
    throw new Error("Session store not initialized");
  }

  const sessionId = generateSessionId();
  const now = Date.now();
  const session: Session = {
    userId: user.userId,
    username: user.username,
    createdAt: now,
    expiresAt: now + SESSION_TTL,
  };

  const ttl = Math.floor(session.expiresAt / 1000); // DynamoDB TTL uses seconds

  await dynamoClient.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: `SESSION#${sessionId}` },
        userId: { S: session.userId },
        username: { S: session.username },
        createdAt: { N: session.createdAt.toString() },
        expiresAt: { N: session.expiresAt.toString() },
        ttl: { N: ttl.toString() },
      },
    })
  );

  return { sessionId, session };
}

/**
 * Get session by ID
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  if (!dynamoClient || !tableName) {
    throw new Error("Session store not initialized");
  }

  try {
    const result = await dynamoClient.send(
      new GetItemCommand({
        TableName: tableName,
        Key: {
          pk: { S: `SESSION#${sessionId}` },
        },
      })
    );

    if (!result.Item) {
      return null;
    }

    const session: Session = {
      userId: result.Item.userId?.S ?? "",
      username: result.Item.username?.S ?? "",
      createdAt: Number(result.Item.createdAt?.N ?? 0),
      expiresAt: Number(result.Item.expiresAt?.N ?? 0),
    };

    // Check expiration
    if (Date.now() > session.expiresAt) {
      await deleteSession(sessionId);
      return null;
    }

    return session;
  } catch (error) {
    console.error("Error getting session:", error);
    return null;
  }
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  if (!dynamoClient || !tableName) {
    throw new Error("Session store not initialized");
  }

  await dynamoClient.send(
    new DeleteItemCommand({
      TableName: tableName,
      Key: {
        pk: { S: `SESSION#${sessionId}` },
      },
    })
  );
}

/**
 * Parse session ID from request cookies
 */
export function getSessionIdFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [name, value] = cookie.split("=");
    if (name === SESSION_COOKIE_NAME && value) {
      return value;
    }
  }

  return null;
}

/**
 * Create Set-Cookie header for session
 */
export function createSessionCookie(sessionId: string): string {
  const expires = new Date(Date.now() + SESSION_TTL).toUTCString();
  // Use Secure flag for HTTPS (CloudFront), SameSite=Lax for same-origin navigation
  return `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`;
}

/**
 * Create Set-Cookie header to clear session
 */
export function createClearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * Validate user credentials
 */
export function validateCredentials(username: string, password: string): User | null {
  const user = TEST_USERS[username];
  if (!user || user.password !== password) {
    return null;
  }
  return user;
}
