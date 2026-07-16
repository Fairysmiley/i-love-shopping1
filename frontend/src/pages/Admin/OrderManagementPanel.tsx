import { useState, useEffect } from 'react';
import { api, ApiError } from '../../api/client';
import type { Paginated } from '../../api/types';
import { money } from '../../format';

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  userId: string;
  status: 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
  total: number;
  currency: string;
  createdAt: string;
  items: OrderItem[];
}

export function OrderManagementPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOrders = async () => {
    try {
      const res = await api.get<Paginated<Order>>('/orders/all');
      setOrders(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await api.patch(`/orders/${id}/status`, { status });
      fetchOrders();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to update status');
    }
  };

  const handleRefund = async (id: string) => {
    if (!window.confirm('Are you sure you want to refund this order?')) return;
    try {
      await api.post(`/orders/${id}/refund`);
      alert('Order refunded successfully');
      fetchOrders();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to process refund');
    }
  };

  if (loading) return <div>Loading orders...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Orders</h2>
      <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
            <th style={{ padding: 8 }}>Order ID</th>
            <th style={{ padding: 8 }}>Date</th>
            <th style={{ padding: 8 }}>Total</th>
            <th style={{ padding: 8 }}>Status</th>
            <th style={{ padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: 8, fontSize: 14 }}>{o.id}</td>
              <td style={{ padding: 8 }}>{new Date(o.createdAt).toLocaleDateString()}</td>
              <td style={{ padding: 8 }}>{money(o.total, o.currency)}</td>
              <td style={{ padding: 8 }}>
                <select 
                  value={o.status} 
                  onChange={(e) => handleStatusChange(o.id, e.target.value)}
                  style={{ padding: '4px 8px' }}
                >
                  <option value="PENDING">Pending</option>
                  <option value="PAID">Paid</option>
                  <option value="SHIPPED">Shipped</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="REFUNDED">Refunded</option>
                </select>
              </td>
              <td style={{ padding: 8 }}>
                {o.status === 'PAID' || o.status === 'SHIPPED' || o.status === 'DELIVERED' ? (
                  <button className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={() => handleRefund(o.id)}>
                    Refund
                  </button>
                ) : (
                  <button className="btn btn-secondary" style={{ padding: '4px 8px' }} disabled>
                    Refund
                  </button>
                )}
              </td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: 16, textAlign: 'center' }}>No orders found</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
