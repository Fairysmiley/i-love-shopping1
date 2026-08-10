import { Link, useNavigate } from 'react-router-dom';
import { LandingHeroArt } from '../components/LandingHeroArt';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { money } from '../format';
import { SEO } from '../components/SEO';

interface Product {
  id: string;
  slug: string;
  name: string;
  price: number;
  images: Array<{ url: string; thumbnailUrl: string; altText?: string }>;
  averageRating: number;
}

interface Category {
  id: string;
  slug: string;
  name: string;
}

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
  const [featured, setFeatured] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Category[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch featured products (top rated) and categories (collections)
    Promise.all([
      api.get<{ data: Product[] }>('/products?limit=4&sort=rating'),
      api.get<Category[]>('/categories/tree')
    ]).then(([productsData, categoriesData]) => {
      setFeatured(productsData.data);
      setCollections(categoriesData.slice(0, 4)); // Get top 4 categories
    }).catch(console.error);
  }, []);

  return (
    <div className="landing">
      <SEO
        title="Verified Pre-Loved Nordic Outdoor Apparel"
        description="Shop authenticated pre-loved outdoor gear from Nordic brands like Fjällräven, Haglöfs, and Norrøna. Sustainable, verified, and ready for your next adventure."
        canonical="https://villi.com/"
        ogType="website"
        ogImage="/hero-emblem.png"
        ogImageAlt="Villi - Pre-loved Nordic outdoor apparel marketplace"
      />
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
              <p className="muted" style={{ margin: 0, fontSize: "0.875rem" }}>
                {h.text}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="container landing-section" style={{ padding: '48px 24px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 32 }}>Featured Collections</h2>
        <div className="landing-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {collections.map(c => (
            <div 
              key={c.id} 
              className="panel" 
              style={{ textAlign: 'center', cursor: 'pointer', transition: 'transform 0.2s', padding: 24 }}
              onClick={() => navigate(`/shop?category=${c.slug}`)}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <h3 style={{ margin: 0, fontSize: "1.125rem" }}>{c.name}</h3>
              <p className="muted" style={{ fontSize: "0.8125rem", marginTop: 8 }}>Explore gear &rarr;</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container landing-section" style={{ padding: '0 24px 64px 24px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 32 }}>Trending Gear</h2>
        <div className="landing-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {featured.map(p => (
            <div key={p.id} className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer' }} onClick={() => navigate(`/product/${p.slug}`)}>
              {p.images && p.images[0] ? (
                <img src={p.images[0].thumbnailUrl || p.images[0].url} alt={p.images[0].altText || p.name} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 8 }} />
              ) : (
                <div style={{ width: '100%', aspectRatio: '1/1', background: '#e2e8f0', borderRadius: 8 }} role="img" aria-label={`${p.name} - No image available`} />
              )}
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: "1rem" }}>{p.name}</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold' }}>{money(p.price)}</span>
                  {p.averageRating > 0 && <span style={{ fontSize: "0.8125rem", color: '#eab308' }}>★ {p.averageRating.toFixed(1)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
