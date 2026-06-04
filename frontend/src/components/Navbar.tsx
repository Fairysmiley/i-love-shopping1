import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from './ThemeToggle';

function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 20c1.5-3.5 4.5-5 7-5s5.5 1.5 7 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6h15l-1.5 9h-12L5 3H2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="20" r="1.5" fill="currentColor" />
      <circle cx="18" cy="20" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (term.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const s = await api.get<string[]>(`/products/suggest?q=${encodeURIComponent(term)}`);
        setSuggestions(s);
        setSuggestOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [term]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  const submit = (value: string) => {
    setSuggestOpen(false);
    setSearchOpen(false);
    navigate(`/?q=${encodeURIComponent(value)}`);
  };

  const openSearch = () => {
    setSearchOpen(true);
  };

  const signOut = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          Vil<span>li</span>
        </Link>

        <div className="navbar-actions">
          <ThemeToggle compact />

          <button
            type="button"
            className="navbar-icon-action"
            aria-label="Search products"
            aria-expanded={searchOpen}
            onClick={() => (searchOpen ? setSearchOpen(false) : openSearch())}
          >
            <SearchIcon />
            <span>search</span>
          </button>

          {user ? (
            <>
              <Link to="/account" className="navbar-icon-action">
                <UserIcon />
                <span>{user.firstName}</span>
              </Link>
              <button
                type="button"
                className="navbar-icon-action"
                onClick={signOut}
                aria-label="Sign out"
              >
                <span>sign out</span>
              </button>
            </>
          ) : (
            <Link to="/login" className="navbar-icon-action">
              <UserIcon />
              <span>sign in / register</span>
            </Link>
          )}

          <button
            type="button"
            className="navbar-cart"
            aria-label="Shopping cart"
            title="Cart & checkout arrive in the Commerce phase"
            onClick={() => undefined}
          >
            <CartIcon />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="navbar-search-panel" ref={boxRef}>
          <div className="container">
            <div className="search navbar-search-field">
              <input
                ref={inputRef}
                type="search"
                placeholder="Search pre-loved gear, brands, sizes…"
                aria-label="Search products"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit(term)}
                onFocus={() => suggestions.length && setSuggestOpen(true)}
              />
              {suggestOpen && suggestions.length > 0 && (
                <div className="suggestions" role="listbox">
                  {suggestions.map((s) => (
                    <button key={s} type="button" role="option" onClick={() => submit(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
