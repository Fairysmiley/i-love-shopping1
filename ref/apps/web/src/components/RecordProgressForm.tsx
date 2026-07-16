"use client";

import { useState, FormEvent, useEffect } from "react";
import { logger } from "@/lib/logger";
import { Button } from "@/components/Button";

interface RecordProgressFormProps {
  currentWeight?: number | string;
  onSuccess?: () => void;
  mode?: "progress" | "workout";
}

export function RecordProgressForm({ currentWeight, onSuccess, mode = "progress" }: RecordProgressFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    weightKg: "",
    enduranceMinutes: "",
    strengthPushups: "",
    strengthSquats: "",
    notes: "",
    activityLevel: "",
    weeklyActivityFrequency: "",
    date: new Date().toISOString().split('T')[0], // Today's date in ISO format
  });

  useEffect(() => {
    const fetchCurrentData = async () => {
      try {
        const [profileRes, assessmentRes] = await Promise.all([
          fetch("/api/profile"),
          fetch("/api/fitness-assessment"),
        ]);

        const updates: any = {};
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData.profile?.activityLevel) {
            updates.activityLevel = profileData.profile.activityLevel;
          }
        }
        if (assessmentRes.ok) {
          const assessmentData = await assessmentRes.json();
          if (assessmentData.assessment?.weeklyActivityFrequency !== undefined) {
            updates.weeklyActivityFrequency = assessmentData.assessment.weeklyActivityFrequency.toString();
          }
        }

        if (Object.keys(updates).length > 0) {
          setFormData(prev => ({ ...prev, ...updates }));
        }
      } catch (err) {
        logger.error("Error fetching current activity data:", err);
      }
    };

    fetchCurrentData();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Build payload with only provided fields
      const payload: any = {};

      if (formData.weightKg) {
        payload.weightKg = Number(formData.weightKg);
      }
      if (formData.enduranceMinutes) {
        payload.enduranceMinutes = Number(formData.enduranceMinutes);
      }
      if (formData.strengthPushups) {
        payload.strengthPushups = Number(formData.strengthPushups);
      }
      if (formData.strengthSquats) {
        payload.strengthSquats = Number(formData.strengthSquats);
      }
      if (formData.notes) {
        payload.notes = formData.notes;
      }
      if (formData.activityLevel && mode === "workout") {
        payload.activityLevel = formData.activityLevel;
      }
      if (formData.weeklyActivityFrequency && mode === "workout") {
        payload.weeklyActivityFrequency = Number(formData.weeklyActivityFrequency);
      }

      // Add timestamp if date is provided
      if (formData.date) {
        payload.timestamp = new Date(formData.date).toISOString();
      }

      // Validate at least one metric is provided
      if (Object.keys(payload).length === 0 || (Object.keys(payload).length === 1 && payload.timestamp)) {
        throw new Error("Please provide at least one metric to record");
      }

      const response = await fetch("/api/progress/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to record metric");
      }

      setSuccess(true);
      // Reset form
      setFormData({
        weightKg: "",
        enduranceMinutes: "",
        strengthPushups: "",
        strengthSquats: "",
        notes: "",
        activityLevel: formData.activityLevel, // Keep the same
        weeklyActivityFrequency: formData.weeklyActivityFrequency, // Keep the same
        date: new Date().toISOString().split('T')[0],
      });

      setTimeout(() => {
        setSuccess(false);
        if (onSuccess) {
          onSuccess();
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record metric");
      logger.error("Error recording progress:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
          <p className="text-sm text-green-800 dark:text-green-200">
            Progress recorded successfully!
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Weight - only show in progress mode */}
        {mode === "progress" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Weight (kg)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={formData.weightKg}
              onChange={(e) => setFormData({ ...formData, weightKg: e.target.value })}
              placeholder={currentWeight ? `Current: ${currentWeight} kg` : "e.g., 70"}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        )}

        {/* Endurance - only show in workout mode */}
        {mode === "workout" && (
          <div className="col-span-full">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Workout Duration
            </label>
            <div className="flex flex-wrap gap-3">
              {[
                { id: "dur-beginner", label: "15-30 min", value: "22" },
                { id: "dur-standard", label: "30-60 min", value: "45" },
                { id: "dur-advanced", label: "60+ min", value: "75" },
              ].map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, enduranceMinutes: preset.value })}
                  className={`px-6 py-3 rounded-lg font-bold text-base transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${formData.enduranceMinutes === preset.value
                      ? "bg-blue-600 text-white focus:ring-blue-500 shadow-md"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 focus:ring-slate-400"
                    }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Tap to select training time
            </p>
          </div>
        )}

        {/* Strength - Pushups - only show in workout mode */}
        {mode === "workout" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Push-ups (count)
            </label>
            <input
              type="number"
              min="0"
              value={formData.strengthPushups}
              onChange={(e) => setFormData({ ...formData, strengthPushups: e.target.value })}
              placeholder="e.g., 20"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        )}

        {/* Strength - Squats - only show in workout mode */}
        {mode === "workout" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Squats (count)
            </label>
            <input
              type="number"
              min="0"
              value={formData.strengthSquats}
              onChange={(e) => setFormData({ ...formData, strengthSquats: e.target.value })}
              placeholder="e.g., 30"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        )}
      </div>

      {/* Activity Plan Section - show in both or prioritize in workout */}
      {mode === "workout" && (
        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
            Verify Activity Plan
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Planned Weekly Frequency
              </label>
              <select
                value={formData.weeklyActivityFrequency}
                onChange={(e) => setFormData({ ...formData, weeklyActivityFrequency: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Select frequency...</option>
                {[0, 1, 2, 3, 4, 5, 6, 7].map(num => (
                  <option key={num} value={num}>{num} days per week</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Overall Activity Level
              </label>
              <select
                value={formData.activityLevel}
                onChange={(e) => setFormData({ ...formData, activityLevel: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Select level...</option>
                <option value="SEDENTARY">Sedentary (office job, little exercise)</option>
                <option value="LIGHT">Lightly Active (light exercise 1-3 days/week)</option>
                <option value="MODERATE">Moderately Active (moderate exercise 3-5 days/week)</option>
                <option value="ACTIVE">Very Active (hard exercise 6-7 days/week)</option>
                <option value="VERY_ACTIVE">Extra Active (very hard exercise & physical job)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Date
        </label>
        <input
          type="date"
          value={formData.date}
          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          max={new Date().toISOString().split('T')[0]} // Can't select future dates
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Leave as today to record current metrics
        </p>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Notes (optional)
        </label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
          placeholder="Any additional notes about this measurement..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      {/* Error displayed at eye level near submit button */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
          <div className="flex items-start">
            <svg className="h-5 w-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                {mode === "workout"
                  ? "Please record at least one exercise metric (endurance or strength) for your workout."
                  : "Please provide your current weight to record your progress."}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={loading}
        >
          {loading ? "Recording..." : (mode === "workout" ? "Record Workout" : "Record Progress")}
        </Button>
      </div>
    </form>
  );
}
