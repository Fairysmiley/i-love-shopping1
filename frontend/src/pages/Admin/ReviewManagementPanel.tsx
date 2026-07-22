import { useState, useEffect } from 'react';
import { api, ApiError } from '../../api/client';
import { StarRating } from '../../components/StarRating';

interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  author: string;
  helpfulVotes: number;
  createdAt: string;
  product: {
    name: string;
    slug: string;
  };
}

export function ReviewManagementPanel() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReviews = async () => {
    try {
      const res = await api.get<Review[]>('/products/admin/reviews');
      setReviews(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to fetch reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this review?')) return;
    try {
      await api.del(`/products/admin/reviews/${id}`);
      setReviews(reviews.filter((r) => r.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete review');
    }
  };

  if (loading) return <div>Loading reviews...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Reviews</h2>
      <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
            <th style={{ padding: 8 }}>Product</th>
            <th style={{ padding: 8 }}>Rating</th>
            <th style={{ padding: 8 }}>Review</th>
            <th style={{ padding: 8 }}>Author</th>
            <th style={{ padding: 8 }}>Date</th>
            <th style={{ padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: 8, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <a href={`/product/${r.product.slug}`} target="_blank" rel="noreferrer">{r.product.name}</a>
              </td>
              <td style={{ padding: 8 }}><StarRating value={r.rating} /></td>
              <td style={{ padding: 8, maxWidth: 300 }}>
                <strong>{r.title}</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: "0.8125rem", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.body}</p>
              </td>
              <td style={{ padding: 8 }}>{r.author}</td>
              <td style={{ padding: 8 }}>{new Date(r.createdAt).toLocaleDateString()}</td>
              <td style={{ padding: 8 }}>
                <button className="btn btn-secondary" style={{ padding: '4px 8px', color: 'red' }} onClick={() => handleDelete(r.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {reviews.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: 16, textAlign: 'center' }}>No reviews found</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
