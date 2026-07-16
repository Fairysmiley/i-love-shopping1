"use client";

import { useState, FormEvent } from "react";
import { formatDateEuropean } from "@/lib/date-utils";
import { WarningIcon } from "@/components/icons";

interface GoalsFormProps {
  onSubmit?: (data: any) => Promise<void>;
  initialData?: any[];
  showMockIndicator?: boolean;
}

const GOAL_TYPES = [
  { value: "WEIGHT_LOSS", label: "Weight Loss" },
  { value: "MUSCLE_GAIN", label: "Muscle Gain" },
  { value: "GENERAL_FITNESS", label: "General Fitness" },
  { value: "ENDURANCE", label: "Endurance" },
  { value: "FLEXIBILITY", label: "Flexibility" },
] as const;

export function GoalsForm({
  onSubmit,
  initialData = [],
  showMockIndicator = true,
}: GoalsFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [goals, setGoals] = useState<any[]>(initialData);

  const [formData, setFormData] = useState({
    type: "",
    targetValue: "",
    unit: "kg",
    targetDate: "",
    metadata: {} as Record<string, any>,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      if (!formData.type) {
        throw new Error("Goal type is required");
      }

      // Validate target value for weight-based goals
      if (
        (formData.type === "WEIGHT_LOSS" || formData.type === "MUSCLE_GAIN") &&
        !formData.targetValue
      ) {
        throw new Error("Target value is required for weight-based goals");
      }

      const payload: any = {
        type: formData.type,
        targetValue: formData.targetValue ? Number(formData.targetValue) : undefined,
        unit: formData.unit,
        targetDate: formData.targetDate || undefined,
        metadata: {
          ...formData.metadata,
        },
      };

      // Ensure General Fitness has a target value or metadata
      if (formData.type === "GENERAL_FITNESS" && !payload.metadata?.targetActivityLevel) {
        throw new Error("Target activity level is required for General Fitness goals");
      }

      if (formData.type === "FLEXIBILITY" && !payload.metadata?.targetFlexibilityLevel) {
        throw new Error("Target flexibility level is required for Flexibility goals");
      }

      if (onSubmit) {
        await onSubmit(payload);
      } else {
        const response = await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to save goal");
        }

        const result = await response.json();

        // Add to local goals list
        setGoals([...goals, result.goal]);
      }

      // Reset form
      setFormData({
        type: "",
        targetValue: "",
        unit: "kg",
        targetDate: "",
        metadata: {},
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (confirm("Are you sure you want to delete this goal?")) {
      try {
        const response = await fetch(`/api/goals/${goalId}`, {
          method: "DELETE",
        });

        if (response.ok) {
          setGoals(goals.filter((g: any) => g.id !== goalId));
        }
      } catch (error) {
        console.error("Error deleting goal:", error);
      }
    }
  };

  return (
    <div className="space-y-6">
      {showMockIndicator && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
            <WarningIcon className="w-4 h-4 flex-shrink-0" />
            This form will work with mock data when no authentication is available
          </p>
        </div>
      )}

      {/* Existing Goals */}
      {goals.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm">
          <h3 className="text-slate-500 dark:text-slate-400 text-xs font-black uppercase tracking-widest mb-4">
            Current Goals
          </h3>
          <div className="space-y-3">
            {(() => {
              // Deduplicate goals by type for display
              // Prioritize unachieved goals, then HIGHEST target value
              const sortedGoals = [...goals].sort((a, b) => {
                if (a.achieved !== b.achieved) return a.achieved ? 1 : -1;
                return Number(b.targetValue || 0) - Number(a.targetValue || 0);
              });

              const uniqueGoalsMap = new Map();
              sortedGoals.forEach(g => {
                if (!uniqueGoalsMap.has(g.type)) {
                  uniqueGoalsMap.set(g.type, g);
                }
              });

              return Array.from(uniqueGoalsMap.values()).map((goal) => (
                <div
                  key={goal.id}
                  className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-2xl transition-all hover:border-blue-500/30"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">
                        {GOAL_TYPES.find((t) => t.value === goal.type)?.label || goal.type}
                      </p>
                      {goal.achieved && (
                        <span className="px-1.5 py-0.5 text-[10px] font-black bg-green-500/10 text-green-600 dark:text-green-400 rounded uppercase tracking-widest">
                          Achieved
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {goal.targetValue && (
                        <p className="text-[12px] font-bold text-slate-500 dark:text-slate-400">
                          Target: <span className="text-slate-700 dark:text-slate-300">{Number(goal.targetValue).toFixed(1)} {goal.unit}</span>
                        </p>
                      )}
                      {goal.type === "GENERAL_FITNESS" && (goal.metadata as any)?.targetActivityLevel && (
                        <p className="text-[12px] font-bold text-slate-500 dark:text-slate-400">
                          Progress: <span className="text-slate-700 dark:text-slate-300 uppercase">
                            {(goal.metadata as any).currentActivityLevel || "SEDENTARY"} → {(goal.metadata as any).targetActivityLevel}
                          </span>
                        </p>
                      )}
                      {goal.type === "FLEXIBILITY" && (goal.metadata as any)?.targetFlexibilityLevel && (
                        <p className="text-[12px] font-bold text-slate-500 dark:text-slate-400">
                          Progress: <span className="text-slate-700 dark:text-slate-300 uppercase">
                            {(goal.metadata as any).currentFlexibilityLevel || "BEGINNER"} → {(goal.metadata as any).targetFlexibilityLevel}
                          </span>
                        </p>
                      )}
                      {goal.targetDate && (
                        <p className="text-[12px] font-bold text-slate-500 dark:text-slate-400">
                          Target Date: <span className="text-slate-700 dark:text-slate-300">{formatDateEuropean(goal.targetDate)}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteGoal(goal.id)}
                    className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
                  >
                    Delete
                  </button>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Add New Goal Form */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Add New Goal
        </h3>

        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-sm text-green-800 dark:text-green-200">
              ✓ Goal saved successfully!
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Goal Type *
            </label>
            <select
              value={formData.type}
              onChange={(e) => {
                setFormData({
                  ...formData,
                  type: e.target.value,
                  unit: e.target.value.includes("WEIGHT") ? "kg" : "",
                  metadata: {} // Reset metadata when type changes
                });
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            >
              <option value="">Select goal type...</option>
              {GOAL_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {formData.type === "GENERAL_FITNESS" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Current Activity Level *
                </label>
                <select
                  value={formData.metadata.currentActivityLevel || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      metadata: { ...formData.metadata, currentActivityLevel: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">Select...</option>
                  <option value="SEDENTARY">Sedentary</option>
                  <option value="LIGHT">Light</option>
                  <option value="MODERATE">Moderate</option>
                  <option value="ACTIVE">Active</option>
                  <option value="VERY_ACTIVE">Very Active</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Target Activity Level *
                </label>
                <select
                  value={formData.metadata.targetActivityLevel || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      metadata: { ...formData.metadata, targetActivityLevel: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">Select...</option>
                  <option value="LIGHT">Light</option>
                  <option value="MODERATE">Moderate</option>
                  <option value="ACTIVE">Active</option>
                  <option value="VERY_ACTIVE">Very Active</option>
                </select>
              </div>
            </div>
          )}

          {formData.type === "FLEXIBILITY" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Current Flexibility Level *
                </label>
                <select
                  value={formData.metadata.currentFlexibilityLevel || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      metadata: { ...formData.metadata, currentFlexibilityLevel: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">Select level...</option>
                  <option value="BEGINNER">Beginner (Touch Knees)</option>
                  <option value="INTERMEDIATE">Intermediate (Touch Toes)</option>
                  <option value="ADVANCED">Advanced (Palms on Floor)</option>
                  <option value="ELITE">Elite (Full Splits)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Target Flexibility Goal *
                </label>
                <select
                  value={formData.metadata.targetFlexibilityLevel || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      metadata: { ...formData.metadata, targetFlexibilityLevel: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">Select level...</option>
                  <option value="BEGINNER">Beginner (Touch Knees)</option>
                  <option value="INTERMEDIATE">Intermediate (Touch Toes)</option>
                  <option value="ADVANCED">Advanced (Palms on Floor)</option>
                  <option value="ELITE">Elite (Full Splits)</option>
                </select>
              </div>
            </div>
          )}

          {(formData.type === "WEIGHT_LOSS" || formData.type === "MUSCLE_GAIN") && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Target Value *
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.targetValue}
                  onChange={(e) => setFormData({ ...formData, targetValue: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="65"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Unit
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
              </div>
            </div>
          )}


          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Target Date (Optional)
            </label>
            <input
              type="date"
              value={formData.targetDate}
              onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Saving..." : "Add Goal"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

