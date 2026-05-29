import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/**
 * Lands here after OAuth. The backend appends the short-lived access token in
 * the URL fragment (#accessToken=...), which never reaches the server/logs.
 * We hand it to the auth context (in-memory) and clean the URL.
 */
export function OAuthCallbackPage() {
  const { applyTokenFromOAuth } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hash.get('accessToken');
    if (!token) {
      setError('No token returned from provider.');
      return;
    }
    applyTokenFromOAuth(token)
      .then(() => navigate('/', { replace: true }))
      .catch(() => setError('Failed to complete sign-in.'));
  }, [applyTokenFromOAuth, navigate]);

  return (
    <div className="auth-wrap">
      <div className="auth-card center">
        {error ? <div className="alert alert-error">{error}</div> : <p>Completing sign-in...</p>}
      </div>
    </div>
  );
}
