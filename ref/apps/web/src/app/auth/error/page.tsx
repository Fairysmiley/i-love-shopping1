"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const errorMessages: Record<string, { title: string; description: string }> = {
    Configuration: {
      title: "OAuth Configuration Error",
      description:
        "The OAuth provider is not properly configured. Please contact support or use email/password login.",
    },
    AccessDenied: {
      title: "Access Denied",
      description:
        "You denied access to your account. Please try again and authorize the application.",
    },
    Verification: {
      title: "Email Verification Required",
      description:
        "Please verify your email address before signing in.",
    },
    OAuthSignin: {
      title: "OAuth Sign-in Error",
      description:
        "There was an error signing in with the OAuth provider. Please try again or use email/password.",
    },
    OAuthCallback: {
      title: "OAuth Callback Error",
      description:
        "There was an error processing the OAuth callback. Please try again.",
    },
    OAuthCreateAccount: {
      title: "OAuth Account Creation Error",
      description:
        "Could not create your account with the OAuth provider. Please try email/password registration.",
    },
    EmailCreateAccount: {
      title: "Email Account Creation Error",
      description:
        "Could not create your account. Please try again or use a different email address.",
    },
    Callback: {
      title: "Callback Error",
      description:
        "There was an error during authentication. Please try again.",
    },
    CredentialsSignin: {
      title: "Sign In Failed",
      description:
        "Invalid email or password. Please check your credentials and try again.",
    },
    Default: {
      title: "Authentication Error",
      description:
        "An unexpected error occurred during authentication. Please try again.",
    },
  };

  const errorInfo = error ? errorMessages[error] || errorMessages.Default : errorMessages.Default;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/20">
          <svg
            className="h-8 w-8 text-red-600 dark:text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {errorInfo.title}
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {errorInfo.description}
          </p>
        </div>

        {error === "Configuration" && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-left">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>For Developers:</strong> Make sure to set up OAuth credentials in your <code className="bg-yellow-100 dark:bg-yellow-900 px-1 py-0.5 rounded">.env</code> file:
            </p>
            <ul className="mt-2 text-xs text-yellow-700 dark:text-yellow-300 list-disc list-inside">
              <li>GOOGLE_CLIENT_ID</li>
              <li>GOOGLE_CLIENT_SECRET</li>
              <li>GITHUB_CLIENT_ID</li>
              <li>GITHUB_CLIENT_SECRET</li>
            </ul>
            <p className="mt-2 text-xs text-yellow-700 dark:text-yellow-300">
              <strong>Important:</strong> After adding OAuth credentials to `.env`, you must restart the application for changes to take effect.
            </p>
            <p className="mt-2 text-xs text-yellow-700 dark:text-yellow-300">
              Verify your OAuth app redirect URIs match:
              <br />- Google: <code>http://localhost:3001/api/auth/callback/google</code>
              <br />- GitHub: <code>http://localhost:3001/api/auth/callback/github</code>
            </p>
          </div>
        )}

        <div className="space-y-3">
          <a
            href="/auth/login"
            className="block w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
          >
            Back to Login
          </a>
          <a
            href="/auth/register"
            className="block text-gray-600 hover:text-gray-500 dark:text-gray-400 text-sm"
          >
            Or create a new account
          </a>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ErrorContent />
    </Suspense>
  );
}




