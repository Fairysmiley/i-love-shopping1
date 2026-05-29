import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { money } from '../format';
import type { Product } from '../api/types';

export function ProductPage() {
  const { slug } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) return;
    api
      .get<Product>(`/products/${slug}`)
      .then(setProduct)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, [slug]);

  if (error) return <div className="container" style={{ padding: 28 }}>{error}</div>;
  if (!product) return <div className="container" style={{ padding: 28 }}>Loading...</div>;

  const d = (product as Product & { dimensions?: any }).dimensions;

  return (
    <div className="container" style={{ padding: 28 }}>
      <Link to="/" className="muted">
        &larr; Back to catalog
      </Link>
      <div className="layout" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
        <img
          src={product.images[0]?.url}
          alt={product.images[0]?.altText ?? product.name}
          style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
        />
        <div>
          <div className="brand-tag muted">{product.brand.name}</div>
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
          <p className="rating">
            {'\u2605'.repeat(Math.round(product.averageRating))} ({product.ratingCount} reviews)
          </p>
          <p className="price" style={{ fontSize: 28 }}>
            {money(product.price, product.currency)}
          </p>
          <p>
            <span className={`badge ${product.inStock ? '' : 'out'}`}>
              {product.inStock ? 'Available — one-of-a-kind' : 'Sold'}
            </span>
          </p>
          <p>{product.description}</p>

          <h3 className="muted">Specifications</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
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
                    Dimensions
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {d.metric.lengthMm}&times;{d.metric.widthMm}&times;{d.metric.heightMm} mm
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} disabled={!product.inStock}>
            Add to cart
          </button>
          <p className="muted center" style={{ fontSize: 12, marginTop: 8 }}>
            Cart &amp; checkout arrive in the Commerce phase.
          </p>
        </div>
      </div>
    </div>
  );
}
