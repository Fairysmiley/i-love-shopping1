/** Parse YYYY-MM-DD as local calendar date (matches date input values). */
export function parseLocalYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Inclusive local range: last `dayCount` days ending today (e.g. 7 → today and 6 prior days). */
export function rollingLocalDateRangeInclusive(dayCount: number): { startYmd: string; endYmd: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (dayCount - 1));
  return { startYmd: formatLocalYmd(start), endYmd: formatLocalYmd(end) };
}

/** Monday (local) of the Mon–Sun week containing `d`. */
export function mondayOfWeekContaining(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  x.setDate(x.getDate() - daysFromMonday);
  return x;
}

/** Sunday at end of the same week as `monday`. */
export function sundayAfterMonday(monday: Date): Date {
  const x = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
  x.setDate(x.getDate() + 6);
  return x;
}

/** Inclusive local Mon–Sun range for the calendar week containing `d` (same week logic as /nutrition Weekly). */
export function localMonSunWeekRangeContaining(d: Date): { startYmd: string; endYmd: string } {
  const monday = mondayOfWeekContaining(d);
  const sunday = sundayAfterMonday(monday);
  return { startYmd: formatLocalYmd(monday), endYmd: formatLocalYmd(sunday) };
}

/**
 * Format date to European standard (DD/MM/YYYY)
 */
export function formatDateEuropean(date: Date | string | null | undefined): string {
  if (!date) return "Not set";
  
  const dateObj = typeof date === "string" ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return "Invalid date";
  }
  
  const day = dateObj.getDate().toString().padStart(2, "0");
  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const year = dateObj.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Format date to European standard with time (DD/MM/YYYY HH:MM)
 */
export function formatDateTimeEuropean(date: Date | string | null | undefined): string {
  if (!date) return "Not set";
  
  const dateObj = typeof date === "string" ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return "Invalid date";
  }
  
  const day = dateObj.getDate().toString().padStart(2, "0");
  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const year = dateObj.getFullYear();
  const hours = dateObj.getHours().toString().padStart(2, "0");
  const minutes = dateObj.getMinutes().toString().padStart(2, "0");
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Format date for chart display (DD/MM)
 */
export function formatDateShort(date: Date | string): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return "Invalid";
  }
  
  const day = dateObj.getDate().toString().padStart(2, "0");
  const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  
  return `${day}/${month}`;
}
