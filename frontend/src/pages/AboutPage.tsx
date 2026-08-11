import { SEO } from '../components/SEO';

export function AboutPage() {
  return (
    <div className="container" style={{ padding: 28, maxWidth: 800 }}>
      <SEO
        title="About Villi"
        description="Learn about Villi's mission to cut environmental impact through authenticated pre-loved Nordic outdoor apparel from Fjällräven, Haglöfs, Norrøna, and more."
        canonical="https://villi.com/about"
      />
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <h1>About Villi</h1>
        <p className="muted" style={{ fontSize: "1.125rem", maxWidth: 600, margin: '0 auto' }}>
          We believe the best gear is the gear that's already out there.
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 32 }}>
        <h2>Our Mission</h2>
        <p style={{ lineHeight: 1.6 }}>
          Villi is a curated B2C marketplace dedicated to authenticated pre-loved Nordic outdoor apparel. 
          Our mission is to reduce environmental impact by keeping high-quality gear from brands like Fjällräven, 
          Haglöfs, and Norrøna on the trails and out of landfills. We rigorously inspect and authenticate 
          every item to ensure it meets our strict standards for quality and durability.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24, marginBottom: 48 }}>
        <div className="panel" style={{ textAlign: 'center' }}>
          <h3>Sustainability</h3>
          <p className="muted" style={{ fontSize: "0.875rem" }}>Extending the life of outdoor gear reduces its carbon footprint by up to 73%.</p>
        </div>
        <div className="panel" style={{ textAlign: 'center' }}>
          <h3>Authenticity</h3>
          <p className="muted" style={{ fontSize: "0.875rem" }}>Every item is manually verified by our team of gear experts before listing.</p>
        </div>
        <div className="panel" style={{ textAlign: 'center' }}>
          <h3>Community</h3>
          <p className="muted" style={{ fontSize: "0.875rem" }}>Connecting outdoor enthusiasts who share a passion for nature and quality.</p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 48 }}>
        <h2>Meet the Team</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <img
              src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect fill='%2394a3b8' width='64' height='64'/%3E%3C/svg%3E"
              alt="Tony Nieminen avatar placeholder"
              style={{ width: 64, height: 64, borderRadius: '50%' }}
            />
            <div>
              <h4 style={{ margin: 0 }}>Tony Nieminen</h4>
              <p className="muted" style={{ margin: 0, fontSize: "0.8125rem" }}>Founder & CEO</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <img
              src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect fill='%2394a3b8' width='64' height='64'/%3E%3C/svg%3E"
              alt="Joni Kostia avatar placeholder"
              style={{ width: 64, height: 64, borderRadius: '50%' }}
            />
            <div>
              <h4 style={{ margin: 0 }}>Joni Kostia</h4>
              <p className="muted" style={{ margin: 0, fontSize: "0.8125rem" }}>Head of Authentication</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <h3>Connect with us</h3>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16 }}>
          <a
            className="btn"
            style={{ background: 'transparent', border: '1px solid var(--border)' }}
            href="https://instagram.com/villi.outdoor"
            target="_blank"
            rel="noopener noreferrer"
          >
            Instagram
          </a>
          <a
            className="btn"
            style={{ background: 'transparent', border: '1px solid var(--border)' }}
            href="https://x.com/villi_outdoor"
            target="_blank"
            rel="noopener noreferrer"
          >
            Twitter / X
          </a>
          <a
            className="btn"
            style={{ background: 'transparent', border: '1px solid var(--border)' }}
            href="https://linkedin.com/company/villi-outdoor"
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </a>
        </div>
      </div>
    </div>
  );
}
