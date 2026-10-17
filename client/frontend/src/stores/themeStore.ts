/**
 * Zustand theme store — manages dark/light theme with localStorage persistence.
 * Applies `data-theme` attribute to <html> element for CSS variable switching.
 */

import { create } from 'zustand';

export type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

function applyTheme(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = localStorage.getItem('eureka-theme') as Theme | null;
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return 'dark';
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: getInitialTheme(),

  setTheme: (theme) => {
    applyTheme(theme);
    try { localStorage.setItem('eureka-theme', theme); } catch {}
    set({ theme });
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
}));

// Apply on module load (client-side)
if (typeof window !== 'undefined') {
  applyTheme(getInitialTheme());
}
