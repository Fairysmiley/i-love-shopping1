import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { money } from '../format';
import { usePageTitle } from '../components/SEO';

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  product: {
    name: string;
    image: string | null;
  };
}

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  items: OrderItem[];
}

export function OrdersPage() {
  usePageTitle('My Orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, sortBy, sortOrder]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (statusFilter) queryParams.set('status', statusFilter);
      if (sortBy) queryParams.set('sortBy', sortBy);
      if (sortOrder) queryParams.set('sortOrder', sortOrder);

      const data = await api.get<Order[]>(`/orders?${queryParams.toString()}`);
      setOrders(data);
    } catch (error) {
      console.error('Failed to load orders', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ padding: 28, maxWidth: 900 }}>
      <h1>My Orders</h1>
      
      <div className="panel" style={{ display: 'flex', gap: 16, marginBottom: 24, alignItems: 'center' }}>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: "0.75rem" }}>Filter by Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '6px 12px' }}>
            <option value="">All Orders</option>
            <option value="PENDING">Pending</option>
            <option value="PAID">Paid</option>
            <option value="SHIPPED">Shipped</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: "0.75rem" }}>Sort By</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '6px 12px' }}>
            <option value="createdAt">Date</option>
            <option value="status">Status</option>
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: "0.75rem" }}>Order</label>
          <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ padding: '6px 12px' }}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="muted center">Loading orders...</p>
      ) : orders.length === 0 ? (
        <p className="muted center">No orders found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {orders.map(order => (
            <div key={order.id} className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontWeight: 'bold' }}>Order #{order.id.slice(0, 8).toUpperCase()}</p>
                <p className="muted" style={{ margin: '4px 0', fontSize: "0.8125rem" }}>
                  Placed on {new Date(order.createdAt).toLocaleDateString()}
                </p>
                <p style={{ margin: '4px 0', fontSize: "0.875rem" }}>
                  <span style={{ 
                    display: 'inline-block', 
                    padding: '2px 8px', 
                    borderRadius: 4, 
                    background: order.status === 'CANCELLED' ? '#fee2e2' : order.status === 'PAID' ? '#dcfce7' : '#f1f5f9',
                    color: order.status === 'CANCELLED' ? '#991b1b' : order.status === 'PAID' ? '#166534' : '#475569',
                    fontSize: "0.75rem",
                    fontWeight: 'bold'
                  }}>
                    {order.status}
                  </span>
                  <span style={{ marginLeft: 12 }}>{order.items.length} items</span>
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontWeight: 'bold', fontSize: "1.125rem", margin: '0 0 8px 0' }}>{money(order.totalAmount, order.currency)}</p>
                <Link to={`/orders/${order.id}`} className="btn">View Details</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
