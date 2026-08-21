import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { money } from '../format';
import { useAuth } from '../auth/AuthContext';
import { usePageTitle } from '../components/SEO';

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  deliveryOption: { name: string; estimatedDaysMin: number; estimatedDaysMax: number } | null;
  items: {
    id: string;
    quantity: number;
    unitPrice: number;
    product: {
      name: string;
      image: string | null;
    };
  }[];
}

// Stripe confirms the charge client-side instantly, but Order.status only
// flips PENDING -> PAID once our backend's webhook handler + queue consumer
// process the async callback (see the Stripe CLI setup note in the README).
// Poll briefly rather than assuming success the moment this page loads.
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 8; // ~16s, generous for a local webhook round-trip

export function OrderConfirmationPage() {
  usePageTitle('Order Confirmation');
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollAttempts, setPollAttempts] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api.get<Order>(`/orders/${id}/confirmation`)
      .then((result) => {
        if (!cancelled) setOrder(result);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id || !order || order.status !== 'PENDING' || pollAttempts >= MAX_POLL_ATTEMPTS) return;
    const timer = setTimeout(() => {
      api.get<Order>(`/orders/${id}/confirmation`)
        .then(setOrder)
        .catch(console.error)
        .finally(() => setPollAttempts((n) => n + 1));
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [id, order, pollAttempts]);

  if (loading) return <div className="container" style={{ padding: 48, textAlign: 'center' }}>Loading confirmation...</div>;
  if (!order) return <div className="container" style={{ padding: 48, textAlign: 'center' }}>Order not found.</div>;

  if (order.status === 'CANCELLED') {
    return (
      <div className="container" style={{ maxWidth: 800, padding: 48, textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, background: '#fee2e2', color: '#991b1b', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto', fontSize: '2.25rem' }}>
          ✕
        </div>
        <h1 style={{ marginBottom: 8 }}>Payment couldn't be completed</h1>
        <p className="muted" style={{ fontSize: '1.125rem', marginBottom: 24 }}>
          Order <strong>{order.id.toUpperCase()}</strong> wasn't charged — nothing was reserved and no items were removed from stock. You can try again with a different card.
        </p>
        <Link to="/shop" className="btn btn-primary">Back to shop</Link>
      </div>
    );
  }

  if (order.status === 'PENDING') {
    const stillWaiting = pollAttempts < MAX_POLL_ATTEMPTS;
    return (
      <div className="container" style={{ maxWidth: 800, padding: 48, textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, background: 'var(--surface-2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto', fontSize: '2.25rem' }}>
          {stillWaiting ? '⏳' : '⚠️'}
        </div>
        <h1 style={{ marginBottom: 8 }}>{stillWaiting ? 'Confirming your payment…' : 'Still confirming your payment'}</h1>
        <p className="muted" style={{ fontSize: '1.125rem' }}>
          Order <strong>{order.id.toUpperCase()}</strong> was placed and your card was charged — we're just waiting on the
          payment confirmation to finish processing. This page will update automatically.
        </p>
        {!stillWaiting && (
          <p className="muted" style={{ fontSize: '0.875rem' }}>
            Taking longer than expected? If you're running this locally, make sure{' '}
            <code>stripe listen --forward-to localhost:8080/api/v1/checkout/webhook</code> is running — refresh this page
            once it catches up.
          </p>
        )}
      </div>
    );
  }

  // Estimated delivery date, based on the chosen shipping option's max days.
  const deliveryDate = new Date(order.createdAt);
  deliveryDate.setDate(deliveryDate.getDate() + (order.deliveryOption?.estimatedDaysMax ?? 5));

  return (
    <div className="container" style={{ maxWidth: 800, padding: 48, textAlign: 'center' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ width: 80, height: 80, background: '#dcfce7', color: '#166534', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto', fontSize: "2.25rem" }}>
          ✓
        </div>
        <h1 style={{ marginBottom: 8 }}>Thank you for your order!</h1>
        <p className="muted" style={{ fontSize: "1.125rem" }}>We've received your order and are processing it now.</p>
      </div>

      <div className="panel" style={{ textAlign: 'left', marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 }}>
          <div>
            <span className="muted" style={{ display: 'block', fontSize: "0.8125rem", marginBottom: 4 }}>Reference Number</span>
            <strong>{order.id.toUpperCase()}</strong>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="muted" style={{ display: 'block', fontSize: "0.8125rem", marginBottom: 4 }}>Estimated Delivery</span>
            <strong>{deliveryDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</strong>
          </div>
        </div>

        <h3 style={{ marginTop: 0 }}>Order Summary</h3>
        {order.items.map(item => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
            <span>{item.quantity}x {item.product.name}</span>
            <span>{money(item.unitPrice * item.quantity, order.currency)}</span>
          </div>
        ))}
        
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 8, fontWeight: 'bold' }}>
          <span>Total</span>
          <span>{money(order.totalAmount, order.currency)}</span>
        </div>
      </div>

      <Link to="/shop" className="btn btn-primary">Continue Shopping</Link>
      {user && (
        <Link to={`/orders/${order.id}`} className="btn" style={{ marginLeft: 16 }}>View Details</Link>
      )}
    </div>
  );
}
