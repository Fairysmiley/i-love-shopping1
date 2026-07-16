"use client";

import { ReactNode } from "react";

interface ActionCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
  color?: "blue" | "green" | "purple" | "emerald";
  variant?: "button" | "card";
  disabled?: boolean;
}

const colorStyles = {
  blue: {
    button: "bg-blue-600 hover:bg-blue-700 text-white",
    card: "border-blue-200 dark:border-blue-700",
    icon: "text-blue-500",
    link: "text-blue-600 dark:text-blue-400",
  },
  green: {
    button: "bg-green-600 hover:bg-green-700 text-white",
    card: "border-green-200 dark:border-green-700",
    icon: "text-green-500",
    link: "text-green-600 dark:text-green-400",
  },
  purple: {
    button: "bg-purple-600 hover:bg-purple-700 text-white",
    card: "border-purple-200 dark:border-purple-700",
    icon: "text-purple-500",
    link: "text-purple-600 dark:text-purple-400",
  },
  emerald: {
    button: "bg-emerald-600 hover:bg-emerald-700 text-white",
    card: "border-emerald-200 dark:border-emerald-700",
    icon: "text-emerald-500",
    link: "text-emerald-600 dark:text-emerald-400",
  },
};

/**
 * Unified ActionCard component for consistent UI
 * Supports both button-style (colorful) and card-style (white with border) variants
 */
export function ActionCard({
  title,
  description,
  icon,
  onClick,
  color = "blue",
  variant = "button",
  disabled = false,
}: ActionCardProps) {
  const styles = colorStyles[color];

  if (variant === "button") {
    // Colorful button style (for Quick Actions)
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`${styles.button} font-medium py-4 px-6 rounded-lg shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-left w-full`}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-1">{title}</h3>
            <p className="text-sm opacity-90">{description}</p>
          </div>
          <div className="ml-4 opacity-80">
            {icon}
          </div>
        </div>
      </button>
    );
  }

  // Card style (for feature cards)
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
        <div className={styles.icon}>
          {icon}
        </div>
      </div>
      <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
        {description}
      </p>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`${styles.link} text-sm font-medium hover:underline disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
      >
        {title === "Health Profile" ? "View Profile →" : title === "Wellness Analytics" ? "View Analytics →" : title === "AI Insights" ? "View Insights →" : `View ${title} →`}
      </button>
    </div>
  );
}
