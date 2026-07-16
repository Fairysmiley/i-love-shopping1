"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { WarningIcon } from "@/components/icons";

type Props = {
  /** Browser URL for Mailhog UI (set via MAILHOG_PUBLIC_UI_URL in Docker, or dev default). */
  mailhogUrl?: string;
};

function VerifyPendingContent({ mailhogUrl }: Props) {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const email = searchParams.get("email");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  const isAccessDenied = error === "email_not_verified";
  const showMailhog = Boolean(mailhogUrl);

  const handleResend = async () => {
    if (!email) {
      setResendMessage("Email address is required");
      return;
    }

    setResending(true);
    setResendMessage("");

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setResendMessage(
          showMailhog
            ? `Verification email sent! Open Mailhog to read it.`
            : "Verification email sent! Please check your inbox and spam folder."
        );
      } else {
        setResendMessage(data.error || "Failed to resend verification email");
      }
    } catch {
      setResendMessage("Failed to resend verification email. Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8 text-center">
        {isAccessDenied && (
          <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-start gap-3">
            <WarningIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              You must verify your email before accessing the dashboard.
            </p>
          </div>
        )}

        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/20">
          <svg
            className="h-8 w-8 text-blue-600 dark:text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>

        <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">
          {showMailhog
            ? "Check Mailhog for your verification email"
            : "Check your email for verification"}
        </h2>

        <p className="mt-2 text-gray-600 dark:text-gray-400">
          {showMailhog
            ? "We've sent you a verification link. Open Mailhog to read the message and click the link to verify your account."
            : "We've sent you a verification link. Please check your email inbox and click the link to verify your account. If you don't see it, check your spam or junk folder."}
        </p>

        {showMailhog && mailhogUrl && (
          <>
            <div className="mt-6">
              <a
                href={mailhogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium cursor-pointer"
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                Open Mailhog
              </a>
            </div>

            <div className="mt-4 text-sm text-gray-500 dark:text-gray-500">
              <p>
                Mailhog captures outgoing mail in development. Your verification email appears there.
              </p>
            </div>
          </>
        )}

        {email && (
          <div className="mt-4">
            <button
              onClick={handleResend}
              disabled={resending}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resending ? "Sending..." : "Resend Verification Email"}
            </button>
            {resendMessage && (
              <p
                className={`mt-2 text-sm ${resendMessage.includes("sent") ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
              >
                {resendMessage}
                {showMailhog && mailhogUrl && resendMessage.includes("sent") && (
                  <>
                    {" "}
                    <a
                      href={mailhogUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                    >
                      Open Mailhog
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 space-y-2">
          <a
            href="/auth/login"
            className="block text-blue-600 hover:text-blue-500 dark:text-blue-400 font-medium"
          >
            Back to login
          </a>
          <a
            href="/auth/register"
            className="block text-gray-600 hover:text-gray-500 dark:text-gray-400"
          >
            Register a new account
          </a>
        </div>
      </div>
    </div>
  );
}

export function VerifyPendingClient(props: Props) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VerifyPendingContent {...props} />
    </Suspense>
  );
}
