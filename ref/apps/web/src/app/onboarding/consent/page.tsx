"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

export default function ConsentPage() {
  const router = useRouter();
  const [consents, setConsents] = useState({
    dataCollection: false,
    dataUsage: false,
    aiProcessing: false,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check if user already gave consent
  useEffect(() => {
    const checkExistingConsent = async () => {
      try {
        const response = await fetch("/api/consent");
        if (response.ok) {
          const data = await response.json();
          const hasAllConsents = data.consents?.DATA_COLLECTION &&
            data.consents?.DATA_USAGE &&
            data.consents?.AI_PROCESSING;

          if (hasAllConsents) {
            // Already gave consent, check profile completion
            const profileCheckRes = await fetch("/api/profile/check-complete");
            if (profileCheckRes.ok) {
              const profileCheckData = await profileCheckRes.json();
              if (profileCheckData.isComplete) {
                // Profile complete, go to dashboard
                router.push("/dashboard");
              } else {
                // Profile incomplete, go to profile setup
                router.push("/onboarding/profile");
              }
            } else {
              // If check fails, go to profile as fallback
              router.push("/onboarding/profile");
            }
            return;
          }
        }
      } catch (error) {
        console.error("Error checking consent:", error);
      } finally {
        setChecking(false);
      }
    };

    checkExistingConsent();
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const allAccepted = consents.dataCollection && consents.dataUsage && consents.aiProcessing;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!allAccepted) {
      setError("You must accept all consents to continue using the platform");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/consent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(consents),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle session invalidation - force re-login
        if (response.status === 401 && data.requiresReauth) {
          await signOut({ callbackUrl: "/auth/login" });
          return;
        }
        throw new Error(data.error || "Failed to save consent");
      }

      // Check profile completion and redirect accordingly
      // Add a small delay to ensure consent is saved
      await new Promise(resolve => setTimeout(resolve, 500));

      const profileCheckRes = await fetch("/api/profile/check-complete");
      if (profileCheckRes.ok) {
        const profileCheckData = await profileCheckRes.json();
        if (profileCheckData.isComplete) {
          // Profile is complete, go to dashboard
          router.push("/dashboard");
        } else {
          // Profile not complete, go to profile setup
          router.push("/onboarding/profile");
        }
      } else {
        // If check fails, go to profile setup as fallback
        router.push("/onboarding/profile");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Privacy & Data Usage
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Before we begin, please review and accept our data practices
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8">
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Why we need your consent
              </h2>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                To provide you with personalized health insights and recommendations, we need your permission to collect and process your health data. Your privacy and data security are our top priorities.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Data Collection Consent */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                <div className="flex items-start">
                  <input
                    id="dataCollection"
                    type="checkbox"
                    checked={consents.dataCollection}
                    onChange={(e) =>
                      setConsents({ ...consents, dataCollection: e.target.checked })
                    }
                    className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-1"
                  />
                  <label htmlFor="dataCollection" className="ml-3 flex-1">
                    <span className="block text-base font-semibold text-gray-900 dark:text-white">
                      Data Collection
                    </span>
                    <span className="block mt-1 text-sm text-gray-600 dark:text-gray-400">
                      I consent to the collection of my health data including:
                    </span>
                    <ul className="mt-2 text-sm text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
                      <li>Basic demographics (age, gender)</li>
                      <li>Physical metrics (height, weight, body measurements)</li>
                      <li>Lifestyle indicators (occupation, activity level)</li>
                      <li>Dietary preferences and restrictions</li>
                      <li>Fitness goals and assessment data</li>
                      <li>Health and wellness tracking information</li>
                    </ul>
                  </label>
                </div>
              </div>

              {/* Data Usage Consent */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                <div className="flex items-start">
                  <input
                    id="dataUsage"
                    type="checkbox"
                    checked={consents.dataUsage}
                    onChange={(e) =>
                      setConsents({ ...consents, dataUsage: e.target.checked })
                    }
                    className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-1"
                  />
                  <label htmlFor="dataUsage" className="ml-3 flex-1">
                    <span className="block text-base font-semibold text-gray-900 dark:text-white">
                      Data Usage for Health Insights
                    </span>
                    <span className="block mt-1 text-sm text-gray-600 dark:text-gray-400">
                      I consent to the use of my data for:
                    </span>
                    <ul className="mt-2 text-sm text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
                      <li>Calculating health metrics (BMI, wellness scores)</li>
                      <li>Tracking progress towards fitness goals</li>
                      <li>Generating health and wellness analytics</li>
                      <li>Creating visualizations and reports</li>
                      <li>Sending health summaries and notifications</li>
                    </ul>
                  </label>
                </div>
              </div>

              {/* AI Processing Consent */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                <div className="flex items-start">
                  <input
                    id="aiProcessing"
                    type="checkbox"
                    checked={consents.aiProcessing}
                    onChange={(e) =>
                      setConsents({ ...consents, aiProcessing: e.target.checked })
                    }
                    className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-1"
                  />
                  <label htmlFor="aiProcessing" className="ml-3 flex-1">
                    <span className="block text-base font-semibold text-gray-900 dark:text-white">
                      AI Processing for Personalized Recommendations
                    </span>
                    <span className="block mt-1 text-sm text-gray-600 dark:text-gray-400">
                      I consent to AI-powered processing of my anonymized data for:
                    </span>
                    <ul className="mt-2 text-sm text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
                      <li>Generating personalized health recommendations</li>
                      <li>Creating custom meal plans and recipes (Task 2)</li>
                      <li>Providing conversational health assistance (Task 3)</li>
                      <li>Improving recommendation accuracy over time</li>
                    </ul>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-500 italic">
                      Note: All personally identifiable information (PII) is removed before AI processing.
                    </p>
                  </label>
                </div>
              </div>

              {/* Privacy Notice */}
              <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Your Privacy Rights
                </h3>
                <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  <li>✓ Your data is encrypted in transit and at rest</li>
                  <li>✓ You can change your consent preferences at any time</li>
                  <li>✓ You can export all your data</li>
                  <li>✓ We never share your data with third parties without explicit permission</li>
                </ul>
              </div>

              {error && (
                <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading || !allAccepted}
                  className="flex-1 py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Saving..." : "Accept and Continue"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>

              {!allAccepted && (
                <p className="text-sm text-gray-500 dark:text-gray-500 text-center">
                  All consents are required to use the wellness platform
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

