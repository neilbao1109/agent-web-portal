/**
 * Auth module exports
 */

export {
  createClearSessionCookie,
  createSession,
  createSessionCookie,
  deleteSession,
  getSession,
  getSessionFromRequest,
  getSessionIdFromRequest,
  type Session,
  TEST_USERS,
  type User,
  validateCredentials,
} from "./session.ts";
export { getAuthPageHtml, getAuthSuccessHtml } from "./ui.ts";
