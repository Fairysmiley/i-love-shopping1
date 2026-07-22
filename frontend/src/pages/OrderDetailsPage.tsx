import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
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
    productId: string;
    quantity: number;
    unitPrice: number;
    product: {
      name: string;
      image: string | null;
    };
  }[];
  payment?: {
    id: string;
    provider: string;
    status: string;
  };
}

export function OrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetchOrder();
  }, [id]);

  const fetchOrder = async () => {
    if (!id) return;
    try {
      const data = await api.get<Order>(`/orders/${id}`);
      setOrder(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Order not found');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!window.confirm('Are you sure you want to cancel this order? This cannot be undone.')) return;
    
    setCancelling(true);
    try {
      const data = await api.post<Order>(`/orders/${id}/cancel`);
      setOrder(data);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to cancel order');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="container" style={{ padding: 28 }}><p className="muted center">Loading order...</p></div>;
  if (error) return <div className="container" style={{ padding: 28 }}><div className="alert alert-error">{error}</div><Link to="/orders">Back to Orders</Link></div>;
  if (!order) return null;

  const canCancel = order.status === 'PENDING' || order.status === 'PAID';

  return (
    <div className="container" style={{ padding: 28, maxWidth: 900 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
        <Link to="/orders" className="muted" style={{ textDecoration: 'none' }}>&larr; Back to Orders</Link>
        <h1>Order #{order.id.slice(0, 8).toUpperCase()}</h1>
      </div>

      <div className="layout" style={{ gap: 32, gridTemplateColumns: '2fr 1fr', padding: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="panel">
            <h2>Order Items</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {order.items.map(item => (
                <div key={item.id} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  {item.product.image ? (
                    <img src={item.product.image} alt={item.product.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                  ) : (
                    <div style={{ width: 64, height: 64, background: '#e2e8f0', borderRadius: 8 }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 'bold' }}>{item.product.name}</p>
                    <p className="muted" style={{ margin: '4px 0', fontSize: "0.875rem" }}>Qty: {item.quantity}</p>
                  </div>
                  <div style={{ fontWeight: 'bold' }}>
                    {money(item.unitPrice * item.quantity, order.currency)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: "1.125rem" }}>
              <span>Total</span>
              <span>{money(order.totalAmount, order.currency)}</span>
            </div>
          </div>

          <div className="panel">
            <h2>Shipping Information</h2>
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, margin: 0 }}>
              {order.shippingAddress}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="panel">
            <h2>Order Status</h2>
            <p style={{ margin: '0 0 16px 0', fontSize: "1.125rem" }}>
              <span style={{ 
                display: 'inline-block', 
                padding: '4px 12px', 
                borderRadius: 4, 
                background: order.status === 'CANCELLED' ? '#fee2e2' : order.status === 'PAID' ? '#dcfce7' : '#f1f5f9',
                color: order.status === 'CANCELLED' ? '#991b1b' : order.status === 'PAID' ? '#166534' : '#475569',
                fontWeight: 'bold'
              }}>
                {order.status}
              </span>
            </p>
            
            <p className="muted" style={{ fontSize: "0.875rem", margin: '8px 0' }}>
              <strong>Date Placed:</strong><br />
              {new Date(order.createdAt).toLocaleString()}
            </p>
            
            {order.payment && (
              <p className="muted" style={{ fontSize: "0.875rem", margin: '8px 0' }}>
                <strong>Payment:</strong><br />
                {order.payment.provider} ({order.payment.status})
              </p>
            )}

            {canCancel && (
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <p className="muted" style={{ fontSize: "0.75rem", marginBottom: 12 }}>
                  You can cancel this order before it ships. Inventory will be automatically restocked.
                </p>
                <button 
                  className="btn btn-block" 
                  style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                  onClick={handleCancelOrder}
                  disabled={cancelling}
                >
                  {cancelling ? 'Cancelling...' : 'Cancel Order'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
