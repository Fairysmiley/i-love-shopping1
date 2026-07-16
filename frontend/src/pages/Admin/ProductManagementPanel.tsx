import { useState, useEffect, useRef } from 'react';
import { api, ApiError } from '../../api/client';
import type { Product, Paginated } from '../../api/types';

export function ProductManagementPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProducts = async () => {
    try {
      const res = await api.get<Paginated<Product>>('/products');
      // The endpoint returns a paginated list. For a full admin panel, we'd add pagination controls.
      setProducts(res.data);
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
          // A very rudimentary CSV parser for demo purposes
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

        // Upload each product sequentially or in parallel
        for (const item of items) {
          // ensure price and stockQuantity are numbers
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

  if (loading) return <div>Loading products...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Products</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => alert('Add product modal would open here')}>
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
                <button className="btn btn-secondary" style={{ padding: '4px 8px', marginRight: 8 }}>Edit</button>
                <button className="btn btn-secondary" style={{ padding: '4px 8px', color: 'red' }} onClick={() => handleDelete(p.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
