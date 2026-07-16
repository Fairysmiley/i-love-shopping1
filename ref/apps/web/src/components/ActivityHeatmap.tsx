"use client";

import { formatDateEuropean } from "@/lib/date-utils";

interface ActivityHeatmapProps {
  data: Array<{ date: Date; value: number }>;
  width?: number;
  height?: number;
}

/**
 * Activity Heatmap Component
 * Displays weekly activity as a heatmap grid
 */
export function ActivityHeatmap({ data, width = 800, height = 200 }: ActivityHeatmapProps) {
  // Group data by week
  const weeks: Array<Array<{ date: Date; value: number }>> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get last 12 weeks
  for (let weekOffset = 11; weekOffset >= 0; weekOffset--) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - (weekOffset * 7 + today.getDay()));
    weekStart.setHours(0, 0, 0, 0);

    const week: Array<{ date: Date; value: number }> = [];
    for (let day = 0; day < 7; day++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + day);

      // Find matching data point
      const dataPoint = data.find(
        (d) =>
          d.date.toDateString() === date.toDateString()
      );

      week.push({
        date,
        value: dataPoint?.value || 0,
      });
    }
    weeks.push(week);
  }

  // Calculate max value for color scaling
  // If no data, use 1 to avoid division by zero (all cells will be gray/empty)
  const maxValue = data.length > 0 ? Math.max(...data.map((d) => d.value), 1) : 1;

  const getColor = (value: number) => {
    if (value === 0) return "bg-gray-100 dark:bg-gray-800";
    const intensity = value / maxValue;
    if (intensity < 0.25) return "bg-green-200 dark:bg-green-900/30";
    if (intensity < 0.5) return "bg-green-400 dark:bg-green-700/50";
    if (intensity < 0.75) return "bg-green-600 dark:bg-green-600/70";
    return "bg-green-800 dark:bg-green-500";
  };

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="w-full">
      <div className="flex items-start gap-4 overflow-x-auto pb-2">
        {/* Day labels */}
        <div className="flex flex-col gap-1">
          {/* Header spacer to match "12w" label height exactly */}
          <div className="text-[10px] mb-1 h-4 leading-4 invisible">12w</div>
          {dayLabels.map((day) => (
            <div
              key={day}
              className="text-[10px] font-bold text-slate-400 dark:text-slate-600 flex items-center"
              style={{ height: `${(height - 40) / 7}px` }}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Heatmap grid */}
        <div className="flex-1 min-w-[600px]">
          <div className="flex gap-1 justify-between">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex-1 flex flex-col gap-1">
                <div className="text-[10px] font-bold text-slate-300 dark:text-slate-700 mb-1 text-center h-4 leading-4">
                  {weekIndex === 0 ? "12w" : "\u00A0"}
                </div>
                {week.map((day, dayIndex) => (
                  <div
                    key={dayIndex}
                    className={`${getColor(day.value)} rounded-[3px] border border-slate-100/10 dark:border-slate-800 transition-colors cursor-pointer hover:border-blue-500`}
                    style={{
                      width: "100%",
                      height: `${(height - 40) / 7}px`,
                    }}
                    title={`${formatDateEuropean(day.date)}: ${day.value.toFixed(1)} activity points`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-slate-50 dark:border-slate-800/50">
        <span className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest">Less</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 bg-gray-100 dark:bg-gray-800 rounded-[2px]" />
          <div className="w-3 h-3 bg-green-200 dark:bg-green-900/30 rounded-[2px]" />
          <div className="w-3 h-3 bg-green-400 dark:bg-green-700/50 rounded-[2px]" />
          <div className="w-3 h-3 bg-green-600 dark:bg-green-600/70 rounded-[2px]" />
          <div className="w-3 h-3 bg-green-800 dark:bg-green-500 rounded-[2px]" />
        </div>
        <span className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest">More</span>
      </div>
    </div>
  );
}

