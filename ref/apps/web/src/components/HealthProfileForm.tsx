"use client";

import { useState, FormEvent, useEffect, useMemo } from "react";
import { DateInput } from "./DateInput";
import { DIETARY_PREFERENCES, DIETARY_RESTRICTIONS } from "@wellness-app/shared";
import { WarningIcon } from "@/components/icons";

interface HealthProfileFormProps {
  onSubmit?: (data: any) => Promise<void>;
  initialData?: any;
  showMockIndicator?: boolean;
}

function arrayToCommaSeparatedInput(arr: unknown): string {
  if (!Array.isArray(arr)) return "";
  return arr
    .map((s) => String(s ?? "").trim())
    .filter((s) => s.length > 0)
    .join(", ");
}

/** Parse for API: trim segments, drop empties (raw input preserves commas while typing). */
function commaSeparatedInputToArray(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Union of restriction + allergy lists from API (legacy data may split them). */
function mergeProfileRestrictionLists(a: unknown, b: unknown): string[] {
  const s = new Set<string>();
  if (Array.isArray(a)) for (const x of a) if (x) s.add(String(x));
  if (Array.isArray(b)) for (const x of b) if (x) s.add(String(x));
  return Array.from(s);
}

export function HealthProfileForm({
  onSubmit,
  initialData,
  showMockIndicator = true,
}: HealthProfileFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form state
  const [formData, setFormData] = useState(() => {
    const mergedRestrictions = mergeProfileRestrictionLists(
      initialData?.dietaryRestrictions,
      initialData?.allergies
    );
    return {
    // Demographics
    dateOfBirth: initialData?.dateOfBirth || "",
    gender: initialData?.gender || "",

    // Physical Metrics (user can input in preferred units)
    height: initialData?.heightCm || "",
    heightUnit: "cm" as "cm" | "m" | "ft" | "in",
    weight: initialData?.weightKg || "",
    weightUnit: "kg" as "kg" | "lb" | "g",

    // Lifestyle
    activityLevel: initialData?.activityLevel || "",
    occupation: initialData?.occupation || "",

    // Dietary
    dietaryPreferences: initialData?.dietaryPreferences || [],
    dietaryRestrictions: mergedRestrictions,

    // Task 2: keep allergies[] in sync with dietaryRestrictions[] for meal planning / filters
    allergies: [...mergedRestrictions],
    calorieTarget: initialData?.calorieTarget ?? 2000,
    proteinTarget: (initialData?.macronutrientTargets as any)?.protein ?? 100,
    carbsTarget: (initialData?.macronutrientTargets as any)?.carbs ?? 200,
    fatsTarget: (initialData?.macronutrientTargets as any)?.fats ?? 60,
    mealsPerDay: initialData?.mealsPerDay ?? 3,
    mealTimeBreakfast: (initialData?.preferredMealTimes as any)?.breakfast ?? "08:00",
    mealTimeLunch: (initialData?.preferredMealTimes as any)?.lunch ?? "13:00",
    mealTimeDinner: (initialData?.preferredMealTimes as any)?.dinner ?? "19:00",

    // Timezone
    timezone: initialData?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  });

  const [dislikedIngredientsInput, setDislikedIngredientsInput] = useState(() =>
    arrayToCommaSeparatedInput(initialData?.dislikedIngredients)
  );
  const [cuisinePreferencesInput, setCuisinePreferencesInput] = useState(() =>
    arrayToCommaSeparatedInput(initialData?.cuisinePreferences)
  );

  const dislikedSyncKey = useMemo(
    () => JSON.stringify(initialData?.dislikedIngredients ?? null),
    [initialData?.dislikedIngredients]
  );
  const cuisineSyncKey = useMemo(
    () => JSON.stringify(initialData?.cuisinePreferences ?? null),
    [initialData?.cuisinePreferences]
  );
  const restrictionsSyncKey = useMemo(() => {
    const merged = mergeProfileRestrictionLists(initialData?.dietaryRestrictions, initialData?.allergies);
    return JSON.stringify([...merged].sort());
  }, [initialData?.dietaryRestrictions, initialData?.allergies]);

  useEffect(() => {
    setDislikedIngredientsInput(arrayToCommaSeparatedInput(initialData?.dislikedIngredients));
  }, [dislikedSyncKey]);

  useEffect(() => {
    setCuisinePreferencesInput(arrayToCommaSeparatedInput(initialData?.cuisinePreferences));
  }, [cuisineSyncKey]);

  useEffect(() => {
    const merged = mergeProfileRestrictionLists(initialData?.dietaryRestrictions, initialData?.allergies);
    setFormData((prev) => ({
      ...prev,
      dietaryRestrictions: merged,
      allergies: [...merged],
    }));
  }, [restrictionsSyncKey]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // Convert to standard units for validation
    const heightCm = formData.height ? convertHeightToCm(Number(formData.height), formData.heightUnit) : 0;
    const weightKg = formData.weight ? convertWeightToKg(Number(formData.weight), formData.weightUnit) : 0;

    if (!formData.dateOfBirth) {
      errors.dateOfBirth = "Date of birth is required";
    } else {
      const birthDate = new Date(formData.dateOfBirth);
      const today = new Date();
      if (birthDate > today) {
        errors.dateOfBirth = "Date of birth cannot be in the future";
      } else {
        const age = today.getFullYear() - birthDate.getFullYear();
        if (age < 13) {
          errors.dateOfBirth = "You must be at least 13 years old to use this platform";
        } else if (age > 120) {
          errors.dateOfBirth = "Please enter a valid age (max 120 years)";
        }
      }
    }
    if (!formData.gender) {
      errors.gender = "Gender is required";
    }
    if (!formData.height) {
      errors.height = "Height is required";
    } else if (heightCm < 50 || heightCm > 300) {
      if (formData.heightUnit === "cm") errors.height = "Height must be between 50cm and 300cm";
      else if (formData.heightUnit === "m") errors.height = "Height must be between 0.5m and 3m";
      else if (formData.heightUnit === "ft") errors.height = "Height must be between 1.6ft and 9.8ft";
      else if (formData.heightUnit === "in") errors.height = "Height must be between 19.7in and 118.1in";
    }
    if (!formData.weight) {
      errors.weight = "Weight is required";
    } else if (weightKg < 20 || weightKg > 500) {
      if (formData.weightUnit === "kg") errors.weight = "Weight must be between 20kg and 500kg";
      else if (formData.weightUnit === "lb") errors.weight = "Weight must be between 44lb and 1102lb";
      else if (formData.weightUnit === "g") errors.weight = "Weight must be between 20,000g and 500,000g";
    }
    if (!formData.activityLevel) {
      errors.activityLevel = "Activity level is required";
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setError("Please fill in all required fields correctly");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validate before submitting
    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // Convert to standard units (normalization will happen on backend, but we can do it here too)
      const heightCm = convertHeightToCm(Number(formData.height), formData.heightUnit);
      const weightKg = convertWeightToKg(Number(formData.weight), formData.weightUnit);

      const payload = {
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        heightCm,
        weightKg,
        activityLevel: formData.activityLevel,
        occupation: formData.occupation || undefined,
        dietaryPreferences: formData.dietaryPreferences,
        dietaryRestrictions: formData.dietaryRestrictions,
        allergies: formData.allergies,
        dislikedIngredients: commaSeparatedInputToArray(dislikedIngredientsInput),
        cuisinePreferences: commaSeparatedInputToArray(cuisinePreferencesInput),
        calorieTarget: formData.calorieTarget,
        macronutrientTargets: {
          protein: formData.proteinTarget,
          carbs: formData.carbsTarget,
          fats: formData.fatsTarget,
        },
        mealsPerDay: formData.mealsPerDay,
        preferredMealTimes: {
          breakfast: formData.mealTimeBreakfast,
          lunch: formData.mealTimeLunch,
          dinner: formData.mealTimeDinner,
        },
        timezone: formData.timezone,
      };

      if (onSubmit) {
        await onSubmit(payload);
      } else {
        // Default: submit to API
        const response = await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to save profile");
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

  const togglePreference = (pref: string) => {
    setFormData((prev) => ({
      ...prev,
      dietaryPreferences: prev.dietaryPreferences.includes(pref)
        ? prev.dietaryPreferences.filter((p: string) => p !== pref)
        : [...prev.dietaryPreferences, pref],
    }));
  };

  /** Task 2: one UI for restrictions + allergies; both arrays stay identical for meal planning / recipe filters. */
  const toggleSyncedFoodRestriction = (code: string) => {
    setFormData((prev) => {
      const merged = new Set(mergeProfileRestrictionLists(prev.dietaryRestrictions, prev.allergies));
      if (merged.has(code)) merged.delete(code);
      else merged.add(code);
      const arr = Array.from(merged);
      return { ...prev, dietaryRestrictions: arr, allergies: arr };
    });
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
            ✓ Profile saved successfully!
          </p>
        </div>
      )}

      {/* Demographics Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Demographics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <DateInput
              label="Date of Birth *"
              value={formData.dateOfBirth}
              onChange={(value) => {
                setFormData({ ...formData, dateOfBirth: value });
                if (fieldErrors.dateOfBirth) {
                  setFieldErrors({ ...fieldErrors, dateOfBirth: "" });
                }
              }}
              required
              className="rounded-lg"
            />
            {fieldErrors.dateOfBirth && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldErrors.dateOfBirth}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Gender <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.gender}
              onChange={(e) => {
                setFormData({ ...formData, gender: e.target.value });
                if (fieldErrors.gender) {
                  setFieldErrors({ ...fieldErrors, gender: "" });
                }
              }}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${fieldErrors.gender ? "border-red-500 dark:border-red-500" : "border-gray-300 dark:border-gray-600"
                }`}
              required
            >
              <option value="">Select...</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
            {fieldErrors.gender && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldErrors.gender}</p>
            )}
          </div>
        </div>
      </div>

      {/* Physical Metrics Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Physical Metrics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Height <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.1"
                min="0"
                value={formData.height}
                onChange={(e) => {
                  setFormData({ ...formData, height: e.target.value });
                  if (fieldErrors.height) {
                    setFieldErrors({ ...fieldErrors, height: "" });
                  }
                }}
                className={`flex-1 px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${fieldErrors.height ? "border-red-500 dark:border-red-500" : "border-gray-300 dark:border-gray-600"
                  }`}
                placeholder={
                  formData.heightUnit === "cm" ? "175" :
                    formData.heightUnit === "m" ? "1.75" :
                      formData.heightUnit === "ft" ? "5.7" :
                        "69"
                }
                required
              />
              <select
                value={formData.heightUnit}
                onChange={(e) =>
                  setFormData({ ...formData, heightUnit: e.target.value as any })
                }
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="cm">cm</option>
                <option value="m">m</option>
                <option value="ft">ft</option>
                <option value="in">in</option>
              </select>
            </div>
            {fieldErrors.height && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldErrors.height}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Weight <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.1"
                min="0"
                value={formData.weight}
                onChange={(e) => {
                  setFormData({ ...formData, weight: e.target.value });
                  if (fieldErrors.weight) {
                    setFieldErrors({ ...fieldErrors, weight: "" });
                  }
                }}
                className={`flex-1 px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${fieldErrors.weight ? "border-red-500 dark:border-red-500" : "border-gray-300 dark:border-gray-600"
                  }`}
                placeholder={
                  formData.weightUnit === "kg" ? "70" :
                    formData.weightUnit === "lb" ? "154" :
                      "70000"
                }
                required
              />
              <select
                value={formData.weightUnit}
                onChange={(e) =>
                  setFormData({ ...formData, weightUnit: e.target.value as any })
                }
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="kg">kg</option>
                <option value="lb">lb</option>
                <option value="g">g</option>
              </select>
            </div>
            {fieldErrors.weight && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldErrors.weight}</p>
            )}
          </div>
        </div>
      </div>

      {/* Lifestyle Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Lifestyle
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Activity Level <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.activityLevel}
              onChange={(e) => {
                setFormData({ ...formData, activityLevel: e.target.value });
                if (fieldErrors.activityLevel) {
                  setFieldErrors({ ...fieldErrors, activityLevel: "" });
                }
              }}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${fieldErrors.activityLevel ? "border-red-500 dark:border-red-500" : "border-gray-300 dark:border-gray-600"
                }`}
              required
            >
              <option value="">Select...</option>
              <option value="SEDENTARY">Sedentary</option>
              <option value="LIGHT">Light</option>
              <option value="MODERATE">Moderate</option>
              <option value="ACTIVE">Active</option>
              <option value="VERY_ACTIVE">Very Active</option>
            </select>
            {fieldErrors.activityLevel && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldErrors.activityLevel}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Occupation (Optional)
            </label>
            <input
              type="text"
              value={formData.occupation}
              onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="e.g., Software Developer"
            />
          </div>
        </div>
      </div>

      {/* Dietary preferences (Task 2: ≥15 options from shared enum) */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Dietary preferences
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          General eating style (e.g. vegetarian, keto). Used for meal plans and recipe suggestions.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {DIETARY_PREFERENCES.map((pref) => (
            <label
              key={pref}
              className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <input
                type="checkbox"
                checked={formData.dietaryPreferences.includes(pref)}
                onChange={() => togglePreference(pref)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                {pref.replace(/_/g, " ")}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Restrictions & intolerances (Task 2: ≥10 options; single list, stored as restrictions + allergies) */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Restrictions, allergies & intolerances
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Select everything that applies. This list is saved once and used everywhere (recipe filters, meal planning,
          shopping). Medical allergies and dietary restrictions you follow share the same options so you do not enter
          them twice.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {DIETARY_RESTRICTIONS.map((restriction) => (
            <label
              key={restriction}
              className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <input
                type="checkbox"
                checked={formData.dietaryRestrictions.includes(restriction)}
                onChange={() => toggleSyncedFoodRestriction(restriction)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                {restriction.replace(/_/g, " ")}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Task 2: targets, timing, dislikes, cuisines — no duplicate allergy UI */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Meal planning & nutrition targets
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Calorie and macro targets, meal rhythm, ingredients and cuisines to steer AI meal plans (Task 2).
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Disliked ingredients (comma-separated)</label>
            <input
              type="text"
              value={dislikedIngredientsInput}
              onChange={(e) => setDislikedIngredientsInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="e.g. cilantro, liver"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cuisine preferences (comma-separated)</label>
            <input
              type="text"
              value={cuisinePreferencesInput}
              onChange={(e) => setCuisinePreferencesInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="e.g. Italian, Japanese"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Daily calorie target (kcal)</label>
              <input
                type="number"
                min={800}
                max={6000}
                value={formData.calorieTarget}
                onChange={(e) => setFormData({ ...formData, calorieTarget: Number(e.target.value) || 2000 })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meals per day</label>
              <input
                type="number"
                min={1}
                max={10}
                value={formData.mealsPerDay}
                onChange={(e) => setFormData({ ...formData, mealsPerDay: Number(e.target.value) || 3 })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Protein (g)</label>
              <input type="number" min={0} max={500} value={formData.proteinTarget} onChange={(e) => setFormData({ ...formData, proteinTarget: Number(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Carbs (g)</label>
              <input type="number" min={0} max={1000} value={formData.carbsTarget} onChange={(e) => setFormData({ ...formData, carbsTarget: Number(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fats (g)</label>
              <input type="number" min={0} max={500} value={formData.fatsTarget} onChange={(e) => setFormData({ ...formData, fatsTarget: Number(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Breakfast time</label>
              <input type="time" value={formData.mealTimeBreakfast} onChange={(e) => setFormData({ ...formData, mealTimeBreakfast: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lunch time</label>
              <input type="time" value={formData.mealTimeLunch} onChange={(e) => setFormData({ ...formData, mealTimeLunch: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dinner time</label>
              <input type="time" value={formData.mealTimeDinner} onChange={(e) => setFormData({ ...formData, mealTimeDinner: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </form>
  );
}

// Helper functions for unit conversion
function convertHeightToCm(value: number, unit: string): number {
  switch (unit) {
    case "cm":
      return value;
    case "m":
      return value * 100;
    case "ft":
      return value * 30.48;
    case "in":
      return value * 2.54;
    default:
      return value;
  }
}

function convertWeightToKg(value: number, unit: string): number {
  switch (unit) {
    case "kg":
      return value;
    case "lb":
      return value * 0.453592;
    case "g":
      return value / 1000;
    default:
      return value;
  }
}

