import "server-only";
import { cookies } from "next/headers";
import { createSession, deleteSession, isSessionId, sessionExists } from "./access";
import {
  endAdminSession,
  isAdminSession,
  logInAdmin,
  readAdminConfig,
  startAdminSession,
  type AdminConfig,
} from "./admin";
import { getDb } from "./db";

const COOKIE = "split_sid";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function getSessionId(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  return isSessionId(value) ? value : null;
}

async function setSessionCookie(sessionId: string) {
  (await cookies()).set(COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
}

export async function ensureSessionId(): Promise<string> {
  const db = await getDb();
  const current = await getSessionId();
  if (current && (await sessionExists(db, current))) return current;

  const sessionId = await createSession(db);
  await setSessionCookie(sessionId);
  return sessionId;
}

export function adminConfig(): AdminConfig | null {
  return readAdminConfig(process.env);
}

export async function signInAdmin(input: { email: string; password: string; ip: string }) {
  const db = await getDb();
  await logInAdmin(db, adminConfig(), input);
  await setSessionCookie(await startAdminSession(db, await getSessionId()));
}

export async function isAdmin(): Promise<boolean> {
  const sessionId = await getSessionId();
  return sessionId !== null && (await isAdminSession(await getDb(), sessionId));
}

export async function signOutAdmin(): Promise<void> {
  const sessionId = await getSessionId();
  if (sessionId) await endAdminSession(await getDb(), sessionId);
}

export async function endSession(): Promise<void> {
  const sessionId = await getSessionId();
  if (sessionId) await deleteSession(await getDb(), sessionId);
  (await cookies()).delete(COOKIE);
}
