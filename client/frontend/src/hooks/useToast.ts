'use client';

/**
 * Toast notification system — lightweight, no external dependency.
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast.success('File uploaded!');
 *   toast.error('Connection failed', 'Check your backend is running');
 *   toast.info('Processing...');
 *   toast.warning('Disk space low');
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

let _externalPush: ((t: Omit<ToastMessage, 'id'>) => void) | null = null;

/** Call this from anywhere outside React (e.g. fetch utilities) */
export function pushToast(t: Omit<ToastMessage, 'id'>) {
  _externalPush?.(t);
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback(
    (t: Omit<ToastMessage, 'id'>) => {
      const id = Math.random().toString(36).slice(2);
      const duration = t.duration ?? (t.type === 'error' ? 6000 : 3500);
      setToasts((prev) => [...prev.slice(-4), { ...t, id }]); // max 5 at once
      timers.current[id] = setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  // Wire up external caller
  useEffect(() => {
    _externalPush = add;
    return () => { _externalPush = null; };
  }, [add]);

  const toast = {
    success: (title: string, message?: string) => add({ type: 'success', title, message }),
    error: (title: string, message?: string) => add({ type: 'error', title, message }),
    info: (title: string, message?: string) => add({ type: 'info', title, message }),
    warning: (title: string, message?: string) => add({ type: 'warning', title, message }),
  };

  return { toasts, toast, dismiss };
}
