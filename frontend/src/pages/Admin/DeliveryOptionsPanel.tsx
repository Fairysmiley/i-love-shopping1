import { useState, useEffect } from 'react';
import { api } from '../../api/client';

interface DeliveryOption {
  id: string;
  name: string;
  description?: string;
  price: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DeliveryOptionFormData {
  name: string;
  description: string;
  price: string;
  estimatedDaysMin: string;
  estimatedDaysMax: string;
  isActive: boolean;
}

export function DeliveryOptionsPanel() {
  const [options, setOptions] = useState<DeliveryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<DeliveryOptionFormData>({
    name: '',
    description: '',
    price: '',
    estimatedDaysMin: '1',
    estimatedDaysMax: '7',
    isActive: true,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    try {
      const response = await api.get<DeliveryOption[]>('/delivery-options');
      setOptions(response);
    } catch (err: any) {
      setError('Failed to load delivery options');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const payload = {
        name: formData.name,
        description: formData.description || undefined,
        price: parseFloat(formData.price),
        estimatedDaysMin: parseInt(formData.estimatedDaysMin),
        estimatedDaysMax: parseInt(formData.estimatedDaysMax),
        isActive: formData.isActive,
      };

      if (editingId) {
        await api.patch(`/delivery-options/${editingId}`, payload);
      } else {
        await api.post('/delivery-options', payload);
      }

      await fetchOptions();
      resetForm();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save delivery option');
    }
  };

  const handleEdit = (option: DeliveryOption) => {
    setFormData({
      name: option.name,
      description: option.description || '',
      price: option.price.toString(),
      estimatedDaysMin: option.estimatedDaysMin.toString(),
      estimatedDaysMax: option.estimatedDaysMax.toString(),
      isActive: option.isActive,
    });
    setEditingId(option.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this delivery option?')) {
      return;
    }

    try {
      await api.del(`/delivery-options/${id}`);
      await fetchOptions();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete delivery option');
    }
  };

  const handleToggleActive = async (option: DeliveryOption) => {
    try {
      await api.patch(`/delivery-options/${option.id}`, {
        isActive: !option.isActive,
      });
      await fetchOptions();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update delivery option');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      price: '',
      estimatedDaysMin: '1',
      estimatedDaysMax: '7',
      isActive: true,
    });
    setEditingId(null);
    setShowForm(false);
  };

  if (loading) {
    return <div>Loading delivery options...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2>Delivery Options Management</h2>
          <p className="muted">Manage shipping methods and delivery options.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : '+ Add Delivery Option'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 24 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {showForm && (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <h3>{editingId ? 'Edit Delivery Option' : 'New Delivery Option'}</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="name" className="label">
                Name <span style={{ color: 'red' }}>*</span>
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g., Standard Shipping"
                style={{ width: '100%', marginTop: 4 }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="description" className="label">
                Description
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g., Delivery within 3-5 business days"
                rows={3}
                style={{ width: '100%', marginTop: 4 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label htmlFor="price" className="label">
                  Price ($) <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                  placeholder="9.99"
                  style={{ width: '100%', marginTop: 4 }}
                />
              </div>

              <div>
                <label htmlFor="estimatedDaysMin" className="label">
                  Min Days <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  id="estimatedDaysMin"
                  type="number"
                  min="0"
                  value={formData.estimatedDaysMin}
                  onChange={(e) => setFormData({ ...formData, estimatedDaysMin: e.target.value })}
                  required
                  style={{ width: '100%', marginTop: 4 }}
                />
              </div>

              <div>
                <label htmlFor="estimatedDaysMax" className="label">
                  Max Days <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  id="estimatedDaysMax"
                  type="number"
                  min="0"
                  value={formData.estimatedDaysMax}
                  onChange={(e) => setFormData({ ...formData, estimatedDaysMax: e.target.value })}
                  required
                  style={{ width: '100%', marginTop: 4 }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <span style={{ marginLeft: 8 }}>Active (available for customers)</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button type="submit" className="btn btn-primary">
                {editingId ? 'Update' : 'Create'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
              <th style={{ padding: 16, textAlign: 'left' }}>Name</th>
              <th style={{ padding: 16, textAlign: 'left' }}>Description</th>
              <th style={{ padding: 16, textAlign: 'right' }}>Price</th>
              <th style={{ padding: 16, textAlign: 'center' }}>Delivery Time</th>
              <th style={{ padding: 16, textAlign: 'center' }}>Status</th>
              <th style={{ padding: 16, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {options.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                  No delivery options found. Create one to get started.
                </td>
              </tr>
            ) : (
              options.map((option) => (
                <tr key={option.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 16 }}>
                    <strong>{option.name}</strong>
                  </td>
                  <td style={{ padding: 16 }}>
                    <span className="muted">{option.description || '-'}</span>
                  </td>
                  <td style={{ padding: 16, textAlign: 'right' }}>
                    ${option.price.toFixed(2)}
                  </td>
                  <td style={{ padding: 16, textAlign: 'center' }}>
                    {option.estimatedDaysMin}-{option.estimatedDaysMax} days
                  </td>
                  <td style={{ padding: 16, textAlign: 'center' }}>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor: option.isActive ? '#d1fae5' : '#fee2e2',
                        color: option.isActive ? '#065f46' : '#991b1b',
                      }}
                    >
                      {option.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: 16, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleEdit(option)}
                        title="Edit"
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleToggleActive(option)}
                        title={option.isActive ? 'Deactivate' : 'Activate'}
                        style={{
                          backgroundColor: option.isActive ? '#fef3c7' : '#d1fae5',
                          color: option.isActive ? '#92400e' : '#065f46',
                        }}
                      >
                        {option.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleDelete(option.id)}
                        title="Delete"
                        style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
