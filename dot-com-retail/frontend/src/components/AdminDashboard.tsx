import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/config';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, getAccessToken } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Debug: log user data
  /*useEffect(() => {
    console.log('AdminDashboard - user data:', user);
    console.log('is_staff:', user?.is_staff);
    console.log('twofa_enabled:', user?.twofa_enabled);
  }, [user]);*/
  
  // Check if user is admin with 2FA (wait for user data to load)
  useEffect(() => {
    // If user is null, we're still loading - don't check yet
    if (user === null) {
      return;
    }
    
    if (!user?.is_staff) {
      alert('Access denied. Admin access required.');
      navigate('/');
      return;
    }
    if (!user?.twofa_enabled) {
      alert('2FA is required for admin access. Please enable 2FA in your account settings.');
      navigate('/account/security');
      return;
    }
  }, [user, navigate]);

  // Show loading while user data is being fetched
  if (user === null) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!user?.is_staff || !user?.twofa_enabled) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
      
      {/* Tab Navigation */}
      <div className="border-b mb-6">
        <nav className="flex gap-4">
          {['dashboard', 'products', 'orders', 'users', 'reviews', 'bulk-upload'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-semibold ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {tab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'dashboard' && <DashboardTab getAccessToken={getAccessToken} />}
      {activeTab === 'products' && <ProductsTab getAccessToken={getAccessToken} />}
      {activeTab === 'orders' && <OrdersTab getAccessToken={getAccessToken} />}
      {activeTab === 'users' && <UsersTab getAccessToken={getAccessToken} />}
      {activeTab === 'reviews' && <ReviewsTab getAccessToken={getAccessToken} />}
      {activeTab === 'bulk-upload' && <BulkUploadTab getAccessToken={getAccessToken} />}
    </div>
  );
}

// Dashboard Stats Tab
function DashboardTab({ getAccessToken }: { getAccessToken: () => string | null }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const accessToken = getAccessToken();
      const res = await api.get('/admin-api/stats/', accessToken);
      setStats(res.data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading statistics...</div>;
  if (!stats) return <div>Failed to load statistics</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard title="Total Products" value={stats.total_products} />
      <StatCard title="Total Orders" value={stats.total_orders} />
      <StatCard title="Total Users" value={stats.total_users} />
      <StatCard title="Total Reviews" value={stats.total_reviews} />
      <StatCard title="Orders (30d)" value={stats.recent_orders_30d} />
      <StatCard title="Revenue (30d)" value={`$${stats.recent_revenue_30d.toFixed(2)}`} />
      <StatCard title="Low Stock" value={stats.low_stock_products} className="bg-yellow-50" />
      <StatCard title="Out of Stock" value={stats.out_of_stock_products} className="bg-red-50" />
    </div>
  );
}

function StatCard({ title, value, className = '' }: { title: string; value: any; className?: string }) {
  return (
    <div className={`bg-white p-6 rounded-lg shadow ${className}`}>
      <h3 className="text-gray-600 text-sm font-semibold mb-2">{title}</h3>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}

// Products Management Tab
function ProductsTab({ getAccessToken }: { getAccessToken: () => string | null }) {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const accessToken = getAccessToken();
      const res = await api.get('/products/categories/', accessToken);
      // Handle both array and paginated response
      const categoriesData = Array.isArray(res.data) ? res.data : (res.data.results || []);
      setCategories(categoriesData);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const loadProducts = async () => {
    try {
      const accessToken = getAccessToken();
      const res = await api.get('/products/?limit=100', accessToken);
      setProducts(res.data.results || []);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (product: any) => {
    setEditingId(product.id);
    setEditForm(product);
  };

  const handleSave = async () => {
    try {
      const accessToken = getAccessToken();
      await api.patch(`/admin-api/products/${editingId}/`, editForm, accessToken);
      alert('Product updated successfully');
      setEditingId(null);
      loadProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to update product');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this product?')) return;
    try {
      const accessToken = getAccessToken();
      await api.delete(`/admin-api/products/${id}/`, accessToken);
      alert('Product deleted');
      loadProducts();
    } catch (err: any) {
      alert(err.message || 'Failed to delete product');
    }
  };

  if (loading) return <div>Loading products...</div>;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 border">ID</th>
              <th className="px-4 py-2 border">Name</th>
              <th className="px-4 py-2 border">Price</th>
              <th className="px-4 py-2 border">Stock</th>
              <th className="px-4 py-2 border">Category</th>
              <th className="px-4 py-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map(product => (
              <tr key={product.id} className="hover:bg-gray-50">
                {editingId === product.id ? (
                  <>
                    <td className="px-4 py-2 border">{product.id}</td>
                    <td className="px-4 py-2 border">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                        className="border px-2 py-1 w-full"
                      />
                    </td>
                    <td className="px-4 py-2 border">
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.price}
                        onChange={(e) => setEditForm({...editForm, price: e.target.value})}
                        className="border px-2 py-1 w-full"
                      />
                    </td>
                    <td className="px-4 py-2 border">
                      <input
                        type="number"
                        value={editForm.stock_quantity}
                        onChange={(e) => setEditForm({...editForm, stock_quantity: e.target.value})}
                        className="border px-2 py-1 w-full"
                      />
                    </td>
                    <td className="px-4 py-2 border">
                      <select
                        value={typeof editForm.category === 'object' ? editForm.category?.id : editForm.category}
                        onChange={(e) => setEditForm({...editForm, category: parseInt(e.target.value)})}
                        className="border px-2 py-1 w-full"
                      >
                        <option value="">Select Category</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 border">
                      <button onClick={handleSave} className="bg-green-600 text-white px-3 py-1 rounded mr-2">Save</button>
                      <button onClick={() => setEditingId(null)} className="bg-gray-300 px-3 py-1 rounded">Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2 border">{product.id}</td>
                    <td className="px-4 py-2 border">{product.name}</td>
                    <td className="px-4 py-2 border">${product.price}</td>
                    <td className="px-4 py-2 border">{product.stock_quantity}</td>
                    <td className="px-4 py-2 border">{product.category_name || 'N/A'}</td>
                    <td className="px-4 py-2 border">
                      <button onClick={() => handleEdit(product)} className="bg-blue-600 text-white px-3 py-1 rounded mr-2">Edit</button>
                      <button onClick={() => handleDelete(product.id)} className="bg-red-600 text-white px-3 py-1 rounded">Delete</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Orders Management Tab
function OrdersTab({ getAccessToken }: { getAccessToken: () => string | null }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const accessToken = getAccessToken();
      const res = await api.get('/admin-api/orders/', accessToken);
      // Handle both array and paginated response
      const ordersData = Array.isArray(res.data) ? res.data : (res.data.results || []);
      setOrders(ordersData);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (orderId: number, newStatus: string) => {
    try {
      const accessToken = getAccessToken();
      await api.post(`/admin-api/orders/${orderId}/status/`, { status: newStatus }, accessToken);
      alert('Order status updated');
      loadOrders();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  if (loading) return <div>Loading orders...</div>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-2 border">Order ID</th>
            <th className="px-4 py-2 border">User</th>
            <th className="px-4 py-2 border">Total</th>
            <th className="px-4 py-2 border">Status</th>
            <th className="px-4 py-2 border">Date</th>
            <th className="px-4 py-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(order => (
            <tr key={order.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 border">{order.id}</td>
              <td className="px-4 py-2 border">{order.user_email}</td>
              <td className="px-4 py-2 border">${order.total_price}</td>
              <td className="px-4 py-2 border">
                <select
                  value={order.status}
                  onChange={(e) => updateStatus(order.id, e.target.value)}
                  className="border px-2 py-1"
                >
                  <option value="pending_payment">Pending Payment</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </td>
              <td className="px-4 py-2 border">{new Date(order.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-2 border">
                <button 
                  onClick={() => window.open(`/orders/${order.id}`, '_blank')}
                  className="bg-blue-600 text-white px-3 py-1 rounded"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Users Management Tab
function UsersTab({ getAccessToken }: { getAccessToken: () => string | null }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const accessToken = getAccessToken();
      const res = await api.get('/admin-api/users/', accessToken);
      // Handle both array and paginated response
      const usersData = Array.isArray(res.data) ? res.data : (res.data.results || []);
      setUsers(usersData);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = async (userId: number, currentIsStaff: boolean) => {
    try {
      const accessToken = getAccessToken();
      await api.patch(`/admin-api/users/${userId}/`, { is_staff: !currentIsStaff }, accessToken);
      alert('User role updated');
      loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to update role');
    }
  };

  if (loading) return <div>Loading users...</div>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-2 border">ID</th>
            <th className="px-4 py-2 border">Username</th>
            <th className="px-4 py-2 border">Email</th>
            <th className="px-4 py-2 border">Staff</th>
            <th className="px-4 py-2 border">2FA</th>
            <th className="px-4 py-2 border">Joined</th>
            <th className="px-4 py-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 border">{user.id}</td>
              <td className="px-4 py-2 border">{user.username}</td>
              <td className="px-4 py-2 border">{user.email}</td>
              <td className="px-4 py-2 border">{user.is_staff ? '✅' : '❌'}</td>
              <td className="px-4 py-2 border">{user.twofa_enabled ? '✅' : '❌'}</td>
              <td className="px-4 py-2 border">{new Date(user.date_joined).toLocaleDateString()}</td>
              <td className="px-4 py-2 border">
                <button
                  onClick={() => toggleRole(user.id, user.is_staff)}
                  className="bg-blue-600 text-white px-3 py-1 rounded"
                >
                  Toggle Admin
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Reviews Moderation Tab
function ReviewsTab({ getAccessToken }: { getAccessToken: () => string | null }) {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReviews();
  }, []);

  const loadReviews = async () => {
    try {
      const accessToken = getAccessToken();
      const res = await api.get('/admin-api/reviews/', accessToken);
      // Handle both array and paginated response
      const reviewsData = Array.isArray(res.data) ? res.data : (res.data.results || []);
      setReviews(reviewsData);
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteReview = async (reviewId: number) => {
    if (!confirm('Delete this review?')) return;
    try {
      const accessToken = getAccessToken();
      await api.delete(`/admin-api/reviews/${reviewId}/`, accessToken);
      alert('Review deleted');
      loadReviews();
    } catch (err: any) {
      alert(err.message || 'Failed to delete review');
    }
  };

  if (loading) return <div>Loading reviews...</div>;

  return (
    <div className="space-y-4">
      {reviews.map(review => (
        <div key={review.id} className="border p-4 rounded">
          <div className="flex justify-between items-start mb-2">
            <div>
              <span className="font-semibold">{review.user}</span> reviewed{' '}
              <span className="text-blue-600">{review.product}</span>
              <div className="text-yellow-500">{'⭐'.repeat(review.rating)}</div>
            </div>
            <button
              onClick={() => deleteReview(review.id)}
              className="bg-red-600 text-white px-3 py-1 rounded"
            >
              Delete
            </button>
          </div>
          <p className="text-gray-700">{review.review_text}</p>
          <p className="text-sm text-gray-500 mt-2">
            {review.helpful_count} helpful votes | {new Date(review.created_at).toLocaleDateString()}
          </p>
        </div>
      ))}
    </div>
  );
}

// Bulk Upload Tab
function BulkUploadTab({ getAccessToken }: { getAccessToken: () => string | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleUpload = async () => {
    if (!file) {
      alert('Please select a file');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      const accessToken = getAccessToken();
      const res = await api.post('/products/bulk-upload/', formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      setResult(res.data);
      alert(`Successfully created ${res.data.created_product_ids?.length || 0} products`);
    } catch (err: any) {
      alert(err.message || 'Upload failed');
      setResult({ error: err.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="bg-gray-50 p-6 rounded-lg mb-6">
        <h3 className="font-semibold mb-4">Bulk Upload Products</h3>
        <p className="text-sm text-gray-600 mb-4">
          Upload a JSON or CSV file with product data. Required fields: name, price, stock_quantity, category.
        </p>
        
        <div className="mb-4">
          <input
            type="file"
            accept=".json,.csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="border p-2 rounded"
          />
        </div>
        
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {result && (
        <div className="border p-4 rounded">
          <h4 className="font-semibold mb-2">Upload Result:</h4>
          <pre className="bg-gray-100 p-4 rounded overflow-x-auto text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
