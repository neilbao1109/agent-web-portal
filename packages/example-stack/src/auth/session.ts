/**
 * Session Management for SST Example Server
 *
 * Simple cookie-based session for the example/demo server.
 * In production, replace with your own session management (e.g., Cognito).
 */

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
// Session Store (in-memory)
// =============================================================================

const sessionStore = new Map<string, Session>();

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
export function createSession(user: User): { sessionId: string; session: Session } {
  const sessionId = generateSessionId();
  const now = Date.now();
  const session: Session = {
    userId: user.userId,
    username: user.username,
    createdAt: now,
    expiresAt: now + SESSION_TTL,
  };
  sessionStore.set(sessionId, session);
  return { sessionId, session };
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): Session | null {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return null;
  }

  // Check expiration
  if (Date.now() > session.expiresAt) {
    sessionStore.delete(sessionId);
    return null;
  }

  return session;
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): void {
  sessionStore.delete(sessionId);
}

/**
 * Parse session ID from request cookies
 */
export function getSessionIdFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie");
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
 * Get session from request
 */
export function getSessionFromRequest(req: Request): Session | null {
  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) {
    return null;
  }
  return getSession(sessionId);
}

/**
 * Create Set-Cookie header for session
 */
export function createSessionCookie(sessionId: string): string {
  const expires = new Date(Date.now() + SESSION_TTL).toUTCString();
  return `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`;
}

/**
 * Create Set-Cookie header to clear session
 */
export function createClearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
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

/**
 * Cleanup expired sessions (call periodically)
 */
export function cleanupSessions(): void {
  const now = Date.now();
  for (const [sessionId, session] of sessionStore) {
    if (now > session.expiresAt) {
      sessionStore.delete(sessionId);
    }
  }
}
