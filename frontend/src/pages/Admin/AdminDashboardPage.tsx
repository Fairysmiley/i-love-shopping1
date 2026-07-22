import { useState } from 'react';
import { ProductManagementPanel } from './ProductManagementPanel';
import { OrderManagementPanel } from './OrderManagementPanel';
import { UserManagementPanel } from './UserManagementPanel';
import { ReviewManagementPanel } from './ReviewManagementPanel';
import { useAuth } from '../../auth/AuthContext';
import { Navigate } from 'react-router-dom';

export function AdminDashboardPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'products' | 'orders' | 'users' | 'reviews'>('products');

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container" style={{ padding: '28px 0' }}>
      <h1>Admin Dashboard</h1>
      <p className="muted">Manage the Villi commerce platform.</p>

      <div role="tablist" aria-label="Admin panels" style={{ display: 'flex', gap: 16, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        <button
          role="tab"
          aria-selected={activeTab === 'products'}
          aria-controls="panel-products"
          id="tab-products"
          className={`btn ${activeTab === 'products' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('products')}
        >
          Product Management
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'orders'}
          aria-controls="panel-orders"
          id="tab-orders"
          className={`btn ${activeTab === 'orders' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('orders')}
        >
          Order Management
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'users'}
          aria-controls="panel-users"
          id="tab-users"
          className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('users')}
        >
          User Management
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'reviews'}
          aria-controls="panel-reviews"
          id="tab-reviews"
          className={`btn ${activeTab === 'reviews' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('reviews')}
        >
          Review Moderation
        </button>
      </div>

      <div className="admin-panel" role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'products' && <ProductManagementPanel />}
        {activeTab === 'orders' && <OrderManagementPanel />}
        {activeTab === 'users' && <UserManagementPanel />}
        {activeTab === 'reviews' && <ReviewManagementPanel />}
      </div>
    </div>
  );
}
