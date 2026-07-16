"use client";

import { formatDateShort } from "@/lib/date-utils";

interface DataPoint {
  date: string;
  value: number;
  milestone?: string;
}

interface SimpleLineChartProps {
  data: DataPoint[];
  label: string;
  unit?: string; // Optional: unit to display on Y-axis (e.g., "kg", "pts", "%")
  color?: string;
  height?: number;
  showGrid?: boolean;
  referenceDates?: string[]; // Optional: use these dates for X-axis labels instead of data dates
  fixedMinValue?: number; // Optional: fixed minimum value for Y-axis
  fixedMaxValue?: number; // Optional: fixed maximum value for Y-axis
  targetValue?: number; // Optional: draws a horizontal reference line at this value
  targetLabel?: string; // Optional: label for the target line (e.g., "Goal")
}

export function SimpleLineChart({
  data,
  label,
  unit,
  color = "rgb(59, 130, 246)", // blue-500
  height = 200,
  showGrid = true,
  referenceDates,
  fixedMinValue,
  fixedMaxValue,
  targetValue,
  targetLabel = "Target",
}: SimpleLineChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg"
        style={{ height }}
      >
        <p className="text-gray-500 dark:text-gray-400">No data available</p>
      </div>
    );
  }

  // Sort data by date to ensure chronological order
  const sortedData = [...data].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateA - dateB;
  });

  const paddingLeft = 52;
  /** Room for last X tick + target pill on the right */
  const paddingRight = 28;
  const paddingY = 36;
  const chartWidth = 600;
  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const chartHeight = height - paddingY * 2;

  // Calculate min/max for scaling
  const values = sortedData.map((d) => Number(d.value));
  const dataMin = values.length ? Math.min(...values) : 0;
  const dataMax = values.length ? Math.max(...values) : 0;

  let minValue = fixedMinValue !== undefined ? fixedMinValue : dataMin;
  let maxValue = fixedMaxValue !== undefined ? fixedMaxValue : dataMax;
  // Include target in Y domain so the reference line is visible (e.g. 2000 kcal goal vs ~300 logged)
  if (targetValue !== undefined && Number.isFinite(targetValue)) {
    maxValue = Math.max(maxValue, targetValue);
  }
  if (minValue === maxValue) {
    maxValue = minValue + 1;
  }
  const range = maxValue - minValue || 1;

  const n = sortedData.length;
  const xSpan = Math.max(1, n - 1);

  // Generate path
  const points = sortedData.map((point, index) => {
    const x = paddingLeft + (index / xSpan) * innerWidth;
    const y =
      paddingY +
      chartHeight -
      ((Number(point.value) - minValue) / range) * chartHeight;
    return { x, y, value: point.value, date: point.date };
  });

  const pathData = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  // Format date stamp for display - shows the recorded event date (DD/MM)
  const formatDateStamp = (dateStr: string) => {
    return formatDateShort(dateStr);
  };

  // Get X-axis labels - use reference dates if provided, otherwise use data dates
  const getXAxisLabels = () => {
    if (points.length === 0) return [];

    // If reference dates are provided, use those for X-axis labels
    if (referenceDates && referenceDates.length > 0) {
      const sortedRefDates = [...referenceDates]
        .map(d => new Date(d).getTime())
        .sort((a, b) => a - b);

      // Map reference dates to chart positions
      const dataStartTime = new Date(sortedData[0].date).getTime();
      const dataEndTime = new Date(sortedData[sortedData.length - 1].date).getTime();
      const dataTimeRange = dataEndTime - dataStartTime || 1;

      return sortedRefDates.map((refTime, idx) => {
        // Calculate position on chart based on time
        const timeRatio = (refTime - dataStartTime) / dataTimeRange;
        const clampedRatio = Math.max(0, Math.min(1, timeRatio));
        const xPosition = paddingLeft + clampedRatio * innerWidth;

        // Find closest point index
        let closestIndex = 0;
        let minDistance = Infinity;
        points.forEach((point, pIdx) => {
          const distance = Math.abs(point.x - xPosition);
          if (distance < minDistance) {
            minDistance = distance;
            closestIndex = pIdx;
          }
        });

        return {
          index: closestIndex,
          date: formatDateStamp(new Date(refTime).toISOString()),
          x: xPosition,
        };
      });
    }

    // Otherwise, use data dates (original logic)
    // If we have 7 or fewer points, show all of them
    if (points.length <= 7) {
      return points.map((point, index) => ({
        index,
        date: formatDateStamp(point.date),
        x: point.x,
      }));
    }

    // Evenly spaced tick indices (first + last + intermediates) — avoids adjacent last-two labels
    const maxLabels = 7;
    const nPts = points.length;
    const tickCount = Math.min(maxLabels, nPts);
    const indices: number[] = [];
    for (let k = 0; k < tickCount; k++) {
      const idx =
        tickCount <= 1 ? 0 : Math.round((k / (tickCount - 1)) * (nPts - 1));
      if (indices.length === 0 || indices[indices.length - 1] !== idx) {
        indices.push(idx);
      }
    }
    return indices.map((index) => ({
      index,
      date: formatDateStamp(points[index].date),
      x: points[index].x,
    }));
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {label}
      </h3>
      <div className="overflow-x-auto">
        <svg
          width={chartWidth}
          height={height}
          className="w-full"
          viewBox={`0 0 ${chartWidth} ${height}`}
        >
          {/* Grid lines */}
          {showGrid && (
            <g className="text-gray-300 dark:text-gray-700">
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = paddingY + chartHeight - ratio * chartHeight;
                const value = minValue + ratio * range;
                const label =
                  range >= 100
                    ? Math.round(value).toString()
                    : range >= 10
                      ? value.toFixed(1)
                      : value.toFixed(2);
                return (
                  <g key={ratio}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={chartWidth - paddingRight}
                      y2={y}
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="text-xs fill-gray-500 dark:fill-gray-400"
                    >
                      {label}
                      {unit ? ` ${unit}` : ""}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* Target reference line */}
          {targetValue !== undefined &&
            Number.isFinite(targetValue) &&
            targetValue >= minValue &&
            targetValue <= maxValue && (
            <g>
              {(() => {
                const targetY = paddingY + chartHeight - ((targetValue - minValue) / range) * chartHeight;
                return (
                  <>
                    <line
                      x1={paddingLeft}
                      y1={targetY}
                      x2={chartWidth - paddingRight}
                      y2={targetY}
                      stroke="rgb(34, 197, 94)" // green-500
                      strokeWidth="2"
                      strokeDasharray="8 4"
                    />
                    <rect
                      x={chartWidth - paddingRight - 58}
                      y={targetY - 10}
                      width={56}
                      height={20}
                      rx={4}
                      fill="rgb(34, 197, 94)"
                      fillOpacity="0.15"
                    />
                    <text
                      x={chartWidth - paddingRight - 54}
                      y={targetY + 4}
                      className="text-xs font-medium"
                      fill="rgb(34, 197, 94)"
                    >
                      {targetLabel}{" "}
                      {range >= 100 ? Math.round(targetValue) : targetValue.toFixed(0)}
                    </text>
                  </>
                );
              })()}
            </g>
          )}

          {/* Area under curve */}
          <path
            d={`${pathData} L ${points[points.length - 1].x} ${paddingY + chartHeight} L ${points[0].x} ${paddingY + chartHeight} Z`}
            fill={color}
            fillOpacity="0.1"
          />

          {/* Line */}
          <path
            d={pathData}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {points.map((point, index) => (
            <g key={index} className="group">
              <circle
                cx={point.x}
                cy={point.y}
                r={sortedData[index].milestone ? 6 : 4}
                fill={sortedData[index].milestone ? "#F59E0B" : color} // Amber for milestones
                stroke={sortedData[index].milestone ? "#FFF" : "none"}
                strokeWidth={sortedData[index].milestone ? 2 : 0}
                className="hover:r-8 transition-all cursor-pointer"
              />

              {/* Milestone Star/Diamond Indicator */}
              {sortedData[index].milestone && (
                <path
                  d={`M${point.x} ${point.y - 10} L${point.x + 3} ${point.y - 15} L${point.x} ${point.y - 20} L${point.x - 3} ${point.y - 15} Z`}
                  fill="#F59E0B"
                />
              )}

              <title>
                {formatDateStamp(point.date)}: {point.value.toFixed(1)}{unit ? ` ${unit}` : ""}
                {sortedData[index].milestone ? `\n🏆 ${sortedData[index].milestone}` : ""}
              </title>
            </g>
          ))}

          {/* X-axis labels */}
          {points.length > 0 && (
            <g className="text-[10px] fill-gray-500 dark:fill-gray-400">
              {getXAxisLabels().map((label, idx) => {
                return (
                  <text
                    key={`${label.index}-${idx}`}
                    x={label.x}
                    y={height - 8}
                    textAnchor="middle"
                  >
                    {label.date}
                  </text>
                );
              })}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
