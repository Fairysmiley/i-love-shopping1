"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { ThemeToggle } from "./ThemeToggle";

export function Navigation() {
  const router = useRouter();
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard";
  const isProfile = pathname?.startsWith("/profile");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    };

    if (mobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    try {
      // Clear all auth-related cookies manually first
      const cookiesToClear = [
        "authjs.session-token",
        "__Secure-authjs.session-token",
        "next-auth.session-token",
        "__Secure-next-auth.session-token",
        "authjs.csrf-token",
        "__Secure-authjs.csrf-token",
        "authjs.callback-url",
        "__Secure-authjs.callback-url",
      ];
      
      cookiesToClear.forEach(cookieName => {
        // Clear cookie for current domain and all paths
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`;
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure; samesite=lax;`;
      });
      
      // Call NextAuth signOut (non-blocking)
      signOut({ 
        callbackUrl: "/auth/login?logout=true",
        redirect: false 
      }).catch(() => {
        // Ignore errors, we'll force redirect anyway
      });
      
      // Force immediate hard redirect to clear all state
      // Use setTimeout to ensure cookies are cleared first
      setTimeout(() => {
        window.location.href = "/auth/login?logout=true&t=" + Date.now();
      }, 100);
    } catch (error) {
      console.error("Logout error:", error);
      // Force redirect even on error
      window.location.href = "/auth/login?logout=true&t=" + Date.now();
    }
  };

  const handleNavClick = (path: string) => {
    router.push(path);
    setMobileMenuOpen(false);
  };

  return (
    <>
      {/* Desktop Navigation */}
      <div className="hidden md:flex items-center gap-4">
        <ThemeToggle />
        <nav className="flex items-center gap-2">
          <button
            onClick={() => router.push("/dashboard")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition cursor-pointer ${
              isDashboard
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => router.push("/profile?tab=overview")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition cursor-pointer ${
              isProfile
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            Profile
          </button>
        </nav>
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white cursor-pointer"
        >
          Logout
        </button>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden flex items-center gap-2 relative" ref={menuRef}>
        <ThemeToggle />
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white cursor-pointer"
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        {/* Mobile Menu - Positioned relative to header */}
        {mobileMenuOpen && (
          <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 rounded-lg z-50">
            <nav className="flex flex-col p-2 space-y-1">
              <button
                onClick={() => handleNavClick("/dashboard")}
                className={`px-4 py-3 text-base font-medium rounded-md transition cursor-pointer text-left ${
                  isDashboard
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => handleNavClick("/profile?tab=overview")}
                className={`px-4 py-3 text-base font-medium rounded-md transition cursor-pointer text-left ${
                  isProfile
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                Profile
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-3 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition cursor-pointer text-left"
              >
                Logout
              </button>
            </nav>
          </div>
        )}
      </div>
    </>
  );
}
