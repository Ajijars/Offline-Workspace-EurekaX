'use client';

/**
 * useKeyboardShortcuts — global keyboard shortcuts for EurekaX.
 *
 * Shortcuts:
 *   Ctrl+K         — Focus search / command palette (future)
 *   Ctrl+/         — Toggle sidebar
 *   Ctrl+Shift+N   — New chat
 *   Escape         — Close modals / cancel
 */

import { useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useRouter } from 'next/navigation';

export function useKeyboardShortcuts() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const clearMessages = useAppStore((s) => s.clearMessages);
  const router = useRouter();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;

      // Ctrl+/ — Toggle sidebar (works everywhere)
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Ctrl+Shift+N — New chat
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        clearMessages();
        router.push('/chat');
        return;
      }

      // Ctrl+K — Command palette (placeholder — focuses search if present)
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          '.governance-search input, .search-input, [data-command-palette]'
        );
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // Escape — Close any open modal
      if (e.key === 'Escape' && !isInput) {
        const modals = document.querySelectorAll('.modal-overlay, .okf-create-form');
        modals.forEach((m) => {
          const closeBtn = m.querySelector<HTMLButtonElement>('.icon-btn, [data-close]');
          closeBtn?.click();
        });
        return;
      }
    },
    [toggleSidebar, clearMessages, router]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
