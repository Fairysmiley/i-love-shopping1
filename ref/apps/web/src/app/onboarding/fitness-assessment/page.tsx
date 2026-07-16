"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FitnessAssessmentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    weeklyActivityFrequency: 0,
    preferredExerciseTypes: [] as string[],
    averageSessionDuration: "" as "15-30min" | "30-60min" | "60+min" | "",
    selfAssessedLevel: "" as "beginner" | "intermediate" | "advanced" | "",
    preferredEnvironment: "" as "home" | "gym" | "outdoors" | "mixed" | "",
    preferredExerciseTime: "" as "morning" | "afternoon" | "evening" | "flexible" | "",
    enduranceMinutes: "",
    strengthPushups: "",
    strengthSquats: "",
    notes: "",
  });

  const exerciseTypes = ["cardio", "strength", "flexibility", "sports", "yoga", "swimming", "cycling", "running"];

  const toggleExerciseType = (type: string) => {
    if (formData.preferredExerciseTypes.includes(type)) {
      setFormData({
        ...formData,
        preferredExerciseTypes: formData.preferredExerciseTypes.filter((t: string) => t !== type),
      });
    } else {
      setFormData({
        ...formData,
        preferredExerciseTypes: [...formData.preferredExerciseTypes, type],
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/fitness-assessment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          enduranceMinutes: formData.enduranceMinutes ? parseInt(formData.enduranceMinutes) : undefined,
          strengthPushups: formData.strengthPushups ? parseInt(formData.strengthPushups) : undefined,
          strengthSquats: formData.strengthSquats ? parseInt(formData.strengthSquats) : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save assessment");
      }

      // Redirect to dashboard
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Fitness Assessment
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Help us understand your current fitness level
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 space-y-8">
          {/* Weekly Activity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              How many days per week are you currently active?
            </label>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setFormData({ ...formData, weeklyActivityFrequency: day })}
                  className={`flex-1 py-3 border rounded-md font-medium transition ${
                    formData.weeklyActivityFrequency === day
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Days per week with at least 30 minutes of activity
            </p>
          </div>

          {/* Exercise Types */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              What types of exercise do you prefer? (Select all that apply)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {exerciseTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleExerciseType(type)}
                  className={`px-4 py-2 border rounded-md text-sm transition ${
                    formData.preferredExerciseTypes.includes(type)
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Session Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Average session duration
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(["15-30min", "30-60min", "60+min"] as const).map((duration) => (
                <button
                  key={duration}
                  type="button"
                  onClick={() => setFormData({ ...formData, averageSessionDuration: duration })}
                  className={`px-4 py-3 border rounded-md text-sm font-medium transition ${
                    formData.averageSessionDuration === duration
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {duration}
                </button>
              ))}
            </div>
          </div>

          {/* Fitness Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Self-assessed fitness level
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(["beginner", "intermediate", "advanced"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setFormData({ ...formData, selfAssessedLevel: level })}
                  className={`px-4 py-3 border rounded-md text-sm font-medium transition ${
                    formData.selfAssessedLevel === level
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred Environment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Where do you prefer to exercise?
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(["home", "gym", "outdoors", "mixed"] as const).map((env) => (
                <button
                  key={env}
                  type="button"
                  onClick={() => setFormData({ ...formData, preferredEnvironment: env })}
                  className={`px-4 py-3 border rounded-md text-sm font-medium transition ${
                    formData.preferredEnvironment === env
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {env.charAt(0).toUpperCase() + env.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              When do you prefer to exercise?
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(["morning", "afternoon", "evening", "flexible"] as const).map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => setFormData({ ...formData, preferredExerciseTime: time })}
                  className={`px-4 py-3 border rounded-md text-sm font-medium transition ${
                    formData.preferredExerciseTime === time
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {time.charAt(0).toUpperCase() + time.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Strength Indicators */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
              Optional: Baseline Strength Indicators
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Endurance (minutes)
                </label>
                <input
                  type="number"
                  value={formData.enduranceMinutes}
                  onChange={(e) => setFormData({ ...formData, enduranceMinutes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Can run/walk for"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Push-ups (count)
                </label>
                <input
                  type="number"
                  value={formData.strengthPushups}
                  onChange={(e) => setFormData({ ...formData, strengthPushups: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Can do"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Squats (count)
                </label>
                <input
                  type="number"
                  value={formData.strengthSquats}
                  onChange={(e) => setFormData({ ...formData, strengthSquats: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Can do"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => router.push("/onboarding/profile")}
              className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading || formData.preferredExerciseTypes.length === 0}
              className="flex-1 py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Complete Setup"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}




