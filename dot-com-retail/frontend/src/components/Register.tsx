
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ReCAPTCHA from 'react-google-recaptcha';
import { register, googleOAuth } from '../api/auth';
import { validateEmail, validatePassword, validateUsername } from '../utils/validation';

interface RegisterFormData {
  username: string;
  email: string;
  password1: string;
  password2: string;
  gdprConsent: boolean;
}

const Register = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState<RegisterFormData>({
    username: '',
    email: '',
    password1: '',
    password2: '',
    gdprConsent: false,
  });
  const [captcha, setCaptcha] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Client-side validation
    const usernameError = validateUsername(form.username);
    if (usernameError) {
      setError(usernameError);
      return;
    }

    const emailError = validateEmail(form.email);
    if (emailError) {
      setError(emailError);
      return;
    }

    const passwordError = validatePassword(form.password1);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (form.password1 !== form.password2) {
      setError('Passwords do not match');
      return;
    }

    if (!form.gdprConsent) {
      setError('You must accept GDPR consent');
      return;
    }

    if (!captcha) {
      setError('Please complete the reCAPTCHA');
      return;
    }

    setLoading(true);
    try {
      const data = await register({
        username: form.username.toLowerCase(),
        email: form.email,
        password1: form.password1,
        password2: form.password2,
        gdpr_consent: form.gdprConsent,
        captcha: captcha,
      });
      
      login(data.access, data.user);
      setSuccess('Registration successful! Redirecting to home...');
      setTimeout(() => navigate('/'), 2000);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  // Google OAuth handler  
  const handleGoogleOAuth = async (response: any) => {
    setError('');
    setSuccess('');
    setLoading(true);
    
    try {
      const data = await googleOAuth(response.credential);
      login(data.access, data.user);
      setSuccess('Registration successful with Google! Redirecting...');
      setTimeout(() => navigate('/'), 2000);
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
        console.warn('Google Client ID not configured. OAuth registration unavailable.');
        return;
      }
      
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleOAuth,
        });

        const googleButton = document.getElementById('google-register-button');
        if (googleButton) {
          window.google.accounts.id.renderButton(googleButton, {
            theme: 'outline',
            size: 'large', 
            width: 350,
            text: 'signup_with',
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
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
            Username
          </label>
          <input
            id="username"
            type="text"
            name="username"
            value={form.username}
            onChange={handleChange}
            required
            pattern="^[a-zA-Z0-9_]+$"
            title="Username must contain only letters, numbers, and underscores"
            maxLength={30}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            placeholder="Choose a username"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            required
            autoComplete="email"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            placeholder="your.email@example.com"
          />
        </div>

        <div>
          <label htmlFor="password1" className="block text-sm font-medium text-gray-700 mb-2">
            Password
          </label>
          <input
            id="password1"
            type="password"
            name="password1"
            value={form.password1}
            onChange={handleChange}
            required
            autoComplete="new-password"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            placeholder="Create a strong password"
          />
        </div>

        <div>
          <label htmlFor="password2" className="block text-sm font-medium text-gray-700 mb-2">
            Confirm Password
          </label>
          <input
            id="password2"
            type="password"
            name="password2"
            value={form.password2}
            onChange={handleChange}
            required
            autoComplete="new-password"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            placeholder="Confirm your password"
          />
        </div>

        <div className="flex items-start">
          <input
            id="gdprConsent"
            type="checkbox"
            name="gdprConsent"
            checked={form.gdprConsent}
            onChange={handleChange}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
          />
          <label htmlFor="gdprConsent" className="ml-3 block text-sm text-gray-700">
            I accept the GDPR privacy policy and terms of service
          </label>
        </div>

        <div className="flex justify-center">
          <ReCAPTCHA
            sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || ''}
            onChange={(token: any) => setCaptcha(token || '')}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-green-700 text-sm">{success}</span>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-4 rounded-xl font-medium hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
        >
          {loading ? 'Creating your account...' : 'Create Account'}
        </button>
      </form>
      
      {/* Divider */}
      <div className="flex items-center my-6">
        <div className="flex-grow h-px bg-gray-300"></div>
        <span className="px-4 text-sm text-gray-500">or continue with</span>
        <div className="flex-grow h-px bg-gray-300"></div>
      </div>
      
      {/* Google OAuth */}
      <div className="space-y-4">
        <div id="google-register-button" className="flex justify-center"></div>
        <p className="text-center text-sm text-gray-600">
          Already have an account?{' '}
          <a href="/login" className="text-blue-600 hover:text-blue-800 font-medium transition-colors duration-200">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
};

export default Register;