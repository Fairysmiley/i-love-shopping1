import { useState } from 'react';
import { SEO } from '../components/SEO';

export function ContactPage() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    // Simulate API call
    setTimeout(() => setStatus('success'), 1000);
  };

  if (status === 'success') {
    return (
      <div className="container" style={{ padding: 48, maxWidth: 600, textAlign: 'center' }}>
        <h1 style={{ marginBottom: 16 }}>Message Sent</h1>
        <p className="muted" style={{ marginBottom: 32 }}>Thank you for reaching out! Our support team will get back to you within 24 hours.</p>
        <button className="btn btn-primary" onClick={() => setStatus('idle')}>Send Another Message</button>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: 28, maxWidth: 600 }}>
      <SEO
        title="Contact Support"
        description="Get help with your order or questions about Villi's authenticated pre-loved Nordic outdoor gear. Our support team is here to help."
        canonical="https://villi.com/contact"
      />
      <h1>Contact Support</h1>
      <p className="muted" style={{ marginBottom: 32 }}>Have a question about an order or need help finding specific gear? Let us know below.</p>
      
      <form onSubmit={handleSubmit} className="panel">
        <div className="field">
          <label htmlFor="name">Full Name</label>
          <input id="name" type="text" required placeholder="Jane Doe" />
        </div>
        <div className="field">
          <label htmlFor="email">Email Address</label>
          <input id="email" type="email" required placeholder="jane@example.com" />
        </div>
        <div className="field">
          <label htmlFor="subject">Subject</label>
          <select id="subject" required>
            <option value="">Select a topic...</option>
            <option value="order">Order Inquiry</option>
            <option value="product">Product Question</option>
            <option value="returns">Returns & Refunds</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="message">Message</label>
          <textarea id="message" required rows={5} placeholder="How can we help you today?"></textarea>
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Sending...' : 'Send Message'}
        </button>
      </form>

      <div style={{ marginTop: 48, display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h3>Email Us</h3>
          <p className="muted">support@villi.test</p>
        </div>
        <div>
          <h3>Call Us</h3>
          <p className="muted">+1 (555) 123-4567</p>
        </div>
      </div>
    </div>
  );
}
