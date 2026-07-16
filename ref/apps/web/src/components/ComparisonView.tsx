"use client";

import { CelebrationIcon } from "@/components/icons";
interface ComparisonViewProps {
  current: {
    weight?: number;
    activityLevel?: string;
    wellnessScore?: number;
    activityFrequency?: number;
    [key: string]: any;
  };
  target: {
    weight?: number;
    activityLevel?: string;
    wellnessScore?: number;
    activityFrequency?: number;
    [key: string]: any;
  };
  period?: "weekly" | "monthly";
}

/**
 * Comparison View Component
 * Shows current vs target metrics with progress indicators
 */
export function ComparisonView({ current, target, period = "weekly" }: ComparisonViewProps) {
  const calculateProgress = (current: number, target: number) => {
    if (target === 0) return 0;
    return Math.min(100, (current / target) * 100);
  };

  const getActivityLevelOrder = (level: string) => {
    const order = ["SEDENTARY", "LIGHT", "MODERATE", "ACTIVE", "VERY_ACTIVE"];
    const index = order.indexOf(level.toUpperCase());
    return index === -1 ? 0 : index;
  };

  const activityProgress =
    current.activityLevel && target.activityLevel
      ? ((getActivityLevelOrder(current.activityLevel) + 1) /
        (getActivityLevelOrder(target.activityLevel) + 1)) *
      100
      : null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-slate-500 dark:text-slate-400 text-xs font-black uppercase tracking-widest">
          Current vs Target ({period.charAt(0).toUpperCase() + period.slice(1)})
        </h3>
        <span className="text-[10px] font-black text-slate-300 dark:text-slate-700 uppercase tracking-widest">Goal Status</span>
      </div>

      <div className="flex flex-col gap-8 flex-1">
        {/* Weight Comparison */}
        {current.weight && target.weight && (
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                Weight Progress
              </span>
              <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                {(() => {
                  const startWeight = current.startingWeight || current.weight;
                  const totalDiff = Math.abs(startWeight - target.weight);
                  if (totalDiff === 0) return "100.0";
                  const currentDiff = Math.abs(startWeight - current.weight);
                  return Math.min(100, (currentDiff / totalDiff) * 100).toFixed(1);
                })()}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100/50 dark:border-slate-700/50">
                <div className="text-2xl font-black text-slate-800 dark:text-slate-100">
                  {Number(current.weight).toFixed(1)} <span className="text-sm font-medium text-slate-400">kg</span>
                </div>
              </div>
              <div className="p-4 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100/50 dark:border-emerald-900/20">
                <div className="text-[10px] font-bold text-emerald-600/70 dark:text-emerald-400/70 uppercase mb-1">Target</div>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {Number(target.weight).toFixed(1)} <span className="text-sm font-medium text-emerald-500/50">kg</span>
                </div>
              </div>
            </div>
            <div className="mt-3 px-1">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight">
                <span className="text-slate-500 dark:text-slate-400">
                  {current.weight > target.weight
                    ? `${(current.weight - target.weight).toFixed(1)} kg to lose`
                    : `${(target.weight - current.weight).toFixed(1)} kg to gain`}
                </span>
                <span className="text-blue-500 dark:text-blue-400/70">
                  {current.weight > target.weight
                    ? `${((current.weight - target.weight) / current.weight * 100).toFixed(1)}% Left`
                    : `${((target.weight - current.weight) / current.weight * 100).toFixed(1)}% Left`}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Weekly Frequency Comparison */}
        {current.activityFrequency !== undefined && target.activityFrequency !== undefined && (
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                Weekly Frequency
              </span>
              <span className="text-xs font-black text-blue-500">
                {calculateProgress(current.activityFrequency, target.activityFrequency).toFixed(0)}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100/50 dark:border-slate-700/50">
                <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Actual</div>
                <div className="text-2xl font-black text-slate-800 dark:text-slate-100">
                  {current.activityFrequency} <span className="text-sm font-medium text-slate-400">days</span>
                </div>
              </div>
              <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100/50 dark:border-blue-900/20">
                <div className="text-[10px] font-bold text-blue-600/70 dark:text-blue-400/70 uppercase mb-1">Target</div>
                <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
                  {target.activityFrequency} <span className="text-sm font-medium text-blue-500/50">days</span>
                </div>
              </div>
            </div>
            <div className="mt-3 px-1">
              <div className="text-[10px] font-bold uppercase tracking-tight text-slate-500 dark:text-slate-400">
                {current.activityFrequency} of {target.activityFrequency} days active this week
              </div>
            </div>
          </div>
        )}

        {/* Wellness Score Comparison */}
        {current.wellnessScore !== undefined && target.wellnessScore !== undefined && (
          <div className="mt-auto">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                Wellness Score
              </span>
              <span className="text-xs font-black text-orange-500">
                {calculateProgress(current.wellnessScore, target.wellnessScore).toFixed(1)}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100/50 dark:border-slate-700/50">
                <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Current</div>
                <div className="text-3xl font-black text-slate-800 dark:text-slate-100">
                  {current.wellnessScore}
                </div>
              </div>
              <div className="p-4 bg-orange-50/50 dark:bg-orange-900/10 rounded-2xl border border-orange-100/50 dark:border-orange-900/20">
                <div className="text-[10px] font-bold text-orange-600/70 dark:text-orange-400/70 uppercase mb-1">Target</div>
                <div className="text-3xl font-black text-orange-500">
                  {target.wellnessScore}
                </div>
              </div>
            </div>
            <div className="mt-3 px-1">
              <div className="text-[10px] font-bold uppercase tracking-tight text-slate-500 dark:text-slate-400">
                {current.wellnessScore < target.wellnessScore
                  ? `${target.wellnessScore - current.wellnessScore} points to reach target`
                  : (
                    <span className="flex items-center gap-2 text-emerald-500">
                      Goal Reached
                      <CelebrationIcon className="w-3 h-3" />
                    </span>
                  )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

