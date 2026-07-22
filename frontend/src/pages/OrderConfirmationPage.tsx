import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { money } from '../format';

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  currency: string;
  shippingAddress: string;
  createdAt: string;
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

export function OrderConfirmationPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.get<Order>(`/orders/${id}`)
      .then(setOrder)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="container" style={{ padding: 48, textAlign: 'center' }}>Loading confirmation...</div>;
  if (!order) return <div className="container" style={{ padding: 48, textAlign: 'center' }}>Order not found.</div>;

  // Calculate an estimated delivery date (e.g. 5 days from creation)
  const deliveryDate = new Date(order.createdAt);
  deliveryDate.setDate(deliveryDate.getDate() + 5);

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
      <Link to={`/orders/${order.id}`} className="btn" style={{ marginLeft: 16 }}>View Details</Link>
    </div>
  );
}
