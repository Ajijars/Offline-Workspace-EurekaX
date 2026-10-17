'use client';

/**
 * ThemeToggle — animated sun/moon button to switch between dark and light themes.
 */

import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '@/stores/themeStore';
import { useEffect, useState } from 'react';

interface ThemeToggleProps {
  size?: 'sm' | 'md';
}

export default function ThemeToggle({ size = 'md' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useThemeStore();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  const iconSize = size === 'sm' ? 14 : 16;
  const btnClass = size === 'sm' ? 'icon-btn icon-btn-sm' : 'icon-btn icon-btn-md';

  return (
    <button
      id="theme-toggle-btn"
      className={`${btnClass} theme-toggle-btn`}
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className="theme-toggle-icon" style={{ display: 'flex', alignItems: 'center' }}>
        {theme === 'dark' ? <Sun size={iconSize} /> : <Moon size={iconSize} />}
      </span>
    </button>
  );
}
