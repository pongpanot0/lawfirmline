import * as SecureStore from 'expo-secure-store';

/**
 * Thin fetch wrapper: attaches the access token, refreshes once on 401
 * (single-flight so parallel queries don't race the refresh), and throws
 * an ApiError the screens can show as-is.
 */
// Defaults to the production API; set EXPO_PUBLIC_API_URL (e.g. to
// http://<lan-ip>:3001) when developing against a local backend.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://api.samnuan.com';

const ACCESS_KEY = 'lexflow.accessToken';
const REFRESH_KEY = 'lexflow.refreshToken';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getTokens() {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  return { accessToken, refreshToken };
}

export async function setTokens(accessToken: string, refreshToken?: string) {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  if (refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const { refreshToken } = await getTokens();
        if (!refreshToken) return null;
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { accessToken: string };
        await setTokens(body.accessToken);
        return body.accessToken;
      } catch {
        return null;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

export async function api<T>(
  path: string,
  init: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const { accessToken } = await getTokens();
  const doFetch = (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

  let res = await doFetch(accessToken);
  if (res.status === 401 && accessToken) {
    const renewed = await refreshAccessToken();
    if (renewed) res = await doFetch(renewed);
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.message === 'string') message = body.message;
      else if (Array.isArray(body?.message)) message = body.message.join(', ');
    } catch {
      // keep the status-line message
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
