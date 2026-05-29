import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { money } from '../format';
import type { Category, Facets, Paginated, Product } from '../api/types';

const SORTS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'newest', label: 'Newest' },
];

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return <span className="rating" aria-label={`${value} out of 5`}>{'\u2605'.repeat(full)}{'\u2606'.repeat(5 - full)}</span>;
}

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState<Paginated<Product> | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'relevance';
  const brands = params.getAll('brands');
  const minPrice = params.get('minPrice') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  const minRating = params.get('minRating') ?? '';
  const page = parseInt(params.get('page') ?? '1', 10);

  useEffect(() => {
    api.get<Category[]>('/categories/tree').then(setCategories).catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = params.toString();
    Promise.all([
      api.get<Paginated<Product>>(`/products?${qs}`),
      api.get<Facets>(`/products/facets?${qs}`),
    ])
      .then(([r, f]) => {
        setResult(r);
        setFacets(f);
      })
      .finally(() => setLoading(false));
  }, [params]);

  const update = (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    mutate(next);
    next.delete('page');
    setParams(next);
  };

  const toggleBrand = (slug: string) => {
    update((p) => {
      const current = p.getAll('brands');
      p.delete('brands');
      const set = new Set(current);
      set.has(slug) ? set.delete(slug) : set.add(slug);
      set.forEach((b) => p.append('brands', b));
    });
  };

  return (
    <div className="container layout">
      <aside>
        <div className="panel">
          <h3>Categories</h3>
          <div className="facet-group">
            <div className="facet-row">
              <button
                className="btn"
                style={{ padding: '4px 10px', width: '100%' }}
                onClick={() => update((p) => p.delete('category'))}
              >
                All categories
              </button>
            </div>
            {categories.flatMap((c) => [c, ...c.children]).map((c) => (
              <div className="facet-row" key={c.id}>
                <label style={{ margin: 0, cursor: 'pointer', color: category === c.slug ? 'var(--primary)' : undefined }}>
                  <input
                    type="radio"
                    name="category"
                    checked={category === c.slug}
                    onChange={() => update((p) => p.set('category', c.slug))}
                    style={{ width: 'auto', marginRight: 8 }}
                  />
                  {c.name}
                </label>
              </div>
            ))}
          </div>

          <h3>Price</h3>
          <div className="facet-group" style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              placeholder="Min"
              defaultValue={minPrice}
              onBlur={(e) => update((p) => (e.target.value ? p.set('minPrice', e.target.value) : p.delete('minPrice')))}
            />
            <input
              type="number"
              placeholder="Max"
              defaultValue={maxPrice}
              onBlur={(e) => update((p) => (e.target.value ? p.set('maxPrice', e.target.value) : p.delete('maxPrice')))}
            />
          </div>

          {facets && facets.brands.length > 0 && (
            <>
              <h3>Brand</h3>
              <div className="facet-group">
                {facets.brands.map((b) => (
                  <div className="facet-row" key={b.slug}>
                    <label style={{ margin: 0, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={brands.includes(b.slug)}
                        onChange={() => toggleBrand(b.slug)}
                        style={{ width: 'auto', marginRight: 8 }}
                      />
                      {b.name}
                    </label>
                    <span className="count">{b.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3>Rating</h3>
          <div className="facet-group">
            {[4, 3, 2, 1].map((r) => (
              <div className="facet-row" key={r}>
                <label style={{ margin: 0, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="minRating"
                    checked={minRating === String(r)}
                    onChange={() => update((p) => p.set('minRating', String(r)))}
                    style={{ width: 'auto', marginRight: 8 }}
                  />
                  <Stars value={r} /> &amp; up
                </label>
              </div>
            ))}
          </div>

          {facets &&
            Object.entries(facets.attributes).map(([name, values]) => (
              <div key={name}>
                <h3>{name}</h3>
                <div className="facet-group">
                  {Object.entries(values).map(([value, count]) => {
                    const token = `${name}:${value}`;
                    const active = params.getAll('attributes').includes(token);
                    return (
                      <div className="facet-row" key={value}>
                        <label style={{ margin: 0, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() =>
                              update((p) => {
                                const cur = p.getAll('attributes');
                                p.delete('attributes');
                                const set = new Set(cur);
                                set.has(token) ? set.delete(token) : set.add(token);
                                set.forEach((t) => p.append('attributes', t));
                              })
                            }
                            style={{ width: 'auto', marginRight: 8 }}
                          />
                          {value}
                        </label>
                        <span className="count">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </aside>

      <main>
        <div className="toolbar">
          <span className="result-count">
            {q ? <>Results for &ldquo;{q}&rdquo; &middot; </> : null}
            {result ? `${result.meta.total} items` : 'Loading...'}
          </span>
          <div className="nav-spacer" />
          <select value={sort} onChange={(e) => update((p) => p.set('sort', e.target.value))} style={{ width: 220 }}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {loading && <p className="muted">Loading items...</p>}

        {result && result.data.length === 0 && !loading && (
          <p className="muted">No items match your filters. Try widening your search.</p>
        )}

        <div className="grid">
          {result?.data.map((p) => (
            <Link to={`/product/${p.slug}`} className="card" key={p.id}>
              <img src={p.images[0]?.url} alt={p.images[0]?.altText ?? p.name} loading="lazy" />
              <div className="card-body">
                <div className="brand-tag">{p.brand.name}</div>
                <div className="name">{p.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
                  <Stars value={p.averageRating} />
                  <span className="muted" style={{ fontSize: 12 }}>
                    ({p.ratingCount})
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="price">{money(p.price, p.currency)}</span>
                  <span className={`badge ${p.inStock ? '' : 'out'}`}>
                    {p.inStock ? 'In stock' : 'Out of stock'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {result && result.meta.totalPages > 1 && (
          <div className="toolbar" style={{ marginTop: 22, justifyContent: 'center' }}>
            <button
              className="btn"
              disabled={page <= 1}
              onClick={() => setParams((p) => { p.set('page', String(page - 1)); return p; })}
            >
              Previous
            </button>
            <span className="muted">
              Page {result.meta.page} of {result.meta.totalPages}
            </span>
            <button
              className="btn"
              disabled={page >= result.meta.totalPages}
              onClick={() => setParams((p) => { p.set('page', String(page + 1)); return p; })}
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
