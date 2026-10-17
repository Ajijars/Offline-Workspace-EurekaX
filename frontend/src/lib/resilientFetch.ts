/**
 * Connection resilience layer — wraps fetch with:
 *  - Auto-retry with exponential backoff
 *  - Request timeout (AbortSignal)
 *  - User-facing toast notifications on failure
 *  - Request ID header injection
 */

import { pushToast } from '@/hooks/useToast';

const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes — matches backend Ollama read timeout for VRAM model loading
const MAX_RETRIES = 3;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function resilientFetch(
  url: string,
  options: RequestInit & { retries?: number; timeoutMs?: number } = {}
): Promise<Response> {
  const { retries = MAX_RETRIES, timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOpts } = options;
  const requestId = Math.random().toString(36).slice(2, 10);

  const headers = new Headers(fetchOpts.headers ?? {});
  headers.set('X-Request-ID', requestId);
  if (!headers.has('Content-Type') && !(fetchOpts.body instanceof FormData)) {
    // Don't set for FormData — browser sets multipart boundary automatically
  }

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...fetchOpts,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Non-retryable: auth errors, 4xx client errors
      if (res.status === 401 || res.status === 403 || (res.status >= 400 && res.status < 500)) {
        return res;
      }

      // 5xx server errors — retry
      if (!res.ok && attempt < retries) {
        const wait = Math.min(500 * Math.pow(2, attempt), 8000);
        await sleep(wait);
        continue;
      }

      return res;
    } catch (err: unknown) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error(String(err));

      const isAbort = (err as Error)?.name === 'AbortError';
      const isNetworkErr = err instanceof TypeError;

      if ((isAbort || isNetworkErr) && attempt < retries) {
        const wait = Math.min(1000 * Math.pow(2, attempt), 10000);
        if (attempt > 0) {
          pushToast({
            type: 'warning',
            title: `Reconnecting… (attempt ${attempt + 1}/${retries})`,
            message: 'Backend may be starting up',
            duration: wait,
          });
        }
        await sleep(wait);
        continue;
      }

      if (isAbort) {
        pushToast({ type: 'error', title: 'Request timed out', message: url });
      } else if (isNetworkErr) {
        pushToast({ type: 'error', title: 'Backend unreachable', message: 'Check that FastAPI is running on port 8000' });
      }

      throw lastError;
    }
  }

  throw lastError;
}

/** Drop-in replacement for authFetch with resilience */
export function makeResilientAuthFetch(getToken: () => string | null) {
  return async function authResilientFetch(url: string, opts: RequestInit = {}) {
    const token = getToken();
    const headers = new Headers(opts.headers ?? {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return resilientFetch(url, { ...opts, headers });
  };
}
