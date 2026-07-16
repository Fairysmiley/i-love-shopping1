"use client";

import { useEffect } from "react";

export function ThemeScript() {
  useEffect(() => {
    // This runs on mount to ensure theme is applied
    const applyInitialTheme = () => {
      try {
        const theme = localStorage.getItem("theme");
        const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const shouldBeDark = theme === "dark" || (!theme && systemPrefersDark);
        const root = document.documentElement;
        if (shouldBeDark) {
          root.classList.add("dark");
          root.setAttribute("data-theme", "dark");
        } else {
          root.classList.remove("dark");
          root.setAttribute("data-theme", "light");
        }
      } catch (e) {
        // Ignore errors
      }
    };
    
    applyInitialTheme();
  }, []);

  return null;
}
