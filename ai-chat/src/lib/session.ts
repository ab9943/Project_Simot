import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "sessionId";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidSessionId(
  value: string | undefined | null
): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function resolveSessionId(existing: string | undefined | null): string {
  return isValidSessionId(existing) ? existing : crypto.randomUUID();
}

// Read-only: safe to call from Server Components as well as Route Handlers.
export async function readSessionId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return isValidSessionId(value) ? value : undefined;
}

// Persists the given session id as the cookie value if it isn't already.
// Cookie writes are only permitted from a Server Action or Route Handler, so
// only call this from those contexts (e.g. the chat API route) — never from
// a Server Component render such as page.tsx.
export async function persistSessionId(sessionId: string): Promise<void> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (existing !== sessionId) {
    cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
}
