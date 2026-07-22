import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="container" style={{ padding: '64px 28px', textAlign: 'center', maxWidth: 600 }}>
      <h1 style={{ fontSize: "4.5rem", margin: '0 0 16px 0', color: 'var(--primary)' }}>404</h1>
      <h2 style={{ margin: '0 0 16px 0' }}>Page Not Found</h2>
      <p className="muted" style={{ marginBottom: 32, fontSize: "1.125rem" }}>
        Oops! We couldn't find the page you're looking for. It might have been moved or doesn't exist.
      </p>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
        <Link to="/" className="btn btn-primary">Go to Home</Link>
        <Link to="/shop" className="btn">Browse Catalog</Link>
      </div>
    </div>
  );
}
