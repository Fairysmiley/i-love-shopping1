/** Formats a money amount using the product's currency (defaults to EUR). */
export function money(amount: number, currency = 'EUR'): string {
  try {
    return new Intl.NumberFormat('fi-FI', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
