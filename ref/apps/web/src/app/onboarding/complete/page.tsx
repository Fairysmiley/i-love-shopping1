"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { HealthProfileForm } from "@/components/HealthProfileForm";
import { FitnessAssessmentForm } from "@/components/FitnessAssessmentForm";
import { GoalsForm } from "@/components/GoalsForm";

type OnboardingStep = "profile" | "fitness" | "goals" | "complete";

export default function CompleteOnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("profile");
  const [profileData, setProfileData] = useState<any>(null);
  const [assessmentData, setAssessmentData] = useState<any>(null);
  const [goalsData, setGoalsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadExistingData = async () => {
      try {
        const [profileRes, assessmentRes, goalsRes] = await Promise.all([
          fetch("/api/profile"),
          fetch("/api/fitness-assessment"),
          fetch("/api/goals"),
        ]);

        if (profileRes.ok) {
          const data = await profileRes.json();
          setProfileData(data.profile);
        }

        if (assessmentRes.ok) {
          const data = await assessmentRes.json();
          setAssessmentData(data.assessment);
        }

        if (goalsRes.ok) {
          const data = await goalsRes.json();
          setGoalsData(data.goals || []);
        }
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadExistingData();
  }, []);

  const steps = [
    { id: "profile", title: "Health Profile", description: "Basic information and metrics" },
    { id: "fitness", title: "Fitness Assessment", description: "Current activity and fitness level" },
    { id: "goals", title: "Goals", description: "What you want to achieve" },
    { id: "complete", title: "Complete", description: "You're all set!" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  const handleProfileSubmit = async (data: any) => {
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        setProfileData(result.profile);
        setCurrentStep("fitness");
      } else {
        const result = await response.json();
        throw new Error(result.error || "Failed to save profile");
      }
    } catch (error) {
      throw error;
    }
  };

  const handleAssessmentSubmit = async (data: any) => {
    try {
      const response = await fetch("/api/fitness-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        setAssessmentData(result.assessment);
        setCurrentStep("goals");
      } else {
        const result = await response.json();
        throw new Error(result.error || "Failed to save assessment");
      }
    } catch (error) {
      throw error;
    }
  };

  const handleGoalSubmit = async (data: any) => {
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        setGoalsData([...goalsData, result.goal]);
        // Don't auto-advance, let user add multiple goals
      } else {
        const result = await response.json();
        throw new Error(result.error || "Failed to save goal");
      }
    } catch (error) {
      throw error;
    }
  };

  const handleComplete = () => {
    router.push("/dashboard");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Progress Bar */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                      index <= currentStepIndex
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {index < currentStepIndex ? "✓" : index + 1}
                  </div>
                  <div className="mt-2 text-center">
                    <p
                      className={`text-xs font-medium ${
                        index <= currentStepIndex
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {step.title}
                    </p>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      index < currentStepIndex
                        ? "bg-blue-600"
                        : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          {currentStep === "profile" && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Health Profile
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Let's start with your basic health information
              </p>
              <HealthProfileForm
                onSubmit={handleProfileSubmit}
                initialData={profileData}
                showMockIndicator={false}
              />
            </div>
          )}

          {currentStep === "fitness" && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Fitness Assessment
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Tell us about your current fitness level and activity
              </p>
              <FitnessAssessmentForm
                onSubmit={handleAssessmentSubmit}
                initialData={assessmentData}
                showMockIndicator={false}
              />
              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setCurrentStep("profile")}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                >
                  ← Back
                </button>
              </div>
            </div>
          )}

          {currentStep === "goals" && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Fitness Goals
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                What do you want to achieve? You can add multiple goals.
              </p>
              <GoalsForm
                onSubmit={handleGoalSubmit}
                initialData={goalsData}
                showMockIndicator={false}
              />
              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setCurrentStep("fitness")}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                >
                  ← Back
                </button>
                <button
                  onClick={handleComplete}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                >
                  Complete Onboarding →
                </button>
              </div>
            </div>
          )}

          {currentStep === "complete" && (
            <div className="text-center py-12">
              <div className="mb-6">
                <div className="mx-auto w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                  <svg
                    className="w-12 h-12 text-green-600 dark:text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                Welcome to Your Wellness Journey!
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
                Your profile is complete. You can now access your personalized dashboard and insights.
              </p>
              <button
                onClick={handleComplete}
                className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-lg"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



