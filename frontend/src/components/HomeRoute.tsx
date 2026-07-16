import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LandingPage } from '../pages/LandingPage';

/** Guests see the marketing landing page; signed-in users go straight to the catalog. */
export function HomeRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="container" style={{ padding: '48px 20px' }}>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/shop" replace />;
  }

  return <LandingPage />;
}
