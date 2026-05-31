import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { StarRating } from './StarRating';
import type { ReviewList } from '../api/types';

interface Props {
  slug: string;
  /** Called after a review is created/deleted so the parent can refresh aggregates. */
  onChange?: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ProductReviews({ slug, onChange }: Props) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<ReviewList | null>(null);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadReviews = useCallback(() => {
    api
      .get<ReviewList>(`/products/${slug}/reviews`)
      .then(setReviews)
      .catch(() => setReviews(null));
  }, [slug]);

  useEffect(loadReviews, [loadReviews]);

  const mine = user ? reviews?.data.find((r) => r.author.startsWith(user.firstName)) : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post(`/products/${slug}/reviews`, {
        rating,
        title: title.trim() || undefined,
        body: body.trim() || undefined,
      });
      setTitle('');
      setBody('');
      setRating(5);
      loadReviews();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your review.');
    } finally {
      setBusy(false);
    }
  };

  const summary = reviews?.summary;

  return (
    <section className="reviews" aria-labelledby="reviews-heading">
      <h2 id="reviews-heading">Customer reviews</h2>

      {summary && summary.ratingCount > 0 ? (
        <div className="reviews-summary">
          <span className="reviews-avg">{summary.averageRating.toFixed(1)}</span>
          <div>
            <StarRating value={summary.averageRating} />
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Based on {summary.ratingCount} review{summary.ratingCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      ) : (
        <p className="muted">No reviews yet. Be the first to share your experience.</p>
      )}

      {user ? (
        <form className="review-form panel" onSubmit={submit}>
          <h3>{mine ? 'Update your review' : 'Write a review'}</h3>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="field">
            <label htmlFor="review-rating">Rating</label>
            <select
              id="review-rating"
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              style={{ maxWidth: 160 }}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} star{n === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="review-title">Title (optional)</label>
            <input
              id="review-title"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summarise your experience"
            />
          </div>
          <div className="field">
            <label htmlFor="review-body">Your review (optional)</label>
            <textarea
              id="review-body"
              rows={4}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What did you think of the item and its condition?"
            />
          </div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Submitting...' : mine ? 'Update review' : 'Submit review'}
          </button>
        </form>
      ) : (
        <p className="muted">
          <Link to="/login">Sign in</Link> to write a review.
        </p>
      )}

      <ul className="review-list">
        {reviews?.data.map((r) => (
          <li key={r.id} className="review-item">
            <div className="review-head">
              <StarRating value={r.rating} />
              <strong>{r.title || 'Review'}</strong>
            </div>
            {r.body && <p>{r.body}</p>}
            <p className="muted" style={{ fontSize: 12 }}>
              {r.author} &middot; {formatDate(r.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
