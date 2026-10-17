/**
 * Auth API Client — typed wrappers for authentication endpoints.
 *
 * Features:
 *   - Proactive token refresh (checks expiry BEFORE making requests)
 *   - Silent 401 recovery with automatic retry
 *   - Token persistence across sessions via localStorage
 */

import { API_BASE } from './constants';
import { resilientFetch } from './resilientFetch';

// ── Types ──

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: 'admin' | 'employee';
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ── Token Storage ──

const TOKEN_KEY = 'eurekax_access_token';
const REFRESH_KEY = 'eurekax_refresh_token';
const USER_KEY = 'eurekax_user';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function storeAuth(data: TokenResponse): void {
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(REFRESH_KEY, data.refresh_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

// ── JWT Expiry Helpers ──

/**
 * Decode a JWT payload without verification (client-side only).
 * Returns null if the token is malformed.
 */
function decodeJWTPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Check if a token will expire within the given buffer (seconds).
 * Returns true if the token is expired or will expire soon.
 * Returns true (needs refresh) if the token is malformed.
 */
function isTokenExpiringSoon(token: string, bufferSeconds = 300): boolean {
  const payload = decodeJWTPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp - nowSeconds < bufferSeconds;
}

// ── Refresh Lock ──
// Prevent multiple concurrent refresh calls

let _refreshPromise: Promise<boolean> | null = null;

/**
 * Ensure only one refresh is in-flight at a time.
 * All concurrent callers share the same promise.
 */
async function ensureFreshToken(): Promise<boolean> {
  const token = getStoredToken();
  if (!token) return false;

  // Token is still fresh (more than 5 minutes remaining)
  if (!isTokenExpiringSoon(token, 300)) return true;

  // Token is expiring soon or expired — refresh it
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = tryRefresh().finally(() => {
    _refreshPromise = null;
  });

  return _refreshPromise;
}

// ── Authenticated Fetch Helper ──

export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  // Proactively refresh token if it's about to expire
  await ensureFreshToken();

  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  let res = await resilientFetch(url, { ...init, headers, timeoutMs: 600_000 });

  if (res.status === 401) {
    // Attempt automatic silent token refresh
    const refreshed = await tryRefresh();
    if (refreshed) {
      const newToken = getStoredToken();
      const retryHeaders = new Headers(init?.headers);
      if (newToken) {
        retryHeaders.set('Authorization', `Bearer ${newToken}`);
      }
      res = await resilientFetch(url, { ...init, headers: retryHeaders, timeoutMs: 600_000 });
    } else {
      // Refresh failed — only redirect to login if refresh token was actually rejected or missing
      if (!getStoredRefreshToken()) {
        clearAuth();
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
  }

  return res;
}

async function authJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

// ── Auth API Functions ──

export async function register(req: RegisterRequest): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Registration failed: ${res.status}`);
  }
  const data: TokenResponse = await res.json();
  storeAuth(data);
  return data;
}

export async function login(req: LoginRequest): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Login failed: ${res.status}`);
  }
  const data: TokenResponse = await res.json();
  storeAuth(data);
  return data;
}

export async function tryRefresh(): Promise<boolean> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return false;

  // Check if refresh token itself is expired
  if (isTokenExpiringSoon(refreshToken, 0)) {
    clearAuth();
    return false;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      // Only clear credentials if backend explicitly rejected the token (401/403)
      if (res.status === 401 || res.status === 403) {
        clearAuth();
      }
      return false;
    }
    const data: TokenResponse = await res.json();
    storeAuth(data);
    return true;
  } catch {
    // Network error during refresh (e.g. backend booting up or restarting)
    // Do NOT clearAuth() here — retain session so user is not forcibly logged out
    return false;
  }
}

export async function getMe(): Promise<AuthUser> {
  return authJson<AuthUser>(`${API_BASE}/auth/me`);
}

export async function listUsers(): Promise<AuthUser[]> {
  return authJson<AuthUser[]>(`${API_BASE}/auth/users`);
}

export async function changeUserRole(userId: string, role: string): Promise<AuthUser> {
  return authJson<AuthUser>(`${API_BASE}/auth/users/${userId}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
}

export async function deactivateUser(userId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/auth/users/${userId}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `API error ${res.status}`);
  }
}

export function logout(): void {
  clearAuth();
  window.location.href = '/login';
}
