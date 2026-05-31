import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from './ThemeToggle';

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced type-ahead suggestions.
  useEffect(() => {
    if (term.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const s = await api.get<string[]>(`/products/suggest?q=${encodeURIComponent(term)}`);
        setSuggestions(s);
        setOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [term]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const submit = (value: string) => {
    setOpen(false);
    navigate(`/?q=${encodeURIComponent(value)}`);
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          Vil<span>li</span>
        </Link>

        <div className="search" ref={boxRef}>
          <input
            type="search"
            placeholder="Search pre-loved gear, brands, sizes..."
            aria-label="Search products"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit(term)}
            onFocus={() => suggestions.length && setOpen(true)}
          />
          {open && suggestions.length > 0 && (
            <div className="suggestions" role="listbox">
              {suggestions.map((s) => (
                <button key={s} role="option" onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="navbar-actions">
          <ThemeToggle />

          {user ? (
            <>
              <Link to="/account" className="btn">
                {user.firstName}
              </Link>
              <button className="btn" onClick={() => logout()}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn">
                Sign in
              </Link>
              <Link to="/register" className="btn btn-primary">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
