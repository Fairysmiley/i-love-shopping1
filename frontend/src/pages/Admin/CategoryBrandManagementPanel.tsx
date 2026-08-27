import { useState, useEffect } from 'react';
import { api, ApiError } from '../../api/client';

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
}

interface Brand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
}

interface CategoryFormData {
  name: string;
  description: string;
  parentId: string;
}

interface BrandFormData {
  name: string;
  description: string;
  logoUrl: string;
}

const EMPTY_CATEGORY_FORM: CategoryFormData = { name: '', description: '', parentId: '' };
const EMPTY_BRAND_FORM: BrandFormData = { name: '', description: '', logoUrl: '' };

export function CategoryBrandManagementPanel() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryFormData>(EMPTY_CATEGORY_FORM);

  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [brandForm, setBrandForm] = useState<BrandFormData>(EMPTY_BRAND_FORM);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [cats, brs] = await Promise.all([
        api.get<Category[]>('/categories'),
        api.get<Brand[]>('/brands'),
      ]);
      setCategories(cats);
      setBrands(brs);
    } catch {
      setError('Failed to load categories and brands');
    } finally {
      setLoading(false);
    }
  };

  const resetCategoryForm = () => {
    setCategoryForm(EMPTY_CATEGORY_FORM);
    setEditingCategoryId(null);
    setShowCategoryForm(false);
  };

  const resetBrandForm = () => {
    setBrandForm(EMPTY_BRAND_FORM);
    setEditingBrandId(null);
    setShowBrandForm(false);
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        name: categoryForm.name,
        description: categoryForm.description || undefined,
        parentId: categoryForm.parentId || undefined,
      };
      if (editingCategoryId) {
        await api.patch(`/categories/${editingCategoryId}`, payload);
      } else {
        await api.post('/categories', payload);
      }
      await fetchAll();
      resetCategoryForm();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to save category');
    }
  };

  const handleBrandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        name: brandForm.name,
        description: brandForm.description || undefined,
        logoUrl: brandForm.logoUrl || undefined,
      };
      if (editingBrandId) {
        await api.patch(`/brands/${editingBrandId}`, payload);
      } else {
        await api.post('/brands', payload);
      }
      await fetchAll();
      resetBrandForm();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to save brand');
    }
  };

  const handleEditCategory = (c: Category) => {
    setCategoryForm({ name: c.name, description: c.description || '', parentId: c.parentId || '' });
    setEditingCategoryId(c.id);
    setShowCategoryForm(true);
  };

  const handleEditBrand = (b: Brand) => {
    setBrandForm({ name: b.name, description: b.description || '', logoUrl: b.logoUrl || '' });
    setEditingBrandId(b.id);
    setShowBrandForm(true);
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Delete this category? Products using it will need to be reassigned first.')) return;
    try {
      await api.del(`/categories/${id}`);
      await fetchAll();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete category');
    }
  };

  const handleDeleteBrand = async (id: string) => {
    if (!confirm('Delete this brand? Products using it will need to be reassigned first.')) return;
    try {
      await api.del(`/brands/${id}`);
      await fetchAll();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete brand');
    }
  };

  if (loading) {
    return <div>Loading categories and brands...</div>;
  }

  return (
    <div>
      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 24 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2>Category Management</h2>
            <p className="muted">Manage the product category tree.</p>
          </div>
          <button className="btn btn-primary" onClick={() => (showCategoryForm ? resetCategoryForm() : setShowCategoryForm(true))}>
            {showCategoryForm ? 'Cancel' : '+ Add Category'}
          </button>
        </div>

        {showCategoryForm && (
          <div className="card" style={{ padding: 24, marginBottom: 24 }}>
            <h3>{editingCategoryId ? 'Edit Category' : 'New Category'}</h3>
            <form onSubmit={handleCategorySubmit}>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="category-name" className="label">
                  Name <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  id="category-name"
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  required
                  placeholder="e.g., Shell Jackets"
                  style={{ width: '100%', marginTop: 4 }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="category-description" className="label">
                  Description
                </label>
                <textarea
                  id="category-description"
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  rows={2}
                  style={{ width: '100%', marginTop: 4 }}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label htmlFor="category-parent" className="label">
                  Parent category
                </label>
                <select
                  id="category-parent"
                  value={categoryForm.parentId}
                  onChange={(e) => setCategoryForm({ ...categoryForm, parentId: e.target.value })}
                  style={{ width: '100%', marginTop: 4 }}
                >
                  <option value="">None (top-level)</option>
                  {categories
                    .filter((c) => c.id !== editingCategoryId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="submit" className="btn btn-primary">
                  {editingCategoryId ? 'Update' : 'Create'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetCategoryForm}>
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
                <th style={{ padding: 16, textAlign: 'left' }}>Slug</th>
                <th style={{ padding: 16, textAlign: 'left' }}>Parent</th>
                <th style={{ padding: 16, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No categories found. Create one to get started.
                  </td>
                </tr>
              ) : (
                categories.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 16 }}>
                      <strong>{c.name}</strong>
                    </td>
                    <td style={{ padding: 16 }}>
                      <span className="muted">{c.slug}</span>
                    </td>
                    <td style={{ padding: 16 }}>
                      <span className="muted">{categories.find((p) => p.id === c.parentId)?.name || '—'}</span>
                    </td>
                    <td style={{ padding: 16, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleEditCategory(c)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => handleDeleteCategory(c.id)}
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
      </section>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2>Brand Management</h2>
            <p className="muted">Manage the brands products can be listed under.</p>
          </div>
          <button className="btn btn-primary" onClick={() => (showBrandForm ? resetBrandForm() : setShowBrandForm(true))}>
            {showBrandForm ? 'Cancel' : '+ Add Brand'}
          </button>
        </div>

        {showBrandForm && (
          <div className="card" style={{ padding: 24, marginBottom: 24 }}>
            <h3>{editingBrandId ? 'Edit Brand' : 'New Brand'}</h3>
            <form onSubmit={handleBrandSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="brand-name" className="label">
                  Name <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  id="brand-name"
                  type="text"
                  value={brandForm.name}
                  onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
                  required
                  placeholder="e.g., Fjällräven"
                  style={{ width: '100%', marginTop: 4 }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="brand-description" className="label">
                  Description
                </label>
                <textarea
                  id="brand-description"
                  value={brandForm.description}
                  onChange={(e) => setBrandForm({ ...brandForm, description: e.target.value })}
                  rows={2}
                  style={{ width: '100%', marginTop: 4 }}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label htmlFor="brand-logo" className="label">
                  Logo URL
                </label>
                <input
                  id="brand-logo"
                  type="text"
                  value={brandForm.logoUrl}
                  onChange={(e) => setBrandForm({ ...brandForm, logoUrl: e.target.value })}
                  placeholder="https://…"
                  style={{ width: '100%', marginTop: 4 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="submit" className="btn btn-primary">
                  {editingBrandId ? 'Update' : 'Create'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetBrandForm}>
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
                <th style={{ padding: 16, textAlign: 'left' }}>Slug</th>
                <th style={{ padding: 16, textAlign: 'left' }}>Description</th>
                <th style={{ padding: 16, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {brands.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No brands found. Create one to get started.
                  </td>
                </tr>
              ) : (
                brands.map((b) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 16 }}>
                      <strong>{b.name}</strong>
                    </td>
                    <td style={{ padding: 16 }}>
                      <span className="muted">{b.slug}</span>
                    </td>
                    <td style={{ padding: 16 }}>
                      <span className="muted">{b.description || '—'}</span>
                    </td>
                    <td style={{ padding: 16, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleEditBrand(b)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => handleDeleteBrand(b.id)}
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
      </section>
    </div>
  );
}
