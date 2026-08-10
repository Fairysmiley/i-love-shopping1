import { useState } from 'react';
import { ProductManagementPanel } from './ProductManagementPanel';
import { OrderManagementPanel } from './OrderManagementPanel';
import { UserManagementPanel } from './UserManagementPanel';
import { ReviewManagementPanel } from './ReviewManagementPanel';
import { BulkUploadPanel } from './BulkUploadPanel';
import { DeliveryOptionsPanel } from './DeliveryOptionsPanel';
import { useAuth } from '../../auth/AuthContext';
import { Navigate } from 'react-router-dom';
import { usePageTitle } from '../../components/SEO';

type AdminTab = 'products' | 'orders' | 'users' | 'reviews' | 'bulk-upload' | 'delivery';

export function AdminDashboardPage() {
  usePageTitle('Admin Dashboard');
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('products');

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container" style={{ padding: '28px 0' }}>
      <h1>Admin Dashboard</h1>
      <p className="muted">Manage the Villi commerce platform.</p>

      <div role="tablist" aria-label="Admin panels" style={{ display: 'flex', gap: 12, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 12, flexWrap: 'wrap' }}>
        <button
          role="tab"
          aria-selected={activeTab === 'products'}
          aria-controls="panel-products"
          id="tab-products"
          className={`btn ${activeTab === 'products' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('products')}
        >
          Products
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'bulk-upload'}
          aria-controls="panel-bulk-upload"
          id="tab-bulk-upload"
          className={`btn ${activeTab === 'bulk-upload' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('bulk-upload')}
        >
          Bulk Upload
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'delivery'}
          aria-controls="panel-delivery"
          id="tab-delivery"
          className={`btn ${activeTab === 'delivery' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('delivery')}
        >
          Delivery Options
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'orders'}
          aria-controls="panel-orders"
          id="tab-orders"
          className={`btn ${activeTab === 'orders' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('orders')}
        >
          Orders
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'users'}
          aria-controls="panel-users"
          id="tab-users"
          className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('users')}
        >
          Users
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'reviews'}
          aria-controls="panel-reviews"
          id="tab-reviews"
          className={`btn ${activeTab === 'reviews' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('reviews')}
        >
          Reviews
        </button>
      </div>

      <div className="admin-panel" role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'products' && <ProductManagementPanel />}
        {activeTab === 'bulk-upload' && <BulkUploadPanel />}
        {activeTab === 'delivery' && <DeliveryOptionsPanel />}
        {activeTab === 'orders' && <OrderManagementPanel />}
        {activeTab === 'users' && <UserManagementPanel />}
        {activeTab === 'reviews' && <ReviewManagementPanel />}
      </div>
    </div>
  );
}
