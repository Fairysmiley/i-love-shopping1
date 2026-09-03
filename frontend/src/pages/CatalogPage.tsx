import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { flattenCategoryTree, getCachedCategoryTree, loadCategoryTree } from '../api/categoryTree';
import { ProductCard } from '../components/ProductCard';
import { StarRating } from '../components/StarRating';
import { SEO } from '../components/SEO';
import type { Category, Facets, Paginated, Product } from '../api/types';

const SORTS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'newest', label: 'Newest' },
];

export function CatalogPage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState<Paginated<Product> | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  // The full, unfiltered set of filterable brands/attributes for the current
  // category — used to decide what to RENDER, so filter sections never
  // disappear just because the current filter combination happens to match
  // zero items for some brand/attribute (a live-count issue, not a "this
  // filter doesn't exist" issue). `facets` (above) still drives the live counts.
  const [allFacets, setAllFacets] = useState<Facets | null>(null);
  const [categories, setCategories] = useState<Category[]>(getCachedCategoryTree);
  const [categoriesLoading, setCategoriesLoading] = useState(() => getCachedCategoryTree().length === 0);
  const [categoriesError, setCategoriesError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const fetchGen = useRef(0);

  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'relevance';
  const brands = params.getAll('brands');
  const minPrice = params.get('minPrice') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  const minRating = params.get('minRating') ?? '';
  const page = parseInt(params.get('page') ?? '1', 10);

  useEffect(() => {
    let active = true;
    setCategoriesLoading(true);
    setCategoriesError(false);

    loadCategoryTree()
      .then((tree) => {
        if (!active) return;
        if (tree?.length) {
          setCategories(tree);
          setCategoriesError(false);
        } else if (!getCachedCategoryTree().length) {
          setCategoriesError(true);
        }
      })
      .catch(() => {
        if (active) setCategoriesError(true);
      })
      .finally(() => {
        if (active) setCategoriesLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // The available filter structure is global — fetched once, unscoped by
  // category or any other active filter. It must NOT depend on `category`:
  // scoping it (e.g. `?category=shell-jackets`) would drop any brand/attribute
  // that has zero products in that category from the list entirely, including
  // one the user already has checked — leaving a stale filter silently active
  // with no checkbox left to uncheck it (the exact "disappearing filter" bug,
  // just triggered by category instead of another facet). `facets` (below)
  // still supplies the live, filter-aware counts.
  useEffect(() => {
    let active = true;
    api
      .get<Facets>('/products/facets')
      .then((f) => {
        if (active) setAllFacets(f);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Refetch when the URL query changes. Products load first (sidebar facets can follow).
  useEffect(() => {
    const gen = ++fetchGen.current;
    const controller = new AbortController();
    const query = location.search;

    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        const products = await api.get<Paginated<Product>>(`/products${query}`, {
          signal: controller.signal,
        });
        if (gen !== fetchGen.current) return;
        setResult(products);
        setLoadError(null);
        setLoading(false);

        // Facets are secondary — do not block the product grid.
        api
          .get<Facets>(`/products/facets${query}`, { signal: controller.signal })
          .then((f) => {
            if (gen === fetchGen.current) setFacets(f);
          })
          .catch(() => undefined);
      } catch (err) {
        if (gen !== fetchGen.current || controller.signal.aborted) return;
        const message =
          err instanceof Error && err.message ? err.message : 'Could not load products.';
        setLoadError(message);
        setLoading(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [location.search, reloadKey]);

  const update = (mutate: (p: URLSearchParams) => void) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      mutate(next);
      next.delete('page');
      return next;
    });
  };

  const toggleBrand = (slug: string) => {
    update((p) => {
      const current = p.getAll('brands');
      p.delete('brands');
      const set = new Set(current);
      if (set.has(slug)) set.delete(slug);
      else set.add(slug);
      set.forEach((b) => p.append('brands', b));
    });
  };

  const hasActiveFilters = Boolean(
    category || brands.length || minPrice || maxPrice || minRating || params.getAll('attributes').length,
  );

  const clearAllFilters = () => {
    update((p) => {
      p.delete('category');
      p.delete('brands');
      p.delete('minPrice');
      p.delete('maxPrice');
      p.delete('minRating');
      p.delete('attributes');
    });
  };

  const pageTitle = q ? `Search: ${q}` : category ? `Shop ${category}` : 'Shop All Products';
  const pageDescription = q
    ? `Search results for "${q}" in authenticated pre-loved Nordic outdoor gear from Fjällräven, Haglöfs, and Norrøna.`
    : `Browse ${result?.meta.total || ''} authentic pre-loved Nordic outdoor products from premium brands.`;

  return (
    <div className="container layout">
      <SEO
        title={pageTitle}
        description={pageDescription}
        canonical={`https://villi.com/shop${location.search}`}
      />
      <aside aria-label="Filters">
        <div className="panel">
          <h2 className="sr-only">Filters</h2>
          {hasActiveFilters && (
            <button
              type="button"
              className="btn"
              style={{ padding: '4px 10px', width: '100%', marginBottom: 12 }}
              onClick={clearAllFilters}
            >
              Clear all filters
            </button>
          )}
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
            {categoriesLoading && flattenCategoryTree(categories).length === 0 && (
              <p className="muted" style={{ fontSize: "0.8125rem", margin: '8px 0' }}>
                Loading categories…
              </p>
            )}
            {categoriesError && flattenCategoryTree(categories).length === 0 && !categoriesLoading && (
              <p className="muted" style={{ fontSize: "0.8125rem", margin: '8px 0' }}>
                Could not load categories.{' '}
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '2px 8px', fontSize: "0.75rem" }}
                  onClick={() => {
                    setCategoriesLoading(true);
                    setCategoriesError(false);
                    loadCategoryTree(true).then((tree) => {
                      setCategoriesLoading(false);
                      if (tree?.length) {
                        setCategories(tree);
                        setCategoriesError(false);
                      } else {
                        setCategoriesError(true);
                      }
                    });
                  }}
                >
                  Retry
                </button>
              </p>
            )}
            {flattenCategoryTree(categories).map((c) => (
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
              key={minPrice}
              type="number"
              aria-label="Minimum price"
              placeholder="Min"
              defaultValue={minPrice}
              onBlur={(e) => update((p) => (e.target.value ? p.set('minPrice', e.target.value) : p.delete('minPrice')))}
            />
            <input
              key={maxPrice}
              type="number"
              aria-label="Maximum price"
              placeholder="Max"
              defaultValue={maxPrice}
              onBlur={(e) => update((p) => (e.target.value ? p.set('maxPrice', e.target.value) : p.delete('maxPrice')))}
            />
          </div>

          {allFacets && allFacets.brands.length > 0 && (
            <>
              <h3>Brand</h3>
              <div className="facet-group">
                {allFacets.brands.map((b) => {
                  // Live count for the current filter combination; 0 (not
                  // hidden) when nothing currently matches this brand.
                  const liveCount = facets?.brands.find((fb) => fb.slug === b.slug)?.count ?? 0;
                  return (
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
                      <span className="count">{liveCount}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <h3>Rating</h3>
          <div className="facet-group">
            {[4, 3, 2, 1].map((r) => {
              // Products display Math.round(averageRating) stars (see
              // StarRating), so "N stars & up" must match anything that
              // ROUNDS to N or more — not just averageRating >= N exactly —
              // or a product visibly shown as N stars can vanish the moment
              // this exact filter is applied. N-0.5 is the rounding boundary.
              const threshold = r - 0.5;
              return (
                <div className="facet-row" key={r}>
                  <label style={{ margin: 0, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="minRating"
                      checked={minRating === String(threshold)}
                      onChange={() => update((p) => p.set('minRating', String(threshold)))}
                      style={{ width: 'auto', marginRight: 8 }}
                    />
                    <StarRating value={r} /> &amp; up
                  </label>
                </div>
              );
            })}
          </div>

          {allFacets &&
            Object.entries(allFacets.attributes).map(([name, values]) => (
              <div key={name}>
                <h3>{name}</h3>
                <div className="facet-group">
                  {Object.entries(values).map(([value]) => {
                    const token = `${name}:${value}`;
                    const active = params.getAll('attributes').includes(token);
                    // Live count for the current filter combination; 0 (not
                    // hidden) when nothing currently matches this value.
                    const liveCount = facets?.attributes[name]?.[value] ?? 0;
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
                                if (set.has(token)) set.delete(token);
                                else set.add(token);
                                set.forEach((t) => p.append('attributes', t));
                              })
                            }
                            style={{ width: 'auto', marginRight: 8 }}
                          />
                          {value}
                        </label>
                        <span className="count">{liveCount}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </aside>

      <main>
        <h1 className="sr-only">Catalog</h1>
        <div className="toolbar">
          <span className="result-count">
            {q ? <>Results for &ldquo;{q}&rdquo; &middot; </> : null}
            {loading && !result
              ? 'Loading…'
              : loadError && !result
                ? 'Unavailable'
                : result
                  ? `${result.meta.total} items`
                  : '—'}
          </span>
          <div className="nav-spacer" />
          <div style={{ display: 'flex', gap: 8, marginRight: 16 }}>
            <button 
              className={`btn ${viewMode === 'grid' ? 'btn-primary' : ''}`} 
              style={{ padding: '6px 10px' }}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              ⊞
            </button>
            <button 
              className={`btn ${viewMode === 'list' ? 'btn-primary' : ''}`} 
              style={{ padding: '6px 10px' }}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              ☰
            </button>
          </div>
          <label htmlFor="sort-select" className="sr-only">Sort products</label>
          <select id="sort-select" value={sort} onChange={(e) => update((p) => p.set('sort', e.target.value))} style={{ width: 220 }}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {loading && !result && <p className="muted">Loading items…</p>}

        {loadError && !result && !loading && (
          <div className="panel" style={{ marginBottom: 16, padding: 16 }}>
            <p style={{ margin: '0 0 10px' }}>{loadError}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Retry
            </button>
          </div>
        )}

        {loading && result && (
          <p className="muted" style={{ fontSize: "0.8125rem", marginBottom: 12 }}>
            Updating results…
          </p>
        )}

        {result && result.data.length === 0 && !loading && (
          <p className="muted">No items match your filters. Try widening your search.</p>
        )}

        <div className={viewMode === 'grid' ? "product-grid" : "product-list"}>
          {result?.data.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>

        {result && result.meta.totalPages > 1 && (
          <div className="toolbar" style={{ marginTop: 22, justifyContent: 'center' }}>
            <button
              className="btn"
              disabled={page <= 1}
              onClick={() =>
                setParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('page', String(page - 1));
                  return next;
                })
              }
            >
              Previous
            </button>
            <span className="muted">
              Page {result.meta.page} of {result.meta.totalPages}
            </span>
            <button
              className="btn"
              disabled={page >= result.meta.totalPages}
              onClick={() =>
                setParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('page', String(page + 1));
                  return next;
                })
              }
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
