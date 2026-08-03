import { SEO } from '../components/SEO';

export function TermsPage() {
  return (
    <div className="container" style={{ padding: 28, maxWidth: 800 }}>
      <SEO
        title="Terms of Service"
        description="Read Villi's Terms of Service for our authenticated pre-loved Nordic outdoor apparel marketplace."
        canonical="https://villi.com/terms"
        noindex={true}
      />
      <h1>Terms of Service</h1>
      <p className="muted" style={{ marginBottom: 32 }}>Last updated: August 2026</p>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2>1. Agreement to Terms</h2>
        <p style={{ lineHeight: 1.6 }}>
          By accessing and using Villi's platform ("the Service"), you agree to be bound by these Terms of Service.
          If you do not agree to all terms, you may not access the Service.
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2>2. Account Registration</h2>
        <p style={{ lineHeight: 1.6 }}>
          You must provide accurate, complete, and current information during registration. You are responsible for
          maintaining the confidentiality of your account credentials and for all activities under your account.
        </p>
        <ul style={{ lineHeight: 1.6, marginTop: 12 }}>
          <li>Users must be 18 years or older</li>
          <li>One account per user</li>
          <li>You must verify your email address</li>
          <li>Admin accounts require two-factor authentication</li>
        </ul>
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2>3. Product Authenticity</h2>
        <p style={{ lineHeight: 1.6 }}>
          All products sold on Villi are authenticated pre-loved Nordic outdoor apparel. We guarantee authenticity
          through our rigorous inspection process. Each item is graded based on its condition (Very Good, Good, Fair).
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2>4. Purchases and Payments</h2>
        <p style={{ lineHeight: 1.6 }}>
          All prices are listed in EUR. Payment is processed securely through Stripe. You agree to pay all charges
          at the prices in effect when you place your order, including shipping fees and applicable taxes.
        </p>
        <ul style={{ lineHeight: 1.6, marginTop: 12 }}>
          <li>Payment must be completed within 24 hours of order placement</li>
          <li>We accept credit cards, debit cards, and digital wallets</li>
          <li>All transactions are encrypted and PCI-compliant</li>
        </ul>
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2>5. Returns and Refunds</h2>
        <p style={{ lineHeight: 1.6 }}>
          Returns are accepted within 14 days of delivery for items in their original condition. Refunds will be
          issued to the original payment method within 7-10 business days after we receive the returned item.
        </p>
        <p style={{ lineHeight: 1.6, marginTop: 12 }}>
          The following items are not eligible for return: items marked as "final sale", damaged items, or items
          not in their original condition.
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2>6. Shipping and Delivery</h2>
        <p style={{ lineHeight: 1.6 }}>
          Shipping times vary based on the delivery option selected at checkout. We ship within the European Union.
          Risk of loss and title for items pass to you upon delivery to the carrier.
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2>7. User Conduct</h2>
        <p style={{ lineHeight: 1.6 }}>You agree not to:</p>
        <ul style={{ lineHeight: 1.6, marginTop: 12 }}>
          <li>Use the Service for any illegal purpose</li>
          <li>Attempt to gain unauthorized access to any part of the Service</li>
          <li>Post false, misleading, or fraudulent reviews</li>
          <li>Scrape or harvest data from the Service</li>
          <li>Interfere with the proper functioning of the Service</li>
        </ul>
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2>8. Intellectual Property</h2>
        <p style={{ lineHeight: 1.6 }}>
          All content on the Service, including text, graphics, logos, images, and software, is the property of
          Villi or its content suppliers and is protected by international copyright laws.
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2>9. Privacy</h2>
        <p style={{ lineHeight: 1.6 }}>
          Your use of the Service is also governed by our Privacy Policy. We encrypt personal data at rest and
          in transit. We never share your data with third parties without your consent.
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2>10. Limitation of Liability</h2>
        <p style={{ lineHeight: 1.6 }}>
          Villi shall not be liable for any indirect, incidental, special, consequential, or punitive damages
          resulting from your use of or inability to use the Service. Our total liability shall not exceed the
          amount you paid for the product giving rise to the claim.
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2>11. Changes to Terms</h2>
        <p style={{ lineHeight: 1.6 }}>
          We reserve the right to modify these terms at any time. Changes will be effective immediately upon
          posting. Continued use of the Service after changes constitutes acceptance of the modified terms.
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2>12. Contact Information</h2>
        <p style={{ lineHeight: 1.6 }}>
          For questions about these Terms of Service, please contact us at:
        </p>
        <p style={{ lineHeight: 1.6, marginTop: 12 }}>
          Email: legal@villi.com<br />
          Address: Villi AB, Stockholm, Sweden
        </p>
      </div>

      <div className="panel" style={{ backgroundColor: '#fffbeb', marginTop: 32 }}>
        <p style={{ fontSize: '0.875rem', margin: 0 }}>
          <strong>Note:</strong> These Terms of Service are provided for demonstration purposes as part of
          the Villi e-commerce platform. In a production environment, these would be reviewed and approved
          by legal counsel.
        </p>
      </div>
    </div>
  );
}
