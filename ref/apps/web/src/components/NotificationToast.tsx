"use client";

import { useEffect, type ReactElement } from "react";

export type ToastType = "error" | "warning" | "info" | "success";

type Props = {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
};

const styles: Record<
  ToastType,
  { panel: string; text: string; icon: string }
> = {
  error: {
    panel: "bg-red-50 dark:bg-red-950/40 border-red-400 dark:border-red-700",
    text: "text-red-800 dark:text-red-200",
    icon: "text-red-500 dark:text-red-400",
  },
  warning: {
    panel: "bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-700",
    text: "text-amber-900 dark:text-amber-100",
    icon: "text-amber-500 dark:text-amber-400",
  },
  info: {
    panel: "bg-blue-50 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700",
    text: "text-blue-900 dark:text-blue-100",
    icon: "text-blue-500 dark:text-blue-400",
  },
  success: {
    panel: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700",
    text: "text-emerald-900 dark:text-emerald-100",
    icon: "text-emerald-500 dark:text-emerald-400",
  },
};

const icons: Record<ToastType, ReactElement> = {
  error: (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
        clipRule="evenodd"
      />
    </svg>
  ),
  warning: (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
      <path
        fillRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  ),
  info: (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    </svg>
  ),
  success: (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  ),
};

export function NotificationToast({ message, type, onClose, duration = 5000 }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);

  const s = styles[type];

  return (
    <div
      role="status"
      className={`pointer-events-auto w-full max-w-md rounded-lg border-l-4 shadow-lg animate-toast-slide-in ${s.panel}`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`shrink-0 ${s.icon}`}>{icons[type]}</div>
          <p className={`flex-1 text-sm font-medium ${s.text}`}>{message}</p>
          <button
            type="button"
            onClick={onClose}
            className={`shrink-0 rounded p-0.5 ${s.text} opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500`}
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
