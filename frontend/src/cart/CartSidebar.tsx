import { useCart } from './CartContext';
import { money } from '../format';
import { Link } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { useNavigate } from 'react-router-dom';

export function CartSidebar() {
  const { cart, isOpen, setIsOpen, updateItem, removeItem } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const itemCount = cart?.items.reduce((acc, item) => acc + item.quantity, 0) || 0;

  return (
    <>
      <div 
        className="cart-backdrop" 
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99
        }}
        onClick={() => setIsOpen(false)}
      />
      <div 
        className="cart-panel panel" 
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-heading"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 400,
          background: 'var(--surface)', zIndex: 100, overflowY: 'auto', display: 'flex',
          flexDirection: 'column', borderLeft: '1px solid var(--border)',
          borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: 0
        }}
      >
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id="cart-heading" style={{ margin: 0 }}>Your Cart ({itemCount})</h2>
          <button className="btn" aria-label="Close cart" onClick={() => setIsOpen(false)} style={{ padding: '6px 10px' }}>&times;</button>
        </div>

        <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
          {!cart?.items.length ? (
            <p className="muted center" style={{ marginTop: 40 }}>Your cart is empty.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {cart.items.map(item => (
                <div key={item.productId} style={{ display: 'flex', gap: 16 }}>
                  {item.product.image ? (
                    <img src={item.product.image} alt={item.product.name} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 'var(--radius)' }} />
                  ) : (
                    <div style={{ width: 80, height: 80, background: 'var(--surface-2)', borderRadius: 'var(--radius)' }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <Link to={`/products/${item.product.slug}`} onClick={() => setIsOpen(false)} style={{ fontWeight: 600, color: 'var(--text)' }}>
                      {item.product.name}
                    </Link>
                    <div style={{ margin: '4px 0', fontSize: "0.875rem" }}>{money(item.product.price, 'EUR')}</div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <select 
                        value={item.quantity} 
                        onChange={(e) => updateItem(item.productId, Number(e.target.value))}
                        style={{ padding: '4px 8px', width: 'auto', borderRadius: 6 }}
                      >
                        {[...Array(Math.min(10, item.product.stockQuantity)).keys()].map(n => (
                          <option key={n+1} value={n+1}>{n+1}</option>
                        ))}
                      </select>
                      <button className="btn" onClick={() => removeItem(item.productId)} style={{ padding: '4px 8px', fontSize: "0.75rem" }}>Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart && cart.items.length > 0 && (
          <div style={{ padding: 20, borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontWeight: 700, fontSize: "1.125rem" }}>
              <span>Subtotal</span>
              <span>{money(cart.total, 'EUR')}</span>
            </div>
            <button 
              className="btn btn-primary btn-block" 
              onClick={() => {
                setIsOpen(false);
                if (user) {
                  navigate('/checkout');
                } else {
                  navigate('/login', { state: { next: '/checkout' } });
                }
              }}
            >
              Checkout
            </button>
          </div>
        )}
      </div>
    </>
  );
}
