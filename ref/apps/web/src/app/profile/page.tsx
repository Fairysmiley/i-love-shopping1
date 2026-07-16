"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { WeightLossIcon, MuscleIcon, RunningIcon, TimerIcon, FlexibilityIcon } from "@/components/icons";
import { Sidebar } from "@/components/Sidebar";
import { TwoFactorAuth } from "@/components/TwoFactorAuth";
import { Notification, useNotification } from "@/components/Notification";
import { Button } from "@/components/Button";
import { logger } from "@/lib/logger";
import { formatDateEuropean } from "@/lib/date-utils";

type Tab = "account" | "data" | "settings";

function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>("account");
  const [profile, setProfile] = useState<any>(null);
  const [goals, setGoals] = useState<any[]>([]);
  const [assessment, setAssessment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const { notification, showNotification, hideNotification } = useNotification();

  // Privacy and notification preferences
  const [privacyPrefs, setPrivacyPrefs] = useState({
    allowDataCollection: true,
    allowAIProcessing: true,
    allowDataSharing: false,
  });
  const [notificationPrefs, setNotificationPrefs] = useState({
    emailUpdates: true,
    aiInsights: true,
    progressReminders: true,
  });
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [privacyError, setPrivacyError] = useState("");
  const [notificationError, setNotificationError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Check profile completion first
        const profileCheckRes = await fetch("/api/profile/check-complete");
        const isProfileComplete = profileCheckRes.ok
          ? (await profileCheckRes.json()).isComplete
          : false;

        const [profileRes, goalsRes, assessmentRes, privacyRes, notificationRes] = await Promise.all([
          fetch("/api/profile"),
          fetch("/api/goals"),
          fetch("/api/fitness-assessment"),
          fetch("/api/privacy/data-sharing"),
          fetch("/api/privacy/notifications"),
        ]);

        if (profileRes.ok) {
          const data = await profileRes.json();
          setProfile(data.profile);
        }

        if (goalsRes.ok) {
          const data = await goalsRes.json();
          setGoals(data.goals || []);
        }

        if (assessmentRes.ok) {
          const data = await assessmentRes.json();
          setAssessment(data.assessment);
        }


        if (privacyRes.ok) {
          const data = await privacyRes.json();
          setPrivacyPrefs({
            allowDataCollection: data.preferences?.allowDataCollection ?? true,
            allowAIProcessing: data.preferences?.allowAIProcessing ?? true,
            allowDataSharing: data.preferences?.allowDataSharing ?? false,
          });
        }

        if (notificationRes.ok) {
          const data = await notificationRes.json();
          setNotificationPrefs({
            emailUpdates: data.preferences?.emailUpdates ?? true,
            aiInsights: data.preferences?.aiInsights ?? true,
            progressReminders: data.preferences?.progressReminders ?? true,
          });
        }
      } catch (error) {
        logger.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Read tab from URL query parameter on mount and when it changes
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    // Map old tab names to new ones for backward compatibility
    const tabMapping: Record<string, Tab> = {
      overview: "account",
      settings: "settings",
      analytics: "account", // Analytics moved to Dashboard
      insights: "account", // Insights moved to Dashboard
      export: "data",
      account: "account",
      data: "data",
    };
    if (tabParam && tabMapping[tabParam]) {
      setActiveTab(tabMapping[tabParam]);
    }
  }, [searchParams]);

  // Update URL when tab changes
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    router.push(`/profile?tab=${tab}`, { scroll: false });
  };

  const handleExport = async (format: "json" | "csv") => {
    setExporting(true);
    try {
      const response = await fetch(`/api/profile/export?format=${format}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wellness-export-${new Date().toISOString().split("T")[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      logger.error("Error exporting data:", error);
      showNotification("Failed to export data. Please try again.", "error");
    } finally {
      setExporting(false);
    }
  };

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 overflow-x-hidden flex">
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={hideNotification}
        />
      )}
      {/* Sidebar */}
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>

      <main className="flex-1 md:ml-64 px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pt-16 md:pt-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            Your Health Profile
          </h1>
          <Button
            onClick={() => router.push("/profile/edit")}
            variant="primary"
            size="md"
            className="w-full sm:w-auto"
          >
            Edit Profile
          </Button>
        </div>
        {/* Tabs - Scrollable on mobile - Hidden when Settings tab is active */}
        {activeTab !== "settings" && (
          <div className="mb-8 border-b border-gray-200 dark:border-gray-700 overflow-x-auto -mx-4 sm:mx-0">
            <nav className="flex space-x-8 min-w-max px-4 sm:px-0">
              <button
                onClick={() => handleTabChange("account")}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === "account"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
              >
                Account
              </button>
              <button
                onClick={() => handleTabChange("data")}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === "data"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
              >
                Data Management
              </button>
            </nav>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === "account" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Demographics */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Demographics
              </h2>
              {profile ? (
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Date of Birth</dt>
                    <dd className="text-base font-medium text-gray-900 dark:text-white">
                      {formatDateEuropean(profile.dateOfBirth)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Gender</dt>
                    <dd className="text-base font-medium text-gray-900 dark:text-white capitalize">
                      {profile.gender?.replace(/_/g, " ") || "Not set"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Timezone</dt>
                    <dd className="text-base font-medium text-gray-900 dark:text-white">
                      {profile.timezone || "UTC"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No profile data</p>
              )}
            </div>

            {/* Physical Metrics */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Physical Metrics
              </h2>
              {profile ? (
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Height</dt>
                    <dd className="text-base font-medium text-gray-900 dark:text-white">
                      {profile.heightCm ? `${profile.heightCm} cm` : "Not set"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Weight</dt>
                    <dd className="text-base font-medium text-gray-900 dark:text-white">
                      {profile.weightKg ? `${profile.weightKg} kg` : "Not set"}
                    </dd>
                  </div>
                  {profile.heightCm && profile.weightKg && (
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                      <dt className="text-sm text-gray-600 dark:text-gray-400">BMI</dt>
                      <dd className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {(
                          parseFloat(profile.weightKg) /
                          Math.pow(parseFloat(profile.heightCm) / 100, 2)
                        ).toFixed(1)}
                      </dd>
                      <dd className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                        {/* Will add classification */}
                      </dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No data</p>
              )}
            </div>

            {/* Lifestyle */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Lifestyle
              </h2>
              {profile ? (
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Activity Level</dt>
                    <dd className="text-base font-medium text-gray-900 dark:text-white capitalize">
                      {profile.activityLevel?.toLowerCase().replace(/_/g, " ") || "Not set"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Occupation</dt>
                    <dd className="text-base font-medium text-gray-900 dark:text-white">
                      {profile.occupation || "Not specified"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No data</p>
              )}
            </div>

            {/* Dietary Preferences */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 lg:col-span-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Dietary Preferences
              </h2>
              {profile && profile.dietaryPreferences?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.dietaryPreferences.map((pref: string) => (
                    <span
                      key={pref}
                      className="px-3 py-1 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-sm rounded-full"
                    >
                      {pref.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No preferences set</p>
              )}

              <h3 className="text-base font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                Restrictions & Allergies
              </h3>
              {profile && profile.dietaryRestrictions?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.dietaryRestrictions.map((restriction: string) => (
                    <span
                      key={restriction}
                      className="px-3 py-1 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300 text-sm rounded-full"
                    >
                      {restriction.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No restrictions</p>
              )}
            </div>

            {/* Goals */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Fitness Goals
              </h2>
              {goals.length > 0 ? (
                <div className="space-y-3">
                  {(() => {
                    // Deduplicate goals by type (take highest target for duplicates)
                    const uniqueGoalsMap = new Map();
                    goals.forEach((g: any) => {
                      if (g.targetValue <= 0 && g.type !== "GENERAL_FITNESS") return;
                      const existing = uniqueGoalsMap.get(g.type);
                      if (!existing || Number(g.targetValue) > Number(existing.targetValue)) {
                        uniqueGoalsMap.set(g.type, g);
                      }
                    });
                    const uniqueGoals = Array.from(uniqueGoalsMap.values());

                    return uniqueGoals.map((goal) => (
                      <div key={goal.id} className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-2xl transition-all hover:border-blue-500/30">
                        {(() => {
                          const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
                            WEIGHT_LOSS: WeightLossIcon,
                            MUSCLE_GAIN: MuscleIcon,
                            ENDURANCE: TimerIcon,
                            FLEXIBILITY: FlexibilityIcon,
                          };
                          const IconComponent = iconMap[goal.type] || RunningIcon;
                          return (
                            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                              <IconComponent className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                            </div>
                          );
                        })()}
                        <div className="flex-1">
                          <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">
                            {goal.type.replace(/_/g, " ")}
                          </div>
                          {goal.targetValue && (
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                              Target: {Number(goal.targetValue).toFixed(1)} {goal.unit}
                            </div>
                          )}
                          {goal.type === "GENERAL_FITNESS" && (goal.metadata as any)?.targetActivityLevel && (
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase">
                              {(goal.metadata as any).currentActivityLevel || "SEDENTARY"} → {(goal.metadata as any).targetActivityLevel}
                            </div>
                          )}
                          {goal.type === "FLEXIBILITY" && (goal.metadata as any)?.targetFlexibilityLevel && (
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase">
                              {(goal.metadata as any).currentFlexibilityLevel || "BEGINNER"} → {(goal.metadata as any).targetFlexibilityLevel}
                            </div>
                          )}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No goals set</p>
              )}
            </div>

            {/* Fitness Assessment */}
            {assessment && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 lg:col-span-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Fitness Assessment
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Weekly Activity</dt>
                    <dd className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {assessment.weeklyActivityFrequency} days
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Fitness Level</dt>
                    <dd className="text-base font-medium text-gray-900 dark:text-white capitalize">
                      {assessment.selfAssessedLevel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Session Duration</dt>
                    <dd className="text-base font-medium text-gray-900 dark:text-white">
                      {assessment.averageSessionDuration}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Preferred Environment</dt>
                    <dd className="text-base font-medium text-gray-900 dark:text-white capitalize">
                      {assessment.preferredEnvironment}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Preferred Time</dt>
                    <dd className="text-base font-medium text-gray-900 dark:text-white capitalize">
                      {assessment.preferredExerciseTime}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Exercise Types</dt>
                    <dd className="text-sm text-gray-900 dark:text-white">
                      {assessment.preferredExerciseTypes?.join(", ") || "None"}
                    </dd>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}


        {/* Analytics tab removed - content moved to Dashboard */}

        {/* Removed insights - moved to Dashboard */}


        {/* Settings Tab */}
        {
          activeTab === "settings" && (
            <div className="space-y-6">
              {/* Privacy Settings */}
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                  Privacy Settings
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex-1">
                      <label className="text-base font-medium text-gray-900 dark:text-white">
                        Allow Data Collection
                      </label>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Allow us to collect your health metrics and activity data to provide personalized insights.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={privacyPrefs.allowDataCollection}
                        onChange={(e) => {
                          setPrivacyPrefs({ ...privacyPrefs, allowDataCollection: e.target.checked });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex-1">
                      <label className="text-base font-medium text-gray-900 dark:text-white">
                        Allow AI Processing
                      </label>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Enable AI-powered analysis of your data to generate personalized health insights and recommendations.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={privacyPrefs.allowAIProcessing}
                        onChange={(e) => {
                          setPrivacyPrefs({ ...privacyPrefs, allowAIProcessing: e.target.checked });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex-1">
                      <label className="text-base font-medium text-gray-900 dark:text-white">
                        Allow Data Sharing
                      </label>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Allow anonymized data to be shared for research and improvement of health services.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={privacyPrefs.allowDataSharing}
                        onChange={(e) => {
                          setPrivacyPrefs({ ...privacyPrefs, allowDataSharing: e.target.checked });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>

                {privacyError && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded">
                    {privacyError}
                  </div>
                )}

                <div className="mt-6">
                  <Button
                    onClick={async () => {
                      setSavingPrivacy(true);
                      setPrivacyError("");
                      try {
                        const response = await fetch("/api/privacy/data-sharing", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(privacyPrefs),
                        });

                        if (!response.ok) {
                          const data = await response.json();
                          throw new Error(data.error || "Failed to save privacy settings");
                        }

                        showNotification("Privacy settings saved successfully", "success");
                      } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : "Failed to save privacy settings";
                        setPrivacyError(errorMessage);
                        showNotification(errorMessage, "error");
                      } finally {
                        setSavingPrivacy(false);
                      }
                    }}
                    variant="primary"
                    disabled={savingPrivacy}
                  >
                    {savingPrivacy ? "Saving..." : "Save Privacy Settings"}
                  </Button>
                </div>
              </div>

              {/* Email Notifications */}
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                  Email Notifications
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex-1">
                      <label className="text-base font-medium text-gray-900 dark:text-white">
                        Email Updates
                      </label>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Receive email notifications about important account updates and changes.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.emailUpdates}
                        onChange={(e) => {
                          setNotificationPrefs({ ...notificationPrefs, emailUpdates: e.target.checked });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex-1">
                      <label className="text-base font-medium text-gray-900 dark:text-white">
                        AI Insights
                      </label>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Get notified when new AI-powered health insights are available.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.aiInsights}
                        onChange={(e) => {
                          setNotificationPrefs({ ...notificationPrefs, aiInsights: e.target.checked });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex-1">
                      <label className="text-base font-medium text-gray-900 dark:text-white">
                        Progress Reminders
                      </label>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Receive reminders to log your progress and track your wellness journey.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationPrefs.progressReminders}
                        onChange={(e) => {
                          setNotificationPrefs({ ...notificationPrefs, progressReminders: e.target.checked });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>

                {notificationError && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded">
                    {notificationError}
                  </div>
                )}

                <div className="mt-6">
                  <Button
                    onClick={async () => {
                      setSavingNotifications(true);
                      setNotificationError("");
                      try {
                        const response = await fetch("/api/privacy/notifications", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(notificationPrefs),
                        });

                        if (!response.ok) {
                          const data = await response.json();
                          throw new Error(data.error || "Failed to save notification preferences");
                        }

                        showNotification("Notification preferences saved successfully", "success");
                      } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : "Failed to save notification preferences";
                        setNotificationError(errorMessage);
                        showNotification(errorMessage, "error");
                      } finally {
                        setSavingNotifications(false);
                      }
                    }}
                    variant="primary"
                    disabled={savingNotifications}
                  >
                    {savingNotifications ? "Saving..." : "Save Notification Preferences"}
                  </Button>
                </div>
              </div>

              {/* Two-Factor Authentication */}
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                  Two-Factor Authentication
                </h2>
                <TwoFactorAuth />
              </div>
            </div>
          )
        }

        {/* Data Management Tab: Export */}
        {
          activeTab === "data" && (
            <div className="space-y-6">
              {/* Export Section */}
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                  Export Your Data
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-8">
                  Download all your health data including profile information, historical metrics, wellness scores, and AI insights.
                </p>
                <div className="flex gap-4">
                  <Button
                    onClick={() => handleExport("json")}
                    variant="primary"
                    size="lg"
                    disabled={exporting}
                  >
                    {exporting ? "Exporting..." : "Export as JSON"}
                  </Button>
                  <Button
                    onClick={() => handleExport("csv")}
                    variant="primary"
                    size="lg"
                    disabled={exporting}
                  >
                    {exporting ? "Exporting..." : "Export as CSV"}
                  </Button>
                </div>
                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>What's included:</strong> Profile data, fitness goals, health metrics history, wellness scores, and AI insights.
                  </p>
                </div>
              </div>
            </div>
          )
        }
      </main>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    }>
      <ProfilePageContent />
    </Suspense>
  );
}
