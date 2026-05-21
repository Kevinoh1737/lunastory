/**
 * Frontend half of the soft-lock auth. Token lives in localStorage; on 401
 * from any API call we clear it + reload to bring up the LoginGate.
 *
 * Keep this thin — when per-user auth ships, swap localStorage for a real
 * session cookie / refresh-token flow without changing call sites.
 */

const TOKEN_KEY = "lunastory.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export function authHeader(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/**
 * Called by fetch wrappers when the API responds 401: clear the bad token
 * and reload so the LoginGate takes over. Avoids redirect loops by only
 * clearing+reloading if a token was actually present.
 */
export function handleUnauthorized(): void {
  if (typeof window === "undefined") return;
  if (getToken()) {
    clearToken();
    window.location.reload();
  }
}

export async function unlock(password: string): Promise<boolean> {
  const res = await fetch("/api/auth/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { token?: string };
  if (!json.token) return false;
  setToken(json.token);
  return true;
}

export async function isValidSession(): Promise<boolean> {
  if (!getToken()) return false;
  try {
    const res = await fetch("/api/auth/check", { headers: authHeader() });
    if (!res.ok) return false;
    const json = (await res.json()) as { ok?: boolean };
    return json.ok === true;
  } catch {
    return false;
  }
}
