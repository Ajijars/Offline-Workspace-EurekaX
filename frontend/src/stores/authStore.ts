/**
 * Auth Zustand Store — manages authentication state globally.
 *
 * Hydration verifies that the stored JWT is not expired before
 * accepting it, preventing stale tokens from causing 401 errors.
 */

import { create } from 'zustand';
import type { AuthUser } from '@/lib/auth';
import { getStoredUser, getStoredToken, getStoredRefreshToken, tryRefresh, clearAuth } from '@/lib/auth';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  hydrate: () => void;
  clear: () => void;
}

/**
 * Decode JWT payload without verification (client-side helper).
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
 * Check if a JWT is expired (with no grace buffer — just raw expiry).
 */
function isTokenExpired(token: string): boolean {
  const payload = decodeJWTPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return Math.floor(Date.now() / 1000) >= payload.exp;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) =>
    set({ user, isAuthenticated: !!user, isLoading: false }),

  setLoading: (isLoading) => set({ isLoading }),

  hydrate: () => {
    const user = getStoredUser();
    const token = getStoredToken();
    const refreshToken = getStoredRefreshToken();

    if (!token || !user) {
      // No stored session at all
      set({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    if (!isTokenExpired(token)) {
      // Token is still valid — accept immediately
      set({ user, isAuthenticated: true, isLoading: false });
      return;
    }

    // Access token is expired — try silent refresh in background
    if (refreshToken && !isTokenExpired(refreshToken)) {
      // Set authenticated with existing user while refreshing
      // (prevents flash of login page)
      set({ user, isAuthenticated: true, isLoading: false });
      
      // Fire-and-forget refresh — on failure, next authFetch will redirect
      tryRefresh().then((success) => {
        if (!success) {
          clearAuth();
          set({ user: null, isAuthenticated: false, isLoading: false });
        } else {
          // Refresh succeeded — update user from new token data
          const newUser = getStoredUser();
          if (newUser) {
            set({ user: newUser, isAuthenticated: true });
          }
        }
      });
    } else {
      // Both tokens are expired — force re-login
      clearAuth();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  clear: () =>
    set({ user: null, isAuthenticated: false, isLoading: false }),
}));
