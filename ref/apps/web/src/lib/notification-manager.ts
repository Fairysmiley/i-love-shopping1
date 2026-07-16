export type ToastType = "error" | "warning" | "info" | "success";

type ToastCallback = (message: string, type: ToastType) => void;

let toastCallback: ToastCallback | null = null;

export function setToastCallback(callback: ToastCallback | null) {
  toastCallback = callback;
}

/** Use from React via `useToast()` when possible; this works outside components (e.g. future fetch helpers). */
export function showNotification(message: string, type: ToastType = "error") {
  if (toastCallback) {
    toastCallback(message, type);
  } else if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    console.warn("[toast] provider not mounted:", message);
  }
}

export const toast = {
  error: (message: string) => showNotification(message, "error"),
  warning: (message: string) => showNotification(message, "warning"),
  info: (message: string) => showNotification(message, "info"),
  success: (message: string) => showNotification(message, "success"),
};
