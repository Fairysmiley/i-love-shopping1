"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DateInput } from "@/components/DateInput";
import { DIETARY_PREFERENCES, DIETARY_RESTRICTIONS, DIETARY_PREFERENCE_EXPLANATIONS } from "@wellness-app/shared";
import { WeightLossIcon, MuscleIcon, RunningIcon, TimerIcon, FlexibilityIcon } from "@/components/icons";

type Step = "demographics" | "physical" | "lifestyle" | "dietary" | "goals";

// Component for dietary preference button with tooltip
function DietaryPreferenceButton({
  preference,
  explanation,
  isSelected,
  isNone,
  onClick
}: {
  preference: string;
  explanation?: string;
  isSelected: boolean;
  isNone: boolean;
  onClick: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative group">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        className={`w-full px-3 py-2 text-sm border rounded-md transition cursor-pointer flex items-center justify-between ${isSelected
          ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
          : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          }`}
      >
        <span>{preference.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</span>
        {explanation && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowTooltip(!showTooltip);
            }}
            className="ml-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
      {showTooltip && explanation && (
        <div className="absolute z-10 left-0 top-full mt-1 w-64 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 text-xs">
          <p className="text-gray-900 dark:text-white">{explanation}</p>
        </div>
      )}
    </div>
  );
}

function ProfileOnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get("edit") === "true";
  const [currentStep, setCurrentStep] = useState<Step>("demographics");
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [prefillNotice, setPrefillNotice] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    // Demographics
    dateOfBirth: "",
    gender: "" as "male" | "female" | "other" | "prefer_not_to_say" | "",

    // Physical
    heightCm: "",
    weightKg: "",

    // Lifestyle
    activityLevel: "" as "SEDENTARY" | "LIGHT" | "MODERATE" | "ACTIVE" | "VERY_ACTIVE" | "",
    occupation: "",

    // Dietary
    dietaryPreferences: [] as string[],
    dietaryRestrictions: [] as string[],

    // Goals
    primaryGoal: "" as "WEIGHT_LOSS" | "MUSCLE_GAIN" | "GENERAL_FITNESS" | "ENDURANCE" | "FLEXIBILITY" | "",
    goalTargetValue: "",
    goalUnit: "kg",

    // Timezone
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });

  // Load existing profile data on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        // First check if profile is already complete (only redirect if not in edit mode)
        if (!isEditMode) {
          const profileCheckRes = await fetch("/api/profile/check-complete");
          if (profileCheckRes.ok) {
            const profileCheckData = await profileCheckRes.json();
            if (profileCheckData.isComplete) {
              // Profile is already complete, redirect to dashboard (unless editing)
              router.push("/dashboard");
              return;
            }
          }
        }

        const [profileRes, goalsRes] = await Promise.all([
          fetch("/api/profile"),
          fetch("/api/goals"),
        ]);

        const profileJson = profileRes.ok ? await profileRes.json() : null;
        const profile = profileJson?.profile ?? null;
        const goalsJson = goalsRes.ok ? await goalsRes.json() : null;
        const firstGoal = goalsJson?.goals?.[0] ?? null;

        if (profile) {
          if (profile.dateOfBirth) setPrefillNotice(true);
          setFormData({
            dateOfBirth: profile.dateOfBirth ? new Date(profile.dateOfBirth).toISOString().split("T")[0] : "",
            gender: profile.gender || "",
            heightCm: profile.heightCm ? String(profile.heightCm) : "",
            weightKg: profile.weightKg ? String(profile.weightKg) : "",
            activityLevel: profile.activityLevel || "",
            occupation: profile.occupation || "",
            dietaryPreferences: profile.dietaryPreferences || [],
            dietaryRestrictions: profile.dietaryRestrictions || [],
            primaryGoal: firstGoal?.type ?? "",
            goalTargetValue:
              firstGoal?.targetValue != null &&
              (firstGoal.type === "WEIGHT_LOSS" || firstGoal.type === "MUSCLE_GAIN")
                ? String(firstGoal.targetValue)
                : "",
            goalUnit: firstGoal?.unit === "lb" ? "lb" : "kg",
            timezone: profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          });
        } else if (firstGoal) {
          setFormData((prev) => ({
            ...prev,
            primaryGoal: firstGoal.type,
            goalTargetValue:
              firstGoal.targetValue != null &&
              (firstGoal.type === "WEIGHT_LOSS" || firstGoal.type === "MUSCLE_GAIN")
                ? String(firstGoal.targetValue)
                : prev.goalTargetValue,
            goalUnit: firstGoal.unit === "lb" ? "lb" : "kg",
          }));
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, [router]);

  const steps: { id: Step; title: string; description: string }[] = [
    { id: "demographics", title: "About You", description: "Basic demographics" },
    { id: "physical", title: "Physical Metrics", description: "Height and weight" },
    { id: "lifestyle", title: "Lifestyle", description: "Activity and occupation" },
    { id: "dietary", title: "Dietary Preferences", description: "Food preferences and restrictions" },
    { id: "goals", title: "Fitness Goals", description: "What you want to achieve" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  if (loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const validateCurrentStep = (): boolean => {
    setError("");
    const errors: Record<string, string> = {};

    switch (currentStep) {
      case "demographics":
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
          errors.gender = "Please select your gender";
        }
        break;
      case "physical":
        if (!formData.heightCm) {
          errors.heightCm = "Height is required";
        } else {
          const height = parseFloat(formData.heightCm);
          if (isNaN(height) || height < 50 || height > 300) {
            errors.heightCm = "Height must be between 50-300 cm";
          }
        }
        if (!formData.weightKg) {
          errors.weightKg = "Weight is required";
        } else {
          const weight = parseFloat(formData.weightKg);
          if (isNaN(weight) || weight < 20 || weight > 500) {
            errors.weightKg = "Weight must be between 20-500 kg";
          }
        }
        break;
      case "lifestyle":
        if (!formData.activityLevel) {
          errors.activityLevel = "Please select your activity level";
        }
        break;
      case "goals":
        if (!formData.primaryGoal) {
          errors.primaryGoal = "Please select a fitness goal";
        } else if (
          (formData.primaryGoal === "WEIGHT_LOSS" || formData.primaryGoal === "MUSCLE_GAIN") &&
          !formData.goalTargetValue
        ) {
          errors.goalTargetValue = "Please enter your target weight";
        } else if (
          (formData.primaryGoal === "WEIGHT_LOSS" || formData.primaryGoal === "MUSCLE_GAIN") &&
          formData.goalTargetValue
        ) {
          const target = parseFloat(formData.goalTargetValue);
          if (isNaN(target) || target < 20 || target > 500) {
            errors.goalTargetValue = "Target weight must be between 20-500 kg";
          }
        }
        break;
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      setError(firstError);
      return false;
    }

    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) {
      return;
    }

    if (currentStepIndex < steps.length - 1) {
      setCurrentStep(steps[currentStepIndex + 1].id);
    }
  };

  const handlePrevious = () => {
    setError("");
    setFieldErrors({});
    if (currentStepIndex > 0) {
      setCurrentStep(steps[currentStepIndex - 1].id);
    }
  };

  const handleSubmit = async () => {
    // Validate before submitting
    if (!validateCurrentStep()) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      // Save profile
      const profileResponse = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateOfBirth: formData.dateOfBirth,
          gender: formData.gender,
          heightCm: parseFloat(formData.heightCm),
          weightKg: parseFloat(formData.weightKg),
          activityLevel: formData.activityLevel,
          occupation: formData.occupation,
          dietaryPreferences: formData.dietaryPreferences,
          dietaryRestrictions: formData.dietaryRestrictions,
          timezone: formData.timezone,
        }),
      });

      const profileData = await profileResponse.json();

      if (!profileResponse.ok) {
        throw new Error(profileData.error || "Failed to save profile");
      }

      // Save primary goal if selected
      if (formData.primaryGoal) {
        // Convert target value to kg if needed
        let targetValueKg = parseFloat(formData.goalTargetValue);
        if (formData.goalUnit === "lb" && !isNaN(targetValueKg)) {
          targetValueKg = targetValueKg * 0.453592; // Convert lb to kg
        }

        await fetch("/api/goals", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: formData.primaryGoal,
            targetValue: (formData.primaryGoal === "WEIGHT_LOSS" || formData.primaryGoal === "MUSCLE_GAIN")
              ? targetValueKg
              : undefined,
            unit: (formData.primaryGoal === "WEIGHT_LOSS" || formData.primaryGoal === "MUSCLE_GAIN")
              ? "kg"
              : undefined,
          }),
        });
      }

      // Verify profile is complete before redirecting
      // Check completion status with retries to handle database commit timing
      let isComplete = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const checkRes = await fetch("/api/profile/check-complete");
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.isComplete) {
            isComplete = true;
            break;
          }
        }
      }

      if (isComplete) {
        // If in edit mode, go back to profile page; otherwise go to dashboard
        if (isEditMode) {
          router.replace("/profile?tab=overview");
        } else {
          router.replace("/dashboard"); // Use replace to prevent back button issues
        }
      } else {
        // If still not complete after retries, redirect anyway (shouldn't happen)
        if (isEditMode) {
          router.replace("/profile?tab=overview");
        } else {
          // but let dashboard handle the redirect if needed
          router.replace("/dashboard");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const toggleArrayItem = (array: string[], item: string) => {
    if (array.includes(item)) {
      return array.filter((i: string) => i !== item);
    }
    return [...array, item];
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Step {currentStepIndex + 1} of {steps.length}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {Math.round(((currentStepIndex + 1) / steps.length) * 100)}% Complete
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {steps[currentStepIndex].title}
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            {steps[currentStepIndex].description}
          </p>
          {prefillNotice && (
            <p className="mt-3 text-sm text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
              Your saved profile from Project 1 is pre-filled. Review each step and submit at the end to confirm or update.
            </p>
          )}
        </div>

        {/* Form Content */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8">
          {currentStep === "demographics" && (
            <div className="space-y-6">
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
                  className="rounded-md shadow-sm"
                />
                {fieldErrors.dateOfBirth && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldErrors.dateOfBirth}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Gender <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(["male", "female", "other", "prefer_not_to_say"] as const).map((gender) => (
                    <button
                      key={gender}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, gender });
                        if (fieldErrors.gender) {
                          setFieldErrors({ ...fieldErrors, gender: "" });
                        }
                      }}
                      className={`px-4 py-3 border rounded-md text-sm font-medium transition ${formData.gender === gender
                        ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                        : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        }`}
                    >
                      {gender.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                    </button>
                  ))}
                </div>
                {fieldErrors.gender && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldErrors.gender}</p>
                )}
              </div>
            </div>
          )}

          {currentStep === "physical" && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Height (cm) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.heightCm}
                  onChange={(e) => {
                    setFormData({ ...formData, heightCm: e.target.value });
                    if (fieldErrors.heightCm) {
                      setFieldErrors({ ...fieldErrors, heightCm: "" });
                    }
                  }}
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${fieldErrors.heightCm ? "border-red-500 dark:border-red-500" : "border-gray-300 dark:border-gray-600"
                    }`}
                  placeholder="175"
                  required
                />
                {fieldErrors.heightCm ? (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldErrors.heightCm}</p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Enter your height in centimeters (e.g., 175 cm)
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Weight (kg) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.weightKg}
                  onChange={(e) => {
                    setFormData({ ...formData, weightKg: e.target.value });
                    if (fieldErrors.weightKg) {
                      setFieldErrors({ ...fieldErrors, weightKg: "" });
                    }
                  }}
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${fieldErrors.weightKg ? "border-red-500 dark:border-red-500" : "border-gray-300 dark:border-gray-600"
                    }`}
                  placeholder="70"
                  required
                />
                {fieldErrors.weightKg ? (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldErrors.weightKg}</p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Enter your weight in kilograms (e.g., 70 kg)
                  </p>
                )}
              </div>

              {formData.heightCm && formData.weightKg && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    <strong>Your BMI:</strong>{" "}
                    {(
                      parseFloat(formData.weightKg) /
                      Math.pow(parseFloat(formData.heightCm) / 100, 2)
                    ).toFixed(1)}
                  </p>
                </div>
              )}
            </div>
          )}

          {currentStep === "lifestyle" && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Activity Level <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {([
                    { value: "SEDENTARY", label: "Sedentary", desc: "Little to no exercise" },
                    { value: "LIGHT", label: "Light", desc: "Exercise 1-3 days/week" },
                    { value: "MODERATE", label: "Moderate", desc: "Exercise 3-5 days/week" },
                    { value: "ACTIVE", label: "Active", desc: "Exercise 6-7 days/week" },
                    { value: "VERY_ACTIVE", label: "Very Active", desc: "Intense exercise daily" },
                  ] as const).map((level) => (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, activityLevel: level.value });
                        if (fieldErrors.activityLevel) {
                          setFieldErrors({ ...fieldErrors, activityLevel: "" });
                        }
                      }}
                      className={`w-full text-left px-4 py-3 border rounded-md transition ${formData.activityLevel === level.value
                        ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                        }`}
                    >
                      <div className="font-medium text-gray-900 dark:text-white">{level.label}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{level.desc}</div>
                    </button>
                  ))}
                </div>
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
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Software Engineer, Teacher"
                />
              </div>
            </div>
          )}

          {currentStep === "dietary" && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Dietary Preferences
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DIETARY_PREFERENCES.map((pref) => {
                    const explanation = DIETARY_PREFERENCE_EXPLANATIONS[pref];
                    const isSelected = formData.dietaryPreferences.includes(pref);
                    const isNone = pref === "none_of_the_above";

                    return (
                      <DietaryPreferenceButton
                        key={pref}
                        preference={pref}
                        explanation={explanation}
                        isSelected={isSelected}
                        isNone={isNone}
                        onClick={() => {
                          if (isNone) {
                            // If "none" is selected, clear all other preferences
                            setFormData({
                              ...formData,
                              dietaryPreferences: isSelected ? [] : ["none_of_the_above"],
                            });
                          } else {
                            // If another preference is selected, remove "none" and toggle this one
                            const newPrefs = formData.dietaryPreferences.filter(p => p !== "none_of_the_above");
                            setFormData({
                              ...formData,
                              dietaryPreferences: toggleArrayItem(newPrefs, pref),
                            });
                          }
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Dietary Restrictions & Allergies
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DIETARY_RESTRICTIONS.map((restriction) => (
                    <button
                      key={restriction}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          dietaryRestrictions: toggleArrayItem(
                            formData.dietaryRestrictions,
                            restriction
                          ),
                        })
                      }
                      className={`px-3 py-2 text-sm border rounded-md transition ${formData.dietaryRestrictions.includes(restriction)
                        ? "border-red-600 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
                        : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        }`}
                    >
                      {restriction.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentStep === "goals" && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <p className="text-gray-600 dark:text-gray-400">
                  Select your primary fitness goal. You can add more goals later!
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  <span className="text-red-500">*</span> Required
                </p>
              </div>

              <div className="space-y-3">
                {([
                  { value: "WEIGHT_LOSS", label: "Weight Loss", icon: WeightLossIcon },
                  { value: "MUSCLE_GAIN", label: "Muscle Gain", icon: MuscleIcon },
                  { value: "GENERAL_FITNESS", label: "General Fitness", icon: RunningIcon },
                  { value: "ENDURANCE", label: "Endurance", icon: TimerIcon },
                  { value: "FLEXIBILITY", label: "Flexibility", icon: FlexibilityIcon },
                ] as const).map((goal) => {
                  const IconComponent = goal.icon;
                  return (
                    <button
                      key={goal.value}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, primaryGoal: goal.value });
                        if (fieldErrors.primaryGoal) {
                          setFieldErrors({ ...fieldErrors, primaryGoal: "" });
                        }
                      }}
                      className={`w-full flex items-center gap-4 px-6 py-4 border rounded-lg transition cursor-pointer ${formData.primaryGoal === goal.value
                        ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                        }`}
                    >
                      <IconComponent className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                      <div className="text-left">
                        <div className="font-medium text-gray-900 dark:text-white">{goal.label}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {fieldErrors.primaryGoal && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldErrors.primaryGoal}</p>
              )}

              {/* Target input for weight-based goals */}
              {(formData.primaryGoal === "WEIGHT_LOSS" || formData.primaryGoal === "MUSCLE_GAIN") && (
                <div className="mt-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Target Weight <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <input
                          type="number"
                          step="0.1"
                          min="20"
                          max="500"
                          value={formData.goalTargetValue}
                          onChange={(e) => {
                            setFormData({ ...formData, goalTargetValue: e.target.value });
                            if (fieldErrors.goalTargetValue) {
                              setFieldErrors({ ...fieldErrors, goalTargetValue: "" });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          placeholder={formData.primaryGoal === "WEIGHT_LOSS" ? "e.g., 65" : "e.g., 75"}
                        />
                        {fieldErrors.goalTargetValue && (
                          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldErrors.goalTargetValue}</p>
                        )}
                      </div>
                      <div>
                        <select
                          value={formData.goalUnit}
                          onChange={(e) => setFormData({ ...formData, goalUnit: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="kg">kg</option>
                          <option value="lb">lb</option>
                        </select>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {formData.primaryGoal === "WEIGHT_LOSS"
                        ? "Enter your target weight for weight loss"
                        : "Enter your target weight for muscle gain"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="mt-8 flex gap-4">
            {isEditMode && (
              <button
                type="button"
                onClick={() => router.push("/profile?tab=overview")}
                className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              >
                Cancel
              </button>
            )}

            {currentStepIndex > 0 && !isEditMode && (
              <button
                type="button"
                onClick={handlePrevious}
                className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              >
                Previous
              </button>
            )}

            {currentStepIndex < steps.length - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                className={`${isEditMode ? "flex-1" : ""} py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer`}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className={`${isEditMode ? "flex-1" : ""} py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 cursor-pointer`}
              >
                {loading ? "Saving..." : isEditMode ? "Save Changes" : "Complete Profile"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfileOnboarding() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    }>
      <ProfileOnboardingContent />
    </Suspense>
  );
}

