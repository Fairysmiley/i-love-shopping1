import { Link } from 'react-router-dom';
import { LandingHeroArt } from '../components/LandingHeroArt';

const HIGHLIGHTS = [
  {
    title: 'Verified authenticity',
    text: 'Every listing carries condition, size, and authenticity facets you can filter on.',
  },
  {
    title: 'One-of-a-kind finds',
    text: 'Pre-loved Nordic outdoor pieces — often a single unit in stock.',
  },
  {
    title: 'Search that fits gear',
    text: 'Signed-in shoppers get text search plus facets by brand, category, price, rating, and more.',
  },
];

export function LandingPage() {
  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="container landing-hero-layout">
          <div className="landing-hero-inner">
            <p className="landing-eyebrow">Pre-loved Nordic outdoor apparel</p>
            <h1>
              Verified gear.
              <br />
              <span className="landing-accent">Ready for the trail.</span>
            </h1>
            <p className="landing-lead">
              Villi is a curated B2C marketplace for authenticated pre-loved pieces from brands
              like Fjällräven, Haglöfs, and Norrøna — browse as a guest or create an account to
              save your session and leave reviews.
            </p>
            <div className="landing-cta">
              <Link to="/shop" className="btn btn-primary">
                Browse the catalog
              </Link>
              <Link to="/register" className="btn">
                Create account
              </Link>
              <Link to="/login" className="btn landing-cta-ghost">
                Sign in
              </Link>
            </div>
          </div>
          <LandingHeroArt />
        </div>
      </section>

      <section className="container landing-section">
        <div className="landing-grid">
          {HIGHLIGHTS.map((h) => (
            <article key={h.title} className="panel landing-card">
              <h2>{h.title}</h2>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                {h.text}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
