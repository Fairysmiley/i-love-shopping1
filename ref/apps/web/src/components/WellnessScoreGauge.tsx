"use client";

import { useState } from "react";
import { FireIcon, MuscleIcon, SparklesIcon, TargetIcon, ChartIcon, LightbulbIcon, InlineIcon } from "@/components/icons";

interface WellnessScoreGaugeProps {
  score: number;
  size?: number;
  showBreakdown?: boolean;
  breakdown?: {
    bmiScore: number;
    activityScore: number;
    progressScore: number;
    habitsScore: number;
  };
  bmiValue?: number; // Actual BMI value (e.g., 20.8) to display alongside BMI Score
  showInfo?: boolean; // Show info tooltip explaining the score
  // Motivational weight progress data
  weightProgress?: {
    currentWeight: number;
    startingWeight: number;
    targetWeight?: number;
    weeklyChange?: number;
  };
}

// Info icon component
function InfoIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-4 h-4 ${className}`}
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// BMI Score Tooltip Component
function BMIScoreTooltip({ bmiValue, bmiScore }: { bmiValue?: number; bmiScore: number }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const getScoreExplanation = () => {
    if (bmiValue === undefined) {
      return "BMI Score is calculated from your BMI value. A healthy BMI (18.5-25) gives the highest scores (80-100 points).";
    }

    if (bmiValue >= 18.5 && bmiValue < 25) {
      return `Your BMI of ${bmiValue.toFixed(1)} is in the healthy range (18.5-25), which gives you a high BMI Score. The closer to the center (21.75), the higher your score.`;
    } else if (bmiValue < 18.5) {
      return `Your BMI of ${bmiValue.toFixed(1)} is below the healthy range. BMI Score increases as you get closer to 18.5.`;
    } else if (bmiValue < 30) {
      return `Your BMI of ${bmiValue.toFixed(1)} is in the overweight range (25-30). BMI Score increases as you get closer to 25.`;
    } else {
      return `Your BMI of ${bmiValue.toFixed(1)} is in the obese range (30+). BMI Score increases as you get closer to 30, then 25.`;
    }
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-help"
        aria-label="BMI Score explanation"
      >
        <InfoIcon className="w-4 h-4" />
      </button>
      {showTooltip && (
        <div className="absolute z-20 left-0 top-6 w-80 p-4 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 text-xs">
          <p className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <TargetIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            BMI Score (0-100)
          </p>
          <p className="text-gray-600 dark:text-gray-300 mb-3">
            BMI Score is a 0-100 score calculated from your actual BMI value. It measures how close your BMI is to the healthy range.
          </p>
          <div className="space-y-2 text-gray-600 dark:text-gray-300 mb-3">
            <p className="font-medium">How it's calculated:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Healthy BMI (18.5-25):</strong> Scores 80-100 points</li>
              <li><strong>Underweight (&lt;18.5):</strong> Scores decrease the further below 18.5</li>
              <li><strong>Overweight (25-30):</strong> Scores 40-80 points</li>
              <li><strong>Obese (≥30):</strong> Scores decrease the further above 30</li>
            </ul>
          </div>
          <p className="text-gray-600 dark:text-gray-300 border-t border-gray-200 dark:border-gray-600 pt-2">
            {getScoreExplanation()}
          </p>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-xs">
            Your current BMI Score: <strong>{bmiScore}</strong> / 100
          </p>
        </div>
      )}
    </div>
  );
}

export function WellnessScoreGauge({
  score,
  size = 200,
  showBreakdown = false,
  breakdown,
  bmiValue,
  showInfo = true,
  weightProgress,
}: WellnessScoreGaugeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Calculate total weight lost
  const totalWeightLost = weightProgress
    ? weightProgress.startingWeight - weightProgress.currentWeight
    : 0;

  // Get motivational message based on progress
  const getMotivationalMessage = () => {
    if (!weightProgress) return null;
    if (totalWeightLost > 5) return { text: "Amazing progress!", icon: FireIcon, color: "text-orange-500" };
    if (totalWeightLost > 2) return { text: "Great job, keep it up!", icon: MuscleIcon, color: "text-blue-500" };
    if (totalWeightLost > 0) return { text: "You're on the right track!", icon: SparklesIcon, color: "text-purple-500" };
    if (totalWeightLost === 0) return { text: "Start your journey!", icon: TargetIcon, color: "text-green-500" };
    return { text: "Building muscle?", icon: ChartIcon, color: "text-indigo-500" };
  };
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  // Color based on score
  const getColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-blue-500";
    if (score >= 40) return "text-yellow-500";
    return "text-red-500";
  };

  const getStrokeColor = (score: number) => {
    if (score >= 80) return "stroke-green-500";
    if (score >= 60) return "stroke-blue-500";
    if (score >= 40) return "stroke-yellow-500";
    return "stroke-red-500";
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth="12"
            fill="none"
            className="text-gray-200 dark:text-gray-700"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth="12"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={getStrokeColor(score)}
            style={{
              transition: "stroke-dashoffset 0.5s ease-in-out",
            }}
          />
        </svg>
        {/* Score text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold ${getColor(score)}`}>
            {score}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            / 100
          </span>
        </div>
      </div>

      {showBreakdown && breakdown && (
        <div className="mt-6 w-full space-y-3">
          {/* Info tooltip */}
          {showInfo && (
            <div className="relative mb-4">
              <button
                type="button"
                onClick={() => setShowTooltip(!showTooltip)}
                onBlur={() => setTimeout(() => setShowTooltip(false), 200)}
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <InfoIcon />
                How is this calculated?
              </button>

              {showTooltip && (
                <div className="absolute z-10 left-0 top-6 w-80 p-4 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 text-xs">
                  <p className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <TargetIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Wellness Score (0-100)
                  </p>
                  <p className="text-green-600 dark:text-green-400 font-medium mb-2">
                    Higher score = Better health! Aim for 100.
                  </p>
                  <ul className="space-y-1.5 text-gray-600 dark:text-gray-300">
                    <li><strong>BMI Score (30%)</strong> — A 0-100 score calculated from your BMI. Healthy BMI (18.5-25) gives 80-100 points. Hover over the info icon next to "BMI Score" for details.</li>
                    <li><strong>Activity (30%)</strong> — More active = higher score</li>
                    <li><strong>Progress (20%)</strong> — Closer to goals = higher score</li>
                    <li><strong>Habits (20%)</strong> — Consistent tracking = higher score</li>
                  </ul>
                  <p className="mt-3 text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600 pt-2 flex items-start gap-2">
                    <LightbulbIcon className="w-4 h-4 text-yellow-500 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <span>Improve your score by reaching a healthy BMI, being more active, achieving goals, and logging progress regularly.</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Weight Progress - Motivational Section */}
          {weightProgress && (() => {
            const message = getMotivationalMessage();
            return (
              <div className="space-y-3 pb-3 border-b border-gray-200 dark:border-gray-700">
                {message && (() => {
                  const Icon = message.icon;
                  return (
                    <p className="text-center text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-center gap-2">
                      <Icon className={`w-5 h-5 ${message.color}`} />
                      <span>{message.text}</span>
                    </p>
                  );
                })()}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Total Progress</span>
                  <span className={`font-bold text-lg ${totalWeightLost > 0 ? 'text-green-600 dark:text-green-400' : totalWeightLost < 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600'}`}>
                    {totalWeightLost > 0 ? '-' : totalWeightLost < 0 ? '+' : ''}{Math.abs(totalWeightLost).toFixed(1)} kg
                  </span>
                </div>

                {weightProgress.weeklyChange != null && weightProgress.weeklyChange !== 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">This Week</span>
                    <span className={`font-semibold ${weightProgress.weeklyChange < 0 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>
                      {weightProgress.weeklyChange < 0 ? '' : '+'}{weightProgress.weeklyChange.toFixed(1)} kg
                    </span>
                  </div>
                )}

                {weightProgress.targetWeight && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">To Goal</span>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {(weightProgress.currentWeight - weightProgress.targetWeight).toFixed(1)} kg left
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Score Breakdown */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <span>BMI Score</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">(30%)</span>
                {bmiValue !== undefined && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                    (BMI: {bmiValue.toFixed(1)})
                  </span>
                )}
                <BMIScoreTooltip bmiValue={bmiValue} bmiScore={breakdown.bmiScore} />
              </span>
              <span className="font-semibold text-gray-900 dark:text-white">{breakdown.bmiScore.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                Activity
                <span className="text-xs text-gray-400 dark:text-gray-500">(30%)</span>
              </span>
              <span className="font-semibold text-gray-900 dark:text-white">{breakdown.activityScore.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                Progress
                <span className="text-xs text-gray-400 dark:text-gray-500">(20%)</span>
              </span>
              <span className="font-semibold text-gray-900 dark:text-white">{breakdown.progressScore.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                Habits
                <span className="text-xs text-gray-400 dark:text-gray-500">(20%)</span>
              </span>
              <span className="font-semibold text-gray-900 dark:text-white">{breakdown.habitsScore.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

