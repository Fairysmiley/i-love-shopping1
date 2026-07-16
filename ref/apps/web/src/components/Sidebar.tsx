"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ThemeToggle } from "./ThemeToggle";

function SidebarContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [streakDays, setStreakDays] = useState(5); // TODO: Fetch from API
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const isDashboard = pathname === "/dashboard";
  const isProfile = pathname?.startsWith("/profile");
  const isProgress = pathname?.startsWith("/progress");
  const isMealPlans = pathname?.startsWith("/meal-plans");
  const isRecipes = pathname?.startsWith("/recipes");
  const isNutrition = pathname?.startsWith("/nutrition");

  // Check which tab is active in profile page
  const activeTab = searchParams?.get("tab") || "account";
  const isProfileAccount = isProfile && (activeTab === "account" || !searchParams?.get("tab"));
  const isProfileSettings = isProfile && activeTab === "settings";

  // Get user's first name for ELITE STATUS
  const userName = session?.user?.name?.split(' ')[0] ||
    (session?.user as any)?.firstName ||
    "User";

  // Track theme changes
  useEffect(() => {
    // Check initial theme
    const checkTheme = () => {
      const root = document.documentElement;
      setIsDarkMode(root.classList.contains("dark"));
    };

    checkTheme();

    // Listen for theme changes
    const handleThemeChange = (e: CustomEvent) => {
      setIsDarkMode(e.detail === "dark");
    };

    window.addEventListener("themechange", handleThemeChange as EventListener);

    return () => {
      window.removeEventListener("themechange", handleThemeChange as EventListener);
    };
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  const handleNavClick = (path: string) => {
    router.push(path);
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 md:hidden"
        aria-label="Toggle menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isMobileOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      <aside className={`fixed left-0 top-0 h-screen w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}>
        {/* Logo */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            WELLNESS
          </h1>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <button
            onClick={() => handleNavClick("/dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isDashboard
              ? "bg-blue-600 text-white"
              : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="font-medium">Dashboard</span>
          </button>

          <button
            onClick={() => handleNavClick("/progress")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isProgress
              ? "bg-blue-600 text-white"
              : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="font-medium">Progress</span>
          </button>

          <button
            onClick={() => handleNavClick("/meal-plans")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isMealPlans
              ? "bg-blue-600 text-white"
              : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="font-medium">Meal Plans</span>
          </button>

          <button
            onClick={() => handleNavClick("/recipes")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isRecipes
              ? "bg-blue-600 text-white"
              : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
            <span className="font-medium">Recipes</span>
          </button>

          <button
            onClick={() => handleNavClick("/nutrition")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isNutrition
              ? "bg-blue-600 text-white"
              : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="font-medium">Nutrition</span>
          </button>

          {/* ACCOUNT Section */}
          <div className="pt-6 mt-6 border-t border-slate-200 dark:border-slate-800">
            <div className="px-4 mb-3">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                ACCOUNT
              </span>
            </div>
            <button
              onClick={() => handleNavClick("/profile?tab=account")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isProfileAccount
                ? "bg-blue-600 text-white"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="font-medium">My Profile</span>
            </button>
            <div
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer [&>button]:p-0 [&>button]:w-5 [&>button]:h-5 mt-2"
              onClick={(e) => {
                // If clicking directly on the button, let it handle the click naturally
                if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('button')) {
                  return;
                }
                // Otherwise, find the ThemeToggle button and click it
                const button = e.currentTarget.querySelector('button');
                if (button) {
                  button.click();
                }
              }}
            >
              <ThemeToggle />
              <span className="font-medium">{isDarkMode ? "Light Mode" : "Dark Mode"}</span>
            </div>
          </div>

          {/* SETTINGS Section */}
          <div className="pt-6 mt-6 border-t border-slate-200 dark:border-slate-800">
            <div className="px-4 mb-3">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                SETTINGS
              </span>
            </div>
            <button
              onClick={() => handleNavClick("/profile?tab=settings")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isProfileSettings
                ? "bg-blue-600 text-white"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="font-medium">Settings</span>
            </button>

            {/* Sign Out Button */}
            <button
              onClick={() => handleNavClick("/auth/logout")}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 mt-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="font-medium">Sign Out</span>
            </button>
          </div>
        </nav>

        {/* ELITE STATUS */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="bg-blue-600 rounded-lg p-4 text-white">
            <div className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-90">
              ELITE STATUS
            </div>
            <div className="text-sm font-bold">
              {userName}, {streakDays}-day streak!
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export function Sidebar() {
  return <SidebarContent />;
}
