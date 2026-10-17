'use client';

/**
 * AppProviders — client-side global providers mounted in root layout.
 * Handles: toast notifications, keyboard shortcuts, connection resilience indicator.
 */

import { useEffect, useState } from 'react';
import ToastContainer from '@/components/ui/ToastContainer';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

function GlobalSetup({ children }: { children: React.ReactNode }) {
  useKeyboardShortcuts();
  return <>{children}</>;
}

function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    setOffline(!navigator.onLine);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        background: 'var(--color-error, #ef4444)',
        color: '#fff',
        textAlign: 'center',
        padding: '8px',
        fontSize: '13px',
        fontWeight: 600,
        zIndex: 10000,
        letterSpacing: '0.01em',
      }}
      role="alert"
    >
      ⚠ No internet connection detected — EurekaX operates fully offline. Some features may be unavailable.
    </div>
  );
}

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <GlobalSetup>
      <OfflineBanner />
      {children}
      <ToastContainer />
    </GlobalSetup>
  );
}
