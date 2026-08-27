import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../cart/CartContext';
import { api, ApiError } from '../api/client';
import { money } from '../format';
import { SEO } from '../components/SEO';
import type { Product } from '../api/types';

export function CartPage() {
  const { cart, updateItem, removeItem } = useCart();
  const navigate = useNavigate();
  const [related, setRelated] = useState<Product[]>([]);
  const [error, setError] = useState('');

  const runCartAction = async (action: () => Promise<void>) => {
    try {
      setError('');
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update your cart.');
    }
  };

  // "Incorporate a section for related or recommended products based on the
  // items in the cart." (Task 2) — recommend from the first item's category.
  useEffect(() => {
    if (!cart || cart.items.length === 0) {
      setRelated([]);
      return;
    }
    const cartProductIds = new Set(cart.items.map((i) => i.productId));
    api
      .get<Product>(`/products/${cart.items[0].product.slug}`)
      .then((product) =>
        api.get<{ items: Product[] }>(`/products?category=${product.category?.slug}&limit=8`),
      )
      .then((res) => setRelated(res.items.filter((p) => !cartProductIds.has(p.id)).slice(0, 4)))
      .catch(() => setRelated([]));
  }, [cart?.items.length, cart?.items[0]?.productId]);

  if (!cart) return <div className="container" style={{ padding: 48, textAlign: 'center' }}>Loading...</div>;

  if (cart.items.length === 0) {
    return (
      <div className="container" style={{ padding: 48, textAlign: 'center', maxWidth: 600 }}>
        <SEO title="Shopping Cart" description="Your Villi shopping cart." canonical="https://villi.com/cart" noindex />
        <h1>Your Cart is Empty</h1>
        <p className="muted" style={{ marginBottom: 32 }}>Looks like you haven't added anything to your cart yet.</p>
        <Link to="/shop" className="btn btn-primary">Continue Shopping</Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 1000, padding: 28 }}>
    <SEO title="Shopping Cart" description="Review the items in your Villi shopping cart before checkout." canonical="https://villi.com/cart" noindex />
    <div className="layout" style={{ gridTemplateColumns: '2fr 1fr', gap: 32, padding: 0 }}>
      <div>
        <h1>Shopping Cart</h1>
        <p className="muted">{cart.items.length} items</p>
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {cart.items.map((item) => (
            <div key={item.productId} style={{ display: 'flex', gap: 16, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
              <Link to={`/product/${item.product.slug}`}>
                {item.product.image ? (
                  <img src={item.product.image} alt={item.product.name} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8 }} />
                ) : (
                  <div style={{ width: 100, height: 100, background: '#e2e8f0', borderRadius: 8 }} />
                )}
              </Link>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Link to={`/product/${item.product.slug}`} style={{ textDecoration: 'none', color: 'inherit', fontWeight: 'bold', fontSize: "1rem" }}>
                    {item.product.name}
                  </Link>
                  <span style={{ fontWeight: 'bold' }}>{money(item.product.price * item.quantity)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      className="btn"
                      style={{ padding: '2px 8px' }}
                      onClick={() => runCartAction(() => updateItem(item.productId, Math.max(1, item.quantity - 1)))}
                    >
                      -
                    </button>
                    <span style={{ minWidth: 24, textAlign: 'center' }}>{item.quantity}</span>
                    <button
                      className="btn"
                      style={{ padding: '2px 8px' }}
                      onClick={() => runCartAction(() => updateItem(item.productId, item.quantity + 1))}
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="btn"
                    style={{ color: 'var(--danger)', borderColor: 'var(--danger)', padding: '4px 8px', fontSize: "0.8125rem" }}
                    onClick={() => runCartAction(() => removeItem(item.productId))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="panel" style={{ position: 'sticky', top: 80 }}>
          <h2>Order Summary</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="muted">Subtotal (excluding shipping)</span>
            <span>{money(cart.total)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, paddingTop: 12, borderTop: '1px solid var(--border)', fontWeight: 'bold', fontSize: "1.125rem" }}>
            <span>Total</span>
            <span>{money(cart.total)}</span>
          </div>
          <button 
            className="btn btn-primary btn-block" 
            style={{ padding: '12px', fontSize: "1rem" }}
            onClick={() => navigate('/checkout')}
          >
            Proceed to Checkout
          </button>
        </div>
      </div>
    </div>

    {related.length > 0 && (
      <div style={{ marginTop: 48 }}>
        <h2>You might also like</h2>
        <div className="landing-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {related.map((p) => (
            <Link
              to={`/product/${p.slug}`}
              key={p.id}
              className="panel"
              style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
            >
              {p.images && p.images[0] ? (
                <img
                  src={p.images[0].url}
                  alt={p.name}
                  style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 8, marginBottom: 12 }}
                />
              ) : (
                <div style={{ width: '100%', aspectRatio: '1/1', background: '#e2e8f0', borderRadius: 8, marginBottom: 12 }} />
              )}
              <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem' }}>{p.name}</h3>
              <span style={{ fontWeight: 'bold' }}>{money(p.price)}</span>
            </Link>
          ))}
        </div>
      </div>
    )}
    </div>
  );
}
