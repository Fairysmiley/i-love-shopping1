/**
 * Development-only logger
 * Only logs in development mode to avoid performance overhead in production
 */

const isDev = process.env.NODE_ENV === "development";

export const logger = {
  log: (...args: any[]) => {
    if (isDev) {
      console.log(...args);
    }
  },
  error: (...args: any[]) => {
    // Always log errors, but format them better in production
    if (isDev) {
      console.error(...args);
    } else {
      // In production, log errors without sensitive data
      console.error("[Error]", args[0]);
    }
  },
  warn: (...args: any[]) => {
    if (isDev) {
      console.warn(...args);
    }
  },
  debug: (...args: any[]) => {
    if (isDev) {
      console.debug(...args);
    }
  },
  trace: (...args: any[]) => {
    if (isDev) {
      console.trace(...args);
    }
  },
};
