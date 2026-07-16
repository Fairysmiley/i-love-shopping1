"use client";

import { useState, FormEvent } from "react";
import { WarningIcon } from "@/components/icons";

interface FitnessAssessmentFormProps {
  onSubmit?: (data: any) => Promise<void>;
  initialData?: any;
  showMockIndicator?: boolean;
}

const EXERCISE_TYPES = [
  "cardio",
  "strength",
  "flexibility",
  "sports",
  "yoga",
  "pilates",
  "swimming",
  "cycling",
  "running",
  "walking",
] as const;

export function FitnessAssessmentForm({
  onSubmit,
  initialData,
  showMockIndicator = true,
}: FitnessAssessmentFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    weeklyActivityFrequency: initialData?.weeklyActivityFrequency || 0,
    preferredExerciseTypes: initialData?.preferredExerciseTypes || [],
    averageSessionDuration: initialData?.averageSessionDuration || "",
    selfAssessedLevel: initialData?.selfAssessedLevel || "",
    preferredEnvironment: initialData?.preferredEnvironment || "",
    preferredExerciseTime: initialData?.preferredExerciseTime || "",
    enduranceMinutes: initialData?.enduranceMinutes || "",
    strengthPushups: initialData?.strengthPushups || "",
    strengthSquats: initialData?.strengthSquats || "",
    notes: initialData?.notes || "",
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Validate
      if (formData.weeklyActivityFrequency < 0 || formData.weeklyActivityFrequency > 7) {
        throw new Error("Weekly activity frequency must be between 0 and 7 days");
      }
      if (formData.preferredExerciseTypes.length === 0) {
        throw new Error("Select at least one exercise type");
      }
      if (!formData.averageSessionDuration) {
        throw new Error("Session duration is required");
      }
      if (!formData.selfAssessedLevel) {
        throw new Error("Fitness level is required");
      }
      if (!formData.preferredEnvironment) {
        throw new Error("Preferred environment is required");
      }
      if (!formData.preferredExerciseTime) {
        throw new Error("Preferred exercise time is required");
      }

      const payload = {
        weeklyActivityFrequency: Number(formData.weeklyActivityFrequency),
        preferredExerciseTypes: formData.preferredExerciseTypes,
        averageSessionDuration: formData.averageSessionDuration,
        selfAssessedLevel: formData.selfAssessedLevel,
        preferredEnvironment: formData.preferredEnvironment,
        preferredExerciseTime: formData.preferredExerciseTime,
        enduranceMinutes: formData.enduranceMinutes ? Number(formData.enduranceMinutes) : undefined,
        strengthPushups: formData.strengthPushups ? Number(formData.strengthPushups) : undefined,
        strengthSquats: formData.strengthSquats ? Number(formData.strengthSquats) : undefined,
        notes: formData.notes || undefined,
      };

      if (onSubmit) {
        await onSubmit(payload);
      } else {
        const response = await fetch("/api/fitness-assessment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to save assessment");
        }
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const toggleExerciseType = (type: string) => {
    setFormData((prev) => ({
      ...prev,
      preferredExerciseTypes: prev.preferredExerciseTypes.includes(type)
        ? prev.preferredExerciseTypes.filter((t: string) => t !== type)
        : [...prev.preferredExerciseTypes, type],
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {showMockIndicator && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <span className="flex items-center gap-2">
              <WarningIcon className="w-4 h-4 flex-shrink-0" />
              This form will work with mock data when no authentication is available
            </span>
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-sm text-green-800 dark:text-green-200">
            ✓ Fitness assessment saved successfully!
          </p>
        </div>
      )}

      {/* Activity Frequency */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Weekly Activity
        </h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Days per week (0-7) *
          </label>
          <input
            type="number"
            min="0"
            max="7"
            value={formData.weeklyActivityFrequency}
            onChange={(e) =>
              setFormData({ ...formData, weeklyActivityFrequency: Number(e.target.value) })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            required
          />
        </div>
      </div>

      {/* Exercise Types */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Preferred Exercise Types *
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {EXERCISE_TYPES.map((type) => (
            <label
              key={type}
              className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <input
                type="checkbox"
                checked={formData.preferredExerciseTypes.includes(type)}
                onChange={() => toggleExerciseType(type)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                {type}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Session Details */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Session Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Average Duration *
            </label>
            <select
              value={formData.averageSessionDuration}
              onChange={(e) =>
                setFormData({ ...formData, averageSessionDuration: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            >
              <option value="">Select...</option>
              <option value="15-30min">15-30 minutes</option>
              <option value="30-60min">30-60 minutes</option>
              <option value="60+min">60+ minutes</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Fitness Level *
            </label>
            <select
              value={formData.selfAssessedLevel}
              onChange={(e) => setFormData({ ...formData, selfAssessedLevel: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            >
              <option value="">Select...</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Preferred Environment *
            </label>
            <select
              value={formData.preferredEnvironment}
              onChange={(e) =>
                setFormData({ ...formData, preferredEnvironment: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            >
              <option value="">Select...</option>
              <option value="home">Home</option>
              <option value="gym">Gym</option>
              <option value="outdoors">Outdoors</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Preferred Time *
          </label>
          <select
            value={formData.preferredExerciseTime}
            onChange={(e) => setFormData({ ...formData, preferredExerciseTime: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            required
          >
            <option value="">Select...</option>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option>
            <option value="flexible">Flexible</option>
          </select>
        </div>
      </div>

      {/* Fitness Indicators */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Current Fitness Indicators (Optional)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Endurance (minutes)
            </label>
            <input
              type="number"
              min="0"
              value={formData.enduranceMinutes}
              onChange={(e) => setFormData({ ...formData, enduranceMinutes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="e.g., 30"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Can run/walk for X minutes
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Push-ups (count)
            </label>
            <input
              type="number"
              min="0"
              value={formData.strengthPushups}
              onChange={(e) => setFormData({ ...formData, strengthPushups: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="e.g., 20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Squats (count)
            </label>
            <input
              type="number"
              min="0"
              value={formData.strengthSquats}
              onChange={(e) => setFormData({ ...formData, strengthSquats: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="e.g., 30"
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Additional Notes (Optional)
        </h3>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="Any additional information about your fitness routine..."
        />
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Saving..." : "Save Assessment"}
        </button>
      </div>
    </form>
  );
}

