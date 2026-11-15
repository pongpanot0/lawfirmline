const TRANSIENT_STATUS = new Set([502, 503, 504]);

export interface FetchRetryOptions { retries?: number; timeoutMs?: number; delayMs?: number }

/**
 * fetch for reads that survive a deploy restart or flaky mobile data.
 * GET/HEAD: gives up on a hung request after `timeoutMs` and retries network errors,
 * timeouts and 502/503/504 with 1 s, 2 s, 4 s waits. A caller's own `signal` disables
 * the timeout and stops retries once it aborts.
 * Other methods get one plain attempt: a retried write could run twice, and uploads can be slow.
 */
export async function fetchWithRetry(url: string, init: RequestInit = {}, options: FetchRetryOptions = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return fetch(url, init);
  const { retries = 3, timeoutMs = 15_000, delayMs = 1_000 } = options;
  for (let attempt = 0; ; attempt++) {
    const controller = init.signal ? null : new AbortController();
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    try {
      const res = await fetch(url, controller ? { ...init, signal: controller.signal } : init);
      if (!TRANSIENT_STATUS.has(res.status) || attempt >= retries) return res;
    } catch (error) {
      if (init.signal?.aborted || attempt >= retries) throw error;
    } finally {
      clearTimeout(timer);
    }
    await new Promise(resolve => setTimeout(resolve, delayMs * 2 ** attempt));
  }
}
