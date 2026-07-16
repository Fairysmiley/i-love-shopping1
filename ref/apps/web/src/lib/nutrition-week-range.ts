import { formatLocalYmd, parseLocalYmd } from "./date-utils";

/** Merge API rows into every local calendar day in [startYmd, endYmd] so charts always show one column per day. */
export function mergeWeeklyWithLocalRange(
  startYmd: string,
  endYmd: string,
  apiDays: { date: string; calories?: number; protein?: number; carbs?: number; fats?: number }[]
): { date: string; calories: number; protein: number; carbs: number; fats: number }[] {
  const byDate = new Map<string, { calories: number; protein: number; carbs: number; fats: number }>();
  for (const row of apiDays) {
    const key = row.date?.slice(0, 10);
    if (!key) continue;
    const cur = byDate.get(key) ?? { calories: 0, protein: 0, carbs: 0, fats: 0 };
    cur.calories += row.calories ?? 0;
    cur.protein += row.protein ?? 0;
    cur.carbs += row.carbs ?? 0;
    cur.fats += row.fats ?? 0;
    byDate.set(key, cur);
  }
  const out: { date: string; calories: number; protein: number; carbs: number; fats: number }[] = [];
  let cur = parseLocalYmd(startYmd);
  const end = parseLocalYmd(endYmd);
  while (cur <= end) {
    const key = formatLocalYmd(cur);
    const row = byDate.get(key);
    out.push({
      date: key,
      calories: row?.calories ?? 0,
      protein: row?.protein ?? 0,
      carbs: row?.carbs ?? 0,
      fats: row?.fats ?? 0,
    });
    const next = new Date(cur);
    next.setDate(next.getDate() + 1);
    cur = next;
  }
  return out;
}
