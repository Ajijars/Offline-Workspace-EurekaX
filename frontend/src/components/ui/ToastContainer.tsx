'use client';

/**
 * ToastContainer — renders active toast notifications.
 * Place once in the root layout.
 */

import { useToast, ToastType } from '@/hooks/useToast';

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

export default function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        zIndex: 9999,
        maxWidth: '360px',
        width: '100%',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
          onClick={() => dismiss(t.id)}
          style={{ cursor: 'pointer', animation: 'toast-in 0.25s ease' }}
          role="alert"
        >
          <span className="toast-icon">{ICONS[t.type]}</span>
          <div className="toast-body">
            <span className="toast-title">{t.title}</span>
            {t.message && <span className="toast-message">{t.message}</span>}
          </div>
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}
