interface Props {
  value: number;
  count?: number;
  showCount?: boolean;
}

/** Read-only star rating display (★ full / ☆ empty) with an accessible label. */
export function StarRating({ value, count, showCount = false }: Props) {
  const full = Math.round(value);
  return (
    <span className="rating" role="img" aria-label={`${value} out of 5 stars`}>
      {'\u2605'.repeat(full)}
      {'\u2606'.repeat(5 - full)}
      {showCount && (
        <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>
          {count ? `${value.toFixed(1)} (${count})` : 'No reviews yet'}
        </span>
      )}
    </span>
  );
}
