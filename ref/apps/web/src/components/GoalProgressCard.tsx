"use client";

import { ProgressBar } from "./ProgressBar";
import { TargetIcon, MuscleIcon, RunningIcon, TimerIcon, FlexibilityIcon, WeightLossIcon } from "@/components/icons";

import { formatDateEuropean } from "@/lib/date-utils";

interface GoalProgressCardProps {
  goal: {
    id: string;
    type: string;
    targetValue: number | null;
    unit?: string;
    currentValue?: number;
    createdAt: string | Date;
  };
  projectedCompletionDate?: Date;
}

/**
 * Goal Progress Card Component
 * Shows goal progress with projected completion date
 */
export function GoalProgressCard({ goal, projectedCompletionDate }: GoalProgressCardProps) {
  const goalTypeLabels: Record<string, string> = {
    WEIGHT_LOSS: "Weight Loss",
    MUSCLE_GAIN: "Muscle Gain",
    GENERAL_FITNESS: "General Fitness",
    ENDURANCE: "Endurance",
    FLEXIBILITY: "Flexibility",
  };

  const goalIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    WEIGHT_LOSS: WeightLossIcon,
    MUSCLE_GAIN: MuscleIcon,
    GENERAL_FITNESS: RunningIcon,
    ENDURANCE: TimerIcon,
    FLEXIBILITY: FlexibilityIcon,
  };

  const calculateProgress = () => {
    if (!goal.targetValue || !goal.currentValue) return 0;

    // For weight loss, progress is relative to start weight
    if (goal.type === "WEIGHT_LOSS") {
      const startWeight = (goal as any).startingWeight || (goal.currentValue + 5); // Fallback to +5kg if no start weight
      const totalToLose = startWeight - goal.targetValue;
      if (totalToLose <= 0) return goal.currentValue <= goal.targetValue ? 100 : 0;
      const lost = startWeight - goal.currentValue;
      return Math.max(0, Math.min(100, (lost / totalToLose) * 100));
    }

    // For other goals, direct progress
    return Math.min(100, (goal.currentValue / goal.targetValue) * 100);
  };

  const progress = calculateProgress();
  const daysSinceStart = Math.floor(
    (new Date().getTime() - new Date(goal.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Calculate projected completion
  const calculateProjectedDate = () => {
    if (!projectedCompletionDate) {
      if (progress === 0 || daysSinceStart === 0) return null;

      const progressPerDay = progress / daysSinceStart;
      if (progressPerDay <= 0) return null;

      const remainingProgress = 100 - progress;
      const daysRemaining = remainingProgress / progressPerDay;

      const projected = new Date();
      projected.setDate(projected.getDate() + daysRemaining);
      return projected;
    }
    return projectedCompletionDate;
  };

  const projected = calculateProjectedDate();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {(() => {
            const IconComponent = goalIcons[goal.type] || TargetIcon;
            return <IconComponent className="w-8 h-8 text-blue-600 dark:text-blue-400" />;
          })()}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {goalTypeLabels[goal.type] || goal.type}
            </h3>
            {goal.targetValue && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Target: {Number(goal.targetValue).toLocaleString(undefined, { maximumFractionDigits: 1 })} {goal.unit || ""}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {progress.toFixed(0)}%
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Complete
          </div>
        </div>
      </div>

      <ProgressBar
        label=""
        value={progress}
        max={100}
        color="blue"
        size="md"
        showPercentage={false}
      />

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-gray-600 dark:text-gray-400">Current</div>
          <div className="font-medium text-gray-900 dark:text-white">
            {goal.currentValue !== undefined
              ? `${Number(goal.currentValue).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${goal.unit || ""}`
              : "N/A"}
          </div>
        </div>
        <div>
          <div className="text-gray-600 dark:text-gray-400">Days Active</div>
          <div className="font-medium text-gray-900 dark:text-white">
            {daysSinceStart} days
          </div>
        </div>
      </div>

      {projected && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600 dark:text-gray-400">Projected Completion:</span>
            <span className="font-medium text-blue-600 dark:text-blue-400">
              {formatDateEuropean(projected)}
            </span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Based on current progress rate
          </div>
        </div>
      )}
    </div>
  );
}

