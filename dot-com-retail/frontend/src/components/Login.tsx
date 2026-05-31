import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login as loginAPI, googleOAuth, twoFAVerifyLogin } from '../api/auth';
import { validateEmail, validatePassword } from '../utils/validation';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [twoFARequired, setTwoFARequired] = useState<{ required: boolean; username?: string }>({ required: false });
  const [twoFACode, setTwoFACode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Client-side validation
    const emailError = validateEmail(form.email);
    if (emailError) {
      setError(emailError);
      return;
    }

    const passwordError = validatePassword(form.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);

    try {
      const data = await loginAPI({
        email: form.email,
        password: form.password,
      });

      if (data.twofa_required) {
        setTwoFARequired({ required: true, username: data.username });
      } else {
        login(data.access, data.user);
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  // Google OAuth handler
  const handleGoogleOAuth = async (response: any) => {
    setError('');
    setLoading(true);

    try {
      const data = await googleOAuth(response.credential);
      if (data.twofa_required) {
        setTwoFARequired({ required: true, username: data.username });
      } else {
        login(data.access, data.user);
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // Initialize Google OAuth
  useEffect(() => {
    const initializeGoogleOAuth = () => {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

      if (!clientId) {
        console.warn('Google Client ID not configured. OAuth login unavailable.');
        return;
      }

      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleOAuth,
        });

        const googleButton = document.getElementById('google-signin-button');
        if (googleButton) {
          window.google.accounts.id.renderButton(googleButton, {
            theme: 'outline',
            size: 'large',
            width: 350,
            text: 'signin_with',
          });
        }
      }
    };

    // Load Google Identity Services script if not already loaded
    if (!document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = initializeGoogleOAuth;
      script.onerror = () => setError('Failed to load Google authentication');
      document.head.appendChild(script);
    } else {
      initializeGoogleOAuth();
    }
  }, []);

  return (
    <div>
      {!twoFARequired.required ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              autoComplete="email"
              placeholder="Enter your email"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              autoComplete="current-password"
              placeholder="Enter your password"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-red-700 text-sm">{error}</span>
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                Remember me
              </label>
            </div>
            <a
              href="/forgot-password"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors duration-200"
            >
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-4 rounded-xl font-medium hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
          {loading ? 'Logging in...' : 'Login'}
        </button>
        </form>
      ) : (
        <form onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setLoading(true);
          try {
            const data = await twoFAVerifyLogin(twoFARequired.username as string, twoFACode);
            login(data.access, data.user);
            navigate('/');
          } catch (err: any) {
            setError(err.message || 'Invalid 2FA code');
          } finally {
            setLoading(false);
          }
        }}>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2">Two-Factor Code</label>
            <input
              type="text"
              name="twofa"
              value={twoFACode}
              onChange={(e) => setTwoFACode(e.target.value)}
              required
              className="w-full p-2 border rounded"
              inputMode="numeric"
              pattern="\d{6}"
              autoComplete="one-time-code"
            />
          </div>
          {error && (
            <div className="mb-4 text-red-500">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>
        </form>
      )}

      {/* Divider */}
      <div className="my-6 flex items-center">
        <div className="flex-grow border-t border-gray-300"></div>
        <span className="flex-shrink mx-4 text-gray-400">or</span>
        <div className="flex-grow border-t border-gray-300"></div>
      </div>

      {/* Google OAuth */}
      <div className="space-y-3">
        <div id="google-signin-button" className="flex justify-center"></div>

        {/* Fallback for Google Sign-In */}
        <div className="text-center">
          <p className="text-sm text-gray-600">
            New to Dot-Com Retail? <a href="/register" className="text-blue-500 hover:underline">Create account</a>
          </p>
        </div>
      </div>
    </div>
    );
};

export default Login;