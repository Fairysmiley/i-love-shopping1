import { useState } from 'react';
import { SEO } from '../components/SEO';

interface FAQItemProps {
  question: string;
  answer: string | JSX.Element;
  isOpen: boolean;
  onToggle: () => void;
}

function FAQItem({ question, answer, isOpen, onToggle }: FAQItemProps) {
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>{question}</h3>
        <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          {typeof answer === 'string' ? <p style={{ lineHeight: 1.6, margin: 0 }}>{answer}</p> : answer}
        </div>
      )}
    </div>
  );
}

export function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: 'What is Villi?',
      answer: 'Villi is a curated B2C marketplace specializing in authenticated pre-loved Nordic outdoor apparel from premium brands like Fjällräven, Haglöfs, and Norrøna. We combine sustainability with quality by extending the life of high-performance gear.',
    },
    {
      question: 'How do you authenticate products?',
      answer: (
        <>
          <p style={{ lineHeight: 1.6, marginBottom: 12 }}>Every product goes through our rigorous authentication process:</p>
          <ul style={{ lineHeight: 1.6, marginLeft: 20 }}>
            <li>Visual inspection by trained gear experts</li>
            <li>Verification of brand markers, tags, and materials</li>
            <li>Condition assessment and grading</li>
            <li>Quality control checks for functionality</li>
          </ul>
        </>
      ),
    },
    {
      question: 'What do the condition grades mean?',
      answer: (
        <>
          <p style={{ lineHeight: 1.6, marginBottom: 12 }}>We grade items based on their condition:</p>
          <ul style={{ lineHeight: 1.6, marginLeft: 20 }}>
            <li><strong>Very Good:</strong> Gently used with minimal signs of wear</li>
            <li><strong>Good:</strong> Used with some visible wear but fully functional</li>
            <li><strong>Fair:</strong> Noticeable wear but still in working condition</li>
          </ul>
        </>
      ),
    },
    {
      question: 'Do you ship internationally?',
      answer: 'Currently, we ship within the European Union. Shipping times vary by destination and the delivery option you select at checkout. Standard shipping typically takes 3-7 business days.',
    },
    {
      question: 'What is your return policy?',
      answer: 'We accept returns within 14 days of delivery. Items must be in their original condition with all tags attached. To initiate a return, log into your account and select the order you wish to return. Refunds are processed within 7-10 business days after we receive the returned item.',
    },
    {
      question: 'How secure is my payment information?',
      answer: 'All payments are processed through Stripe, a PCI Level 1 certified payment processor. We never store your complete credit card information on our servers. All transactions are encrypted using industry-standard SSL/TLS protocols.',
    },
    {
      question: 'Can I sell my gear on Villi?',
      answer: 'Currently, Villi operates as a curated marketplace where we source and authenticate all products ourselves. However, we\'re exploring options for verified sellers in the future. If you\'re interested in selling high-quality Nordic outdoor gear, please contact us at partners@villi.com.',
    },
    {
      question: 'Do you offer gift cards?',
      answer: 'Not at this time, but we\'re working on adding gift cards as a feature. Sign up for our newsletter to be notified when they become available.',
    },
    {
      question: 'How can I track my order?',
      answer: 'Once your order ships, you\'ll receive a tracking number via email. You can also view your order status and tracking information by logging into your account and visiting the Orders page.',
    },
    {
      question: 'What if I receive a damaged item?',
      answer: 'We carefully inspect all items before shipping, but if you receive a damaged product, please contact our support team within 48 hours of delivery. Include photos of the damage and your order number. We\'ll arrange for a replacement or full refund.',
    },
    {
      question: 'Do you have a loyalty program?',
      answer: 'We\'re currently developing a rewards program for our community members. Join our newsletter to be the first to know when we launch new features and exclusive offers.',
    },
    {
      question: 'How do I leave a review?',
      answer: 'After receiving your order, you can leave a review by visiting the product page and clicking the "Write a Review" button. Reviews help our community make informed decisions and improve our service.',
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept all major credit cards (Visa, MasterCard, American Express), debit cards, and digital wallets including Apple Pay and Google Pay through our secure payment processor Stripe.',
    },
    {
      question: 'Can I cancel my order?',
      answer: 'Orders can be cancelled within 2 hours of placement if they haven\'t been processed yet. After that, you\'ll need to wait for delivery and use our standard return process. Contact support immediately if you need to cancel an order.',
    },
    {
      question: 'Is my personal data secure?',
      answer: 'Yes. We encrypt all personal data at rest and in transit using AES-256 encryption. We comply with GDPR requirements and never share your data with third parties without your explicit consent. You can export or delete your data at any time from your account settings.',
    },
  ];

  return (
    <div className="container" style={{ padding: 28, maxWidth: 900 }}>
      <SEO
        title="Frequently Asked Questions"
        description="Find answers to common questions about Villi's authenticated pre-loved Nordic outdoor apparel, shipping, returns, and more."
        canonical="https://villi.com/faq"
      />
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <h1>Frequently Asked Questions</h1>
        <p className="muted" style={{ fontSize: '1.125rem', maxWidth: 600, margin: '16px auto 0' }}>
          Find answers to common questions about Villi's authenticated pre-loved Nordic outdoor apparel.
        </p>
      </div>

      <div style={{ marginBottom: 32 }}>
        {faqs.map((faq, index) => (
          <FAQItem
            key={index}
            question={faq.question}
            answer={faq.answer}
            isOpen={openIndex === index}
            onToggle={() => setOpenIndex(openIndex === index ? null : index)}
          />
        ))}
      </div>

      <div className="panel" style={{ backgroundColor: '#f0f9ff', textAlign: 'center' }}>
        <h3>Still have questions?</h3>
        <p className="muted" style={{ marginBottom: 16 }}>
          Can't find what you're looking for? Our support team is here to help.
        </p>
        <a href="/contact" className="btn btn-primary">
          Contact Support
        </a>
      </div>
    </div>
  );
}
