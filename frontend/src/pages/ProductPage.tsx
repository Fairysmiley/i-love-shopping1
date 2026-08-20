import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { money } from '../format';
import { StarRating } from '../components/StarRating';
import { ProductReviews } from '../components/ProductReviews';
import { useCart } from '../cart/CartContext';
import { SEO } from '../components/SEO';
import type { Product } from '../api/types';

export function ProductPage() {
  const { slug } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [recommended, setRecommended] = useState<Product[]>([]);
  const [selectedImage, setSelectedImage] = useState(0);
  const { addItem } = useCart();

  const load = () => {
    if (!slug) return;
    api
      .get<Product>(`/products/${slug}`)
      .then((p) => {
        setProduct(p);
        setSelectedImage(0);
        // Fetch recommendations based on category
        api.get<{items: Product[]}>(`/products?category=${p.category?.slug}&limit=4`)
           .then(res => setRecommended(res.items.filter(item => item.id !== p.id).slice(0, 4)))
           .catch(() => {}); // ignore errors for recommendations
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  };

  useEffect(load, [slug]);

  if (error) return <div className="container" style={{ padding: 28 }}>{error}</div>;
  if (!product) return <div className="container" style={{ padding: 28 }}>Loading...</div>;

  const d = product.dimensions;

  return (
    <div className="container" style={{ padding: 28 }}>
      <SEO
        title={product.name}
        description={product.description}
        canonical={`https://villi.com/product/${product.slug}`}
        ogType="product"
        ogImage={product.images[0]?.url}
        ogImageAlt={product.images[0]?.altText || product.name}
        price={product.price}
        currency={product.currency}
        availability={product.inStock ? 'instock' : 'outofstock'}
      />
      <Link to="/shop" className="muted">
        &larr; Back to catalog
      </Link>
      <div className="layout product-detail">
        <div>
          <img
            src={product.images[selectedImage]?.url || product.images[0]?.url}
            alt={product.images[selectedImage]?.altText || `Photograph of ${product.name}`}
            style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
          />
          {product.images.length > 1 && (
            <div
              role="tablist"
              aria-label="Product images"
              style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}
            >
              {product.images.map((img, i) => (
                <button
                  key={img.url + i}
                  type="button"
                  role="tab"
                  aria-selected={i === selectedImage}
                  aria-label={`Show image ${i + 1} of ${product.images.length}`}
                  onClick={() => setSelectedImage(i)}
                  style={{
                    padding: 0,
                    border: i === selectedImage ? '2px solid var(--primary)' : '1px solid var(--border)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    width: 64,
                    height: 64,
                    background: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <img
                    src={img.thumbnailUrl || img.url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="brand-tag muted">
            {product.brand.name}
            {' · '}
            <Link to={`/shop?category=${product.category.slug}`}>{product.category.name}</Link>
          </div>
          <h1 style={{ margin: '4px 0' }}>{product.name}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0' }}>
            {product.attributes.find((a) => a.name === 'authenticity') && (
              <span className="badge" style={{ borderColor: 'var(--success)', color: 'var(--success)' }}>
                {'\u2713'} Verified authentic
              </span>
            )}
            {product.attributes.find((a) => a.name === 'condition') && (
              <span className="badge">
                Condition: {product.attributes.find((a) => a.name === 'condition')!.value}
              </span>
            )}
            {product.attributes.find((a) => a.name === 'size') && (
              <span className="badge">
                Size {product.attributes.find((a) => a.name === 'size')!.value}
              </span>
            )}
          </div>
          <p>
            <StarRating value={product.averageRating} count={product.ratingCount} showCount />
          </p>
          <p className="price" style={{ fontSize: "1.75rem" }}>
            {money(product.price, product.currency)}
          </p>
          <p>
            <span className={`badge ${product.inStock ? '' : 'out'}`}>
              {product.inStock ? `Available — ${product.stockQuantity} in stock` : 'Sold'}
            </span>
          </p>
          <p>{product.description}</p>

          <h2 className="muted">Specifications</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td className="muted" style={{ padding: '6px 0' }}>
                  Product ID
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                  {product.id}
                </td>
              </tr>
              {product.attributes.map((a) => (
                <tr key={a.name}>
                  <td className="muted" style={{ padding: '6px 0', textTransform: 'capitalize' }}>
                    {a.name}
                  </td>
                  <td style={{ textAlign: 'right' }}>{a.value}</td>
                </tr>
              ))}
              {d?.metric?.weightGrams != null && (
                <tr>
                  <td className="muted" style={{ padding: '6px 0' }}>
                    Weight
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {d.metric.weightGrams} g ({d.imperial.weightOz} oz)
                  </td>
                </tr>
              )}
              {d?.metric?.lengthMm != null && (
                <tr>
                  <td className="muted" style={{ padding: '6px 0' }}>
                    Dimensions (L&times;W&times;H)
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {d.metric.lengthMm}&times;{d.metric.widthMm}&times;{d.metric.heightMm} mm
                    {d.imperial.lengthIn != null && (
                      <>
                        {' '}
                        <span className="muted">
                          ({d.imperial.lengthIn}&times;{d.imperial.widthIn}&times;{d.imperial.heightIn} in)
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <button 
            className="btn btn-primary btn-block" 
            style={{ marginTop: 18 }} 
            disabled={!product.inStock || adding}
            onClick={async () => {
              setAdding(true);
              setError('');
              try {
                await addItem(product.id, 1);
              } catch (err: any) {
                setError(err.message || 'Could not add item to cart');
              } finally {
                setAdding(false);
              }
            }}
          >
            {adding ? 'Adding...' : 'Add to cart'}
          </button>
        </div>
      </div>

      <ProductReviews slug={product.slug} onChange={load} />

      {recommended.length > 0 && (
        <div style={{ marginTop: 64 }}>
          <h2>Related Products</h2>
          <div className="landing-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {recommended.map(p => (
              <Link to={`/product/${p.slug}`} key={p.id} className="panel" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                {p.images && p.images[0] ? (
                  <img src={p.images[0].url} alt={p.name} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 8, marginBottom: 12 }} />
                ) : (
                  <div style={{ width: '100%', aspectRatio: '1/1', background: '#e2e8f0', borderRadius: 8, marginBottom: 12 }} />
                )}
                <h3 style={{ margin: '0 0 4px 0', fontSize: "1rem" }}>{p.name}</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold' }}>{money(p.price)}</span>
                  {p.averageRating > 0 && <span style={{ fontSize: "0.8125rem", color: '#eab308' }}>★ {p.averageRating.toFixed(1)}</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
