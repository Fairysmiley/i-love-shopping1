"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { NotificationToast, type ToastType } from "@/components/NotificationToast";
import { setToastCallback } from "@/lib/notification-manager";

type ToastItem = { id: number; message: string; type: ToastType };

type Ctx = { showNotification: (message: string, type?: ToastType) => void };

const NotificationContext = createContext<Ctx | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const showNotification = useCallback((message: string, type: ToastType = "error") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, type }]);
  }, []);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    setToastCallback(showNotification);
    return () => setToastCallback(null);
  }, [showNotification]);

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <div
        className="pointer-events-none fixed top-4 right-4 z-[100] flex w-[min(100vw-2rem,24rem)] flex-col gap-2"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {items.map((t) => (
          <NotificationToast
            key={t.id}
            message={t.message}
            type={t.type}
            onClose={() => remove(t.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useToast must be used within NotificationProvider");
  }
  return ctx;
}
