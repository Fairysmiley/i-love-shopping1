"use client";

interface ProgressBarProps {
  label: string;
  value: number;
  max: number;
  unit?: string;
  showPercentage?: boolean;
  color?: "blue" | "green" | "yellow" | "red" | "purple";
  size?: "sm" | "md" | "lg";
}

export function ProgressBar({
  label,
  value,
  max,
  unit = "",
  showPercentage = true,
  color = "blue",
  size = "md",
}: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const colorClasses = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    red: "bg-red-500",
    purple: "bg-purple-500",
  };

  const heightClasses = {
    sm: "h-2",
    md: "h-3",
    lg: "h-4",
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </span>
        {showPercentage && (
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {value.toFixed(1)}
            {unit && ` ${unit}`} / {max.toFixed(1)}
            {unit && ` ${unit}`} ({percentage.toFixed(0)}%)
          </span>
        )}
      </div>
      <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ${heightClasses[size]}`}>
        <div
          className={`${colorClasses[color]} transition-all duration-500 ease-out rounded-full h-full`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

