import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../cart/CartContext';
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
  const { cart, setIsOpen } = useCart();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestId = 'navbar-suggestions';

  useEffect(() => {
    if (term.trim().length < 2) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const s = await api.get<string[]>(`/products/suggest?q=${encodeURIComponent(term)}`);
        setSuggestions(s);
        setSuggestOpen(true);
        setActiveIndex(-1);
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
        setActiveIndex(-1);
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
    setActiveIndex(-1);
    navigate(`/shop?q=${encodeURIComponent(value)}`);
  };

  const openSearch = () => {
    setSearchOpen(true);
  };

  const signOut = async () => {
    await logout();
    navigate('/');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestOpen || suggestions.length === 0) {
      if (e.key === 'Enter') submit(term);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        submit(suggestions[activeIndex]);
      } else {
        submit(term);
      }
    } else if (e.key === 'Escape') {
      setSuggestOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to={user ? '/shop' : '/'} className="brand">
          Vil<span>li</span>
        </Link>

        <nav aria-label="Main Navigation" className="navbar-actions">
          <ThemeToggle compact />

          <Link to="/about" className="navbar-icon-action" style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: "0.875rem" }}>about</span>
          </Link>
          <Link to="/contact" className="navbar-icon-action" style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: "0.875rem" }}>contact</span>
          </Link>

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

          <Link to="/shop" className="navbar-icon-action">
            <span>shop</span>
          </Link>

          {user ? (
            <>
              <Link to="/account" className="navbar-icon-action">
                <UserIcon />
                <span>{user.firstName}</span>
              </Link>
              {user.role === 'ADMIN' && (
                <Link to="/admin" className="navbar-icon-action">
                  <span>admin</span>
                </Link>
              )}
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
              <span>sign in</span>
            </Link>
          )}
          <button
            type="button"
            className="navbar-cart"
            aria-label="Shopping cart"
            aria-haspopup="dialog"
            title="View your cart"
            onClick={() => setIsOpen(true)}
          >
            <CartIcon />
            {cart && cart.items.length > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--danger)', color: '#fff', fontSize: "0.625rem", padding: '2px 6px', borderRadius: 10, fontWeight: 'bold' }}>
                {cart.items.reduce((acc, item) => acc + item.quantity, 0)}
              </span>
            )}
          </button>
        </nav>
      </div>

      {searchOpen && (
        <div className="navbar-search-panel" ref={boxRef}>
          <div className="container">
            <div className="search navbar-search-field">
              <input
                ref={inputRef}
                id="navbar-search-input"
                type="search"
                placeholder="Search pre-loved gear, brands, sizes…"
                aria-label="Search products"
                aria-autocomplete="list"
                aria-controls={suggestOpen && suggestions.length > 0 ? suggestId : undefined}
                aria-activedescendant={
                  activeIndex >= 0 ? `${suggestId}-${activeIndex}` : undefined
                }
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length && setSuggestOpen(true)}
              />
              {suggestOpen && suggestions.length > 0 && (
                <div className="suggestions" role="listbox" id={suggestId}>
                  {suggestions.map((s, i) => (
                    <button
                      key={s}
                      id={`${suggestId}-${i}`}
                      type="button"
                      role="option"
                      aria-selected={i === activeIndex}
                      style={
                        i === activeIndex
                          ? { background: 'var(--primary)', color: '#fff' }
                          : undefined
                      }
                      onMouseEnter={() => setActiveIndex(i)}
                      onMouseLeave={() => setActiveIndex(-1)}
                      onClick={() => submit(s)}
                    >
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
