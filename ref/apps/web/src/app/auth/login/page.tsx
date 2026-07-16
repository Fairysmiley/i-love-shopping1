"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { logger } from "@/lib/logger";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    twoFactorCode: "",
  });

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [oauthProviders, setOauthProviders] = useState<{
    google: boolean;
    github: boolean;
  }>({
    google: false,
    github: false,
  });

  useEffect(() => {
    const passwordReset = searchParams.get("passwordReset");
    if (passwordReset === "success") {
      setSuccessMessage(
        "Password reset successful! You can now log in with your new password."
      );
      router.replace("/auth/login", { scroll: false });
    }

    const logout = searchParams.get("logout");
    if (logout === "true") {
      // Clear any stale session state on logout
      setError("");
      setSuccessMessage("");
      setRequires2FA(false);
      setUserId(null);
      setFormData({ email: "", password: "", twoFactorCode: "" });
    }

    // Fetch CSRF token for OAuth form submissions
    fetch("/api/auth/csrf")
      .then(async (res) => {
        const data = await res.json();
        if (data.csrfToken) {
          setCsrfToken(data.csrfToken);
          logger.log("[Login] CSRF token fetched successfully");
        }
      })
      .catch((error) => {
        logger.error("[Login] Failed to fetch CSRF token:", error);
      });

    logger.log("[Login] Fetching OAuth providers...");
    fetch("/api/auth/providers")
      .then(async (res) => {
        logger.log("[Login] Providers API response status:", res.status);
        const text = await res.text();
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return {};
        }
      })
      .then((data: { providers?: { google?: boolean; github?: boolean } }) => {
        logger.log("[Login] Providers API data:", data);
        const p = data?.providers;
        const newProviders = {
          google: !!p?.google,
          github: !!p?.github,
        };
        logger.log("[Login] Setting OAuth providers:", newProviders);
        setOauthProviders(newProviders);
      })
      .catch((error) => {
        logger.error("[Login] Failed to fetch providers:", error);
        setOauthProviders({ google: false, github: false });
      });
  }, [searchParams, router]);

  const handleOAuthLogin = async (provider: "google" | "github") => {
    logger.log(`[OAuth] ${provider.toUpperCase()} login started`);
    setLoading(true);
    setError("");

    try {
      let callbackUrl = searchParams.get("redirect") || "/dashboard?firstLogin=true";
      if (
        callbackUrl.includes("/auth/login") ||
        callbackUrl.includes("/auth/register")
      ) {
        callbackUrl = "/dashboard?firstLogin=true";
      }

      logger.log(`[OAuth] Signing in with ${provider}, callbackUrl: ${callbackUrl}`);

      // NextAuth v5 beta.30 bug: signIn(provider, ...) doesn't pass provider correctly
      // Workaround: Create a form and submit it directly
      // The browser will automatically include HttpOnly CSRF token cookies
      logger.log(`[OAuth] Creating form submission for ${provider}`);

      // Create a hidden form and submit it
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `/api/auth/signin/${provider}`;

      // Add CSRF token (required by NextAuth v5)
      if (csrfToken) {
        const csrfInput = document.createElement('input');
        csrfInput.type = 'hidden';
        csrfInput.name = 'csrfToken';
        csrfInput.value = csrfToken;
        form.appendChild(csrfInput);
        logger.log(`[OAuth] Added CSRF token to form`);
      } else {
        logger.warn(`[OAuth] No CSRF token available for form submission`);
      }

      // Add callbackUrl as hidden input
      const callbackInput = document.createElement('input');
      callbackInput.type = 'hidden';
      callbackInput.name = 'callbackUrl';
      callbackInput.value = callbackUrl;
      form.appendChild(callbackInput);

      // Append to body, submit, then remove
      document.body.appendChild(form);
      logger.log(`[OAuth] Submitting form to: ${form.action}`);
      form.submit();

      // Form submission will navigate away, so we won't reach here
      // But set loading state in case it doesn't
      logger.log(`[OAuth] Form submitted`);
    } catch (error) {
      logger.error(`[OAuth] ${provider} signin error:`, error);
      setError(`Failed to sign in with ${provider}. Please try again.`);
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (loading) return;
    setLoading(true);
    setError("");

    if (!formData.email || !formData.password) {
      setError("Please enter both email and password");
      setLoading(false);
      return;
    }

    const redirectUrl = searchParams.get("redirect") || "/dashboard?firstLogin=true";

    // 2FA flow: verify code first, then login
    if (requires2FA && userId) {
      if (!formData.twoFactorCode || formData.twoFactorCode.trim().length < 6) {
        setError("Please enter a valid 2FA code or your secret key");
        setLoading(false);
        return;
      }

      try {
        const verifyRes = await fetch("/api/auth/2fa/verify-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, code: formData.twoFactorCode }),
        });
        let verifyData: { success?: boolean; error?: string } = {};
        try {
          const text = await verifyRes.text();
          if (text) verifyData = JSON.parse(text) as typeof verifyData;
        } catch {
          setError("Invalid 2FA response. Please try again.");
          setLoading(false);
          return;
        }
        if (!verifyRes.ok || !verifyData.success) {
          setError(verifyData.error || "Invalid 2FA code. Please try again.");
          setLoading(false);
          return;
        }
      } catch (err) {
        setError("Failed to verify 2FA code. Please try again.");
        setLoading(false);
        return;
      }
    }

    // If not in 2FA step: check if 2FA is required
    if (!requires2FA) {
      try {
        const loginCheck = await fetch("/api/auth/login-direct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: formData.email, password: formData.password }),
        });
        let data: { error?: string; userId?: string; requires2FA?: boolean } = {};
        try {
          const text = await loginCheck.text();
          if (text) data = JSON.parse(text) as typeof data;
        } catch {
          setError("Unable to connect. Please try again.");
          setLoading(false);
          return;
        }
        if (!loginCheck.ok) {
          setError(data.error || "Invalid credentials. Please try again.");
          setLoading(false);
          return;
        }
        if (data.requires2FA && data.userId) {
          setUserId(data.userId ?? null);
          setRequires2FA(true);
          setError("");
          setLoading(false);
          return;
        }
      } catch (err) {
        setError("Unable to connect. Please try again.");
        setLoading(false);
        return;
      }
    }

    // Main login: call credentials-login API
    try {
      const response = await fetch("/api/auth/credentials-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: formData.email.trim(),
          password: formData.password,
          twoFactorCode: requires2FA && formData.twoFactorCode ? formData.twoFactorCode : undefined,
          redirectUrl,
        }),
      });

      let data: { error?: string; redirectUrl?: string } = {};
      try {
        const text = await response.text();
        if (text) data = JSON.parse(text) as typeof data;
      } catch {
        setError("Invalid response from server. Please try again.");
        setLoading(false);
        return;
      }

      if (!response.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      // Session created, redirect
      logger.log("[Login] Sign-in successful, redirecting...");
      window.location.href = data.redirectUrl || redirectUrl;
    } catch (err) {
      logger.error("[Login] Error:", err);
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Sign in</h1>
          <ThemeToggle />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              autoComplete="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 z-20"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <div className="flex justify-end mt-1">
              <a
                href="/auth/forgot-password"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Forgot password?
              </a>
            </div>
          </div>

          {requires2FA && (
            <div>
              <label className="block text-sm font-medium mb-2">
                2FA Code
              </label>
              <input
                type="text"
                autoComplete="one-time-code"
                value={formData.twoFactorCode}
                onChange={(e) => {
                  setFormData({ ...formData, twoFactorCode: e.target.value });
                }}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-center text-2xl tracking-widest"
                placeholder="Enter 6-digit code"
                autoFocus
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Enter the 6-digit code from your authenticator app
              </p>


            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 rounded">
              {successMessage}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {/* OAuth Providers Section */}
        <div className="mt-6">
          {(oauthProviders.google || oauthProviders.github) ? (
            <div className="space-y-3">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                    Or continue with
                  </span>
                </div>
              </div>

              {oauthProviders.google && (
                <button
                  type="button"
                  onClick={() => handleOAuthLogin("google")}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50 font-medium text-gray-700 dark:text-gray-200"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  {loading ? "Redirecting..." : "Continue with Google"}
                </button>
              )}

              {oauthProviders.github && (
                <button
                  type="button"
                  onClick={() => handleOAuthLogin("github")}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50 font-medium text-gray-700 dark:text-gray-200"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482C19.138 20.197 22 16.425 22 12.017 22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                  {loading ? "Redirecting..." : "Continue with GitHub"}
                </button>
              )}
            </div>
          ) : (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm text-yellow-800 dark:text-yellow-200">
              OAuth providers are not configured. Please use email/password login.
            </div>
          )}

          {/* Tester Bypass Button */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setFormData({
                  email: "tester@wellness.app",
                  password: "testerpassword123",
                  twoFactorCode: ""
                });
                // Small delay to let state update before submitting
                setTimeout(() => {
                  const form = document.querySelector('form');
                  if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }, 100);
              }}
              disabled={loading}
              className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Quick Tester Login
            </button>
            <p className="mt-2 text-center text-xs text-gray-500">
              Bypasses email verification and 2FA for authorized testers.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          Don't have an account?{" "}
          <a
            href="/auth/register"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
