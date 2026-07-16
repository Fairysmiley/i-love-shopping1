"use client";

import { useState, useEffect } from "react";
import { logger } from "@/lib/logger";

interface TwoFactorAuthProps {
  className?: string;
}

export function TwoFactorAuth({ className = "" }: TwoFactorAuthProps) {
  const [status, setStatus] = useState<{ enabled: boolean; hasSecret: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupLoading, setSetupLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [manualEntryKey, setManualEntryKey] = useState<string>("");
  const [verificationCode, setVerificationCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/auth/2fa/status");
      if (response.ok) {
        const data = await response.json();
        setStatus(data.status);
      }
    } catch (err) {
      logger.error("[2FA] Failed to fetch status:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async () => {
    try {
      setSetupLoading(true);
      setError("");
      setSuccess("");

      const response = await fetch("/api/auth/2fa/setup", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to generate 2FA secret");
        return;
      }

      setQrCodeUrl(data.qrCodeUrl);
      setManualEntryKey(data.manualEntryKey);
      setSuccess("Scan the QR code with your authenticator app, then enter the 6-digit code to verify.");
    } catch (err) {
      logger.error("[2FA] Setup error:", err);
      setError("Failed to set up 2FA. Please try again.");
    } finally {
      setSetupLoading(false);
    }
  };

  const handleCopyKey = async () => {
    if (!manualEntryKey) return;
    try {
      await navigator.clipboard.writeText(manualEntryKey.replace(/\s/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy. Please select and copy the code manually.");
    }
  };

  const handleVerify = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError("Please enter a valid 6-digit code from your authenticator app");
      return;
    }

    try {
      setVerifying(true);
      setError("");
      setSuccess("");

      const response = await fetch("/api/auth/2fa/verify-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verificationCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Invalid verification code. Make sure you entered the code from your authenticator app.");
        return;
      }

      setSuccess("2FA has been enabled successfully!");
      setVerificationCode("");
      setQrCodeUrl(null);
      setManualEntryKey("");
      await fetchStatus();
    } catch (err) {
      logger.error("[2FA] Verify error:", err);
      setError("Failed to verify code. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable = async () => {
    if (!confirm("Are you sure you want to disable 2FA? This will make your account less secure.")) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const response = await fetch("/api/auth/2fa/disable", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to disable 2FA");
        return;
      }

      setSuccess("2FA has been disabled successfully.");
      await fetchStatus();
    } catch (err) {
      logger.error("[2FA] Disable error:", err);
      setError("Failed to disable 2FA. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`${className} bg-white dark:bg-gray-800 shadow rounded-lg p-6`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} bg-white dark:bg-gray-800 shadow rounded-lg p-6`}>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        Two-Factor Authentication (2FA)
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        Add an extra layer of security to your account by requiring a code from your authenticator app.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
        </div>
      )}

      {status?.enabled ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                2FA is enabled
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Your account is protected with two-factor authentication
              </p>
            </div>
            <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <button
            onClick={handleDisable}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Disabling..." : "Disable 2FA"}
          </button>
        </div>
      ) : qrCodeUrl ? (
        <div className="space-y-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p className="mb-2">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):</p>
            <div className="flex justify-center p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48" />
            </div>
            {manualEntryKey && (
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Can&apos;t scan? Enter this key manually in your authenticator app:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-base font-mono tracking-widest text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded select-all">
                    {manualEntryKey}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="verificationCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Enter verification code
            </label>
            <input
              id="verificationCode"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={verificationCode}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                setVerificationCode(value);
                setError("");
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-center text-2xl tracking-widest"
              placeholder="000000"
              autoFocus
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleVerify}
              disabled={verifying || verificationCode.length !== 6}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifying ? "Verifying..." : "Verify & Enable"}
            </button>
            <button
              onClick={() => {
                setQrCodeUrl(null);
                setManualEntryKey("");
                setVerificationCode("");
                setError("");
                setSuccess("");
              }}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleSetup}
          disabled={setupLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {setupLoading ? "Setting up..." : "Enable 2FA"}
        </button>
      )}
    </div>
  );
}
