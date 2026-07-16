"use client";

export type RecipeNutritionTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
};

export type DailyNutritionTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
};

function pct(value: number, target: number): number {
  return (value / Math.max(1, target)) * 100;
}

type ColumnProps = {
  label: string;
  sublabel: string;
  valueLabel: string;
  percent: number;
  barClass: string;
  overClass: string;
};

function TargetColumn({ label, sublabel, valueLabel, percent, barClass, overClass }: ColumnProps) {
  const displayPct = Math.round(percent);
  const fill = Math.min(100, percent);
  const isOver = percent > 100;
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0 flex-1">
      <span className="text-xs font-semibold tabular-nums text-gray-800 dark:text-gray-100">{displayPct}%</span>
      <div
        className="relative w-full max-w-[52px] mx-auto h-28 rounded-md bg-gray-200 dark:bg-gray-700 flex flex-col justify-end overflow-hidden border border-gray-100 dark:border-gray-600"
        title={`${valueLabel} (${displayPct}% of daily ${sublabel} target)`}
      >
        <div
          className={`w-full rounded-t transition-[height] duration-200 ${isOver ? overClass : barClass}`}
          style={{ height: `${fill}%`, minHeight: percent > 0 ? 3 : 0 }}
        />
      </div>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-200 text-center leading-tight">{label}</span>
      <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight px-0.5 break-words max-w-full">
        {valueLabel}
      </span>
    </div>
  );
}

/**
 * Column chart: this meal vs one day’s targets (from health profile or defaults).
 */
export function RecipeMealVsDailyTargetsChart({
  meal,
  targets,
  targetsFromProfile,
}: {
  meal: RecipeNutritionTotals;
  targets: DailyNutritionTargets;
  /** When false, caption explains defaults are used (e.g. not signed in). */
  targetsFromProfile: boolean;
}) {
  const pCal = pct(meal.calories, targets.calories);
  const pP = pct(meal.protein, targets.protein);
  const pC = pct(meal.carbs, targets.carbs);
  const pF = pct(meal.fats, targets.fats);

  const summary = `Meal nutrition as percentage of daily targets: calories ${Math.round(pCal)} percent, protein ${Math.round(pP)} percent, carbs ${Math.round(pC)} percent, fats ${Math.round(pF)} percent.`;

  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
      <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Vs your daily targets</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Each bar is how much of <strong className="font-medium text-gray-700 dark:text-gray-300">one full day</strong> of your
        plan fits in this portion (targets from{" "}
        {targetsFromProfile ? "your health profile" : "defaults — sign in and set Health profile for yours"}).
      </p>
      <div
        className="flex justify-between items-stretch gap-1 sm:gap-2"
        role="img"
        aria-label={summary}
      >
        <TargetColumn
          label="Calories"
          sublabel="kcal"
          valueLabel={`${Math.round(meal.calories)} / ${targets.calories} kcal`}
          percent={pCal}
          barClass="bg-emerald-500"
          overClass="bg-red-500"
        />
        <TargetColumn
          label="Protein"
          sublabel="g"
          valueLabel={`${Math.round(meal.protein)} / ${targets.protein} g`}
          percent={pP}
          barClass="bg-blue-500"
          overClass="bg-red-500"
        />
        <TargetColumn
          label="Carbs"
          sublabel="g"
          valueLabel={`${Math.round(meal.carbs)} / ${targets.carbs} g`}
          percent={pC}
          barClass="bg-green-500"
          overClass="bg-red-500"
        />
        <TargetColumn
          label="Fats"
          sublabel="g"
          valueLabel={`${Math.round(meal.fats)} / ${targets.fats} g`}
          percent={pF}
          barClass="bg-purple-500"
          overClass="bg-red-500"
        />
      </div>
    </div>
  );
}
