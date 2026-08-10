import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Address } from '../api/types';

type AddressForm = {
  label: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

const EMPTY_FORM: AddressForm = { label: '', street: '', city: '', postalCode: '', country: '', isDefault: false };

export function AddressBook() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);

  const load = () => {
    setLoading(true);
    api
      .get<Address[]>('/addresses')
      .then(setAddresses)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load addresses'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const startAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId('new');
  };

  const startEdit = (a: Address) => {
    setForm({ label: a.label ?? '', street: a.street, city: a.city, postalCode: a.postalCode, country: a.country, isDefault: a.isDefault });
    setEditingId(a.id);
  };

  const cancel = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...form, label: form.label || undefined };
      if (editingId === 'new') {
        await api.post('/addresses', payload);
      } else if (editingId) {
        await api.patch(`/addresses/${editingId}`, payload);
      }
      cancel();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save address');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this address?')) return;
    setError('');
    try {
      await api.del(`/addresses/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete address');
    }
  };

  const setDefault = async (a: Address) => {
    setError('');
    try {
      await api.patch(`/addresses/${a.id}`, { ...a, isDefault: true });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update address');
    }
  };

  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <h2>Addresses</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {addresses.length === 0 && <p className="muted">No saved addresses yet.</p>}
          {addresses.map((a) => (
            <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  {a.label && <strong>{a.label}</strong>}{' '}
                  {a.isDefault && (
                    <span className="badge" style={{ fontSize: '0.7rem' }}>
                      Default
                    </span>
                  )}
                  <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '0.875rem' }}>
                    {a.street}, {a.city} {a.postalCode}, {a.country}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!a.isDefault && (
                    <button type="button" className="btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => setDefault(a)}>
                      Set default
                    </button>
                  )}
                  <button type="button" className="btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => startEdit(a)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: '0.75rem', padding: '4px 8px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    onClick={() => remove(a.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingId ? (
        <form onSubmit={save} style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div className="field">
            <label htmlFor="addr-label">Label (optional)</label>
            <input id="addr-label" placeholder="Home, Work..." value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="addr-street">Street address</label>
            <input id="addr-street" required value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div className="field">
              <label htmlFor="addr-city">City</label>
              <input id="addr-city" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="addr-postal">Postal code</label>
              <input id="addr-postal" required value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="addr-country">Country</label>
            <input id="addr-country" required value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: '0.875rem' }}>
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
            Set as default address
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary">
              Save address
            </button>
            <button type="button" className="btn" onClick={cancel}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn" onClick={startAdd}>
          Add address
        </button>
      )}
    </div>
  );
}
