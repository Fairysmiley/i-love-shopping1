import { useState, useEffect, useRef } from 'react';
import { api, ApiError } from '../../api/client';
import type { Product, Paginated } from '../../api/types';

export function ProductManagementPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 0,
    stockQuantity: 0,
    categoryId: '',
    brandId: '',
    weightGrams: '',
    lengthMm: '',
    widthMm: '',
    heightMm: '',
    imageUrl: '',
  });

  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [brands, setBrands] = useState<{id: string, name: string}[]>([]);

  const fetchProducts = async () => {
    try {
      const [res, cats, brs] = await Promise.all([
        api.get<Paginated<Product>>('/products'),
        api.get<any[]>('/categories/tree'),
        api.get<any[]>('/brands'),
      ]);
      setProducts(res.data);
      setCategories(cats);
      setBrands(brs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await api.del(`/products/${id}`);
      setProducts(products.filter((p) => p.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete');
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        let items: any[] = [];
        
        if (file.name.endsWith('.json')) {
          items = JSON.parse(text);
        } else if (file.name.endsWith('.csv')) {
          const lines = text.split('\n');
          const headers = lines[0].split(',');
          items = lines.slice(1).filter(l => l.trim()).map(line => {
            const values = line.split(',');
            const obj: any = {};
            headers.forEach((h, i) => obj[h.trim()] = values[i]?.trim());
            return obj;
          });
        } else {
          throw new Error('Unsupported file format. Use JSON or CSV.');
        }

        for (const item of items) {
          if (item.price) item.price = Number(item.price);
          if (item.stockQuantity) item.stockQuantity = Number(item.stockQuantity);
          await api.post('/products', item);
        }
        
        alert('Bulk upload successful!');
        fetchProducts();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Bulk upload failed');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const openModal = (product?: Product) => {
    if (product) {
      setEditingId(product.id);
      setFormData({
        name: product.name,
        description: product.description,
        price: product.price,
        stockQuantity: product.stockQuantity,
        categoryId: product.category?.id || '',
        brandId: product.brand?.id || '',
        weightGrams: product.dimensions?.metric?.weightGrams?.toString() || '',
        lengthMm: product.dimensions?.metric?.lengthMm?.toString() || '',
        widthMm: product.dimensions?.metric?.widthMm?.toString() || '',
        heightMm: product.dimensions?.metric?.heightMm?.toString() || '',
        imageUrl: product.images?.[0]?.url || '',
      });
    } else {
      setEditingId(null);
      setFormData({
        name: '',
        description: '',
        price: 0,
        stockQuantity: 0,
        categoryId: categories[0]?.id || '',
        brandId: brands[0]?.id || '',
        weightGrams: '',
        lengthMm: '',
        widthMm: '',
        heightMm: '',
        imageUrl: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        name: formData.name,
        description: formData.description,
        price: Number(formData.price),
        stockQuantity: Number(formData.stockQuantity),
        categoryId: formData.categoryId,
        brandId: formData.brandId,
      };

      if (formData.weightGrams) payload.weightGrams = Number(formData.weightGrams);
      if (formData.lengthMm) payload.lengthMm = Number(formData.lengthMm);
      if (formData.widthMm) payload.widthMm = Number(formData.widthMm);
      if (formData.heightMm) payload.heightMm = Number(formData.heightMm);
      if (formData.imageUrl) payload.images = [{ url: formData.imageUrl, isPrimary: true }];

      if (editingId) {
        await api.patch(`/products/${editingId}`, payload);
      } else {
        await api.post('/products', payload);
      }
      setIsModalOpen(false);
      fetchProducts();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to save product');
    }
  };

  if (loading) return <div>Loading products...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Products</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => openModal()}>
            Add Product
          </button>
          <input 
            type="file" 
            accept=".json,.csv" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleBulkUpload} 
          />
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            Bulk Upload (JSON/CSV)
          </button>
        </div>
      </div>

      <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
            <th style={{ padding: 8 }}>Name</th>
            <th style={{ padding: 8 }}>Price</th>
            <th style={{ padding: 8 }}>Stock</th>
            <th style={{ padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: 8 }}>{p.name}</td>
              <td style={{ padding: 8 }}>{p.price} {p.currency}</td>
              <td style={{ padding: 8 }}>{p.stockQuantity}</td>
              <td style={{ padding: 8 }}>
                <button className="btn btn-secondary" style={{ padding: '4px 8px', marginRight: 8 }} onClick={() => openModal(p)}>Edit</button>
                <button className="btn btn-secondary" style={{ padding: '4px 8px', color: 'red' }} onClick={() => handleDelete(p.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="panel" style={{ width: 600, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>{editingId ? 'Edit Product' : 'Add Product'}</h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="field">
                <label>Name</label>
                <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="field">
                <label>Description</label>
                <textarea required rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="field">
                  <label>Price</label>
                  <input type="number" step="0.01" required value={formData.price} onChange={e => setFormData({...formData, price: Number(e.target.value)})} />
                </div>
                <div className="field">
                  <label>Stock</label>
                  <input type="number" required value={formData.stockQuantity} onChange={e => setFormData({...formData, stockQuantity: Number(e.target.value)})} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="field">
                  <label>Category</label>
                  <select required value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})}>
                    <option value="">Select a category...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Brand</label>
                  <select required value={formData.brandId} onChange={e => setFormData({...formData, brandId: e.target.value})}>
                    <option value="">Select a brand...</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Image URL (Optional)</label>
                <input value={formData.imageUrl} onChange={e => setFormData({...formData, imageUrl: e.target.value})} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                <div className="field">
                  <label>Weight (g)</label>
                  <input type="number" value={formData.weightGrams} onChange={e => setFormData({...formData, weightGrams: e.target.value})} />
                </div>
                <div className="field">
                  <label>Length (mm)</label>
                  <input type="number" value={formData.lengthMm} onChange={e => setFormData({...formData, lengthMm: e.target.value})} />
                </div>
                <div className="field">
                  <label>Width (mm)</label>
                  <input type="number" value={formData.widthMm} onChange={e => setFormData({...formData, widthMm: e.target.value})} />
                </div>
                <div className="field">
                  <label>Height (mm)</label>
                  <input type="number" value={formData.heightMm} onChange={e => setFormData({...formData, heightMm: e.target.value})} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Product</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
