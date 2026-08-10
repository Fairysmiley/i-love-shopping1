import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', marginTop: 48, padding: '28px 0' }}>
      <div
        className="container"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span className="muted" style={{ fontSize: '0.8125rem' }}>
          &copy; {new Date().getFullYear()} Villi. Verified pre-loved Nordic outdoor apparel.
        </span>
        <nav aria-label="Footer" style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <Link to="/about" className="muted" style={{ fontSize: '0.8125rem' }}>
            About
          </Link>
          <Link to="/contact" className="muted" style={{ fontSize: '0.8125rem' }}>
            Contact
          </Link>
          <Link to="/faq" className="muted" style={{ fontSize: '0.8125rem' }}>
            FAQ
          </Link>
          <Link to="/terms" className="muted" style={{ fontSize: '0.8125rem' }}>
            Terms &amp; Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
