import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../cart/CartContext';
import { api, ApiError } from '../api/client';
import { money } from '../format';
import { useAuth } from '../auth/AuthContext';
import { StripePaymentForm } from '../components/StripePaymentForm';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

// We initialize Stripe with a dummy test key if VITE_STRIPE_PUBLIC_KEY is missing
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_TYooMQauvdEDq54NiTphI7jx');

export function CheckoutPage() {
  const { cart, refreshCart } = useCart();
  const navigate = useNavigate();
  const [shippingAddress, setShippingAddress] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const { user } = useAuth();

  // "For logged-in users, known information is pre-filled in the checkout form. (Task 2)"
  useEffect(() => {
    if (user) {
      setShippingAddress(`${user.firstName} ${user.lastName}\n`);
    }
  }, [user]);

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container" style={{ padding: 28 }}>
        <h1>Checkout</h1>
        <p>Your cart is empty.</p>
        <button className="btn" onClick={() => navigate('/shop')}>Continue shopping</button>
      </div>
    );
  }

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shippingAddress.trim() || shippingAddress.length < 10) {
      setError('Please enter a valid, complete shipping address');
      return;
    }
    setError('');
    setBusy(true);

    try {
      // 1. Create PENDING order
      const order = await api.post<{ id: string }>('/checkout', {
        paymentMethodId,
        shippingAddress,
      });
      setOrderId(order.id);

      // 2. Create Stripe Payment Intent
      const intent = await api.post<{ clientSecret: string, intentId: string }>('/checkout/create-intent', {
        orderId: order.id,
        amount: cart.total,
        currency: 'EUR'
      });
      setClientSecret(intent.clientSecret);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Order creation failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePaymentSuccess = () => {
    refreshCart();
    navigate(`/order-confirmation/${orderId}`);
  };

  const handlePaymentError = (err: string) => {
    setError(err);
  };

  return (
    <div className="container" style={{ padding: 28, maxWidth: 800 }}>
      <h1>Checkout</h1>
      
      <div className="layout" style={{ gap: 40, gridTemplateColumns: '1fr 320px', padding: 0 }}>
        <div>
          {!orderId ? (
            <form className="panel" onSubmit={handlePlaceOrder}>
              <h2>Shipping & Payment</h2>
              {error && <div className="alert alert-error">{error}</div>}
              
              <div className="field">
                <label htmlFor="address">Shipping Address</label>
                <textarea
                  id="address"
                  rows={3}
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="123 Example St&#10;City, Country 12345"
                  required
                  minLength={10}
                />
                <p className="muted" style={{ fontSize: "0.75rem" }}>Must be at least 10 characters.</p>
              </div>

              <div className="field">
                <label htmlFor="payment">Payment Method</label>
                <select
                  id="payment"
                  value={paymentMethodId}
                  onChange={(e) => setPaymentMethodId(e.target.value)}
                >
                  <option value="card">Credit / Debit Card</option>
                  <option value="paypal">PayPal</option>
                </select>
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Creating Order...' : `Proceed to Payment (${money(cart.total, 'EUR')})`}
              </button>
            </form>
          ) : (
            <div className="panel">
              <h2>Complete Payment</h2>
              {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
              
              {clientSecret && (
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <StripePaymentForm 
                    orderId={orderId}
                    onSuccess={handlePaymentSuccess}
                    onError={handlePaymentError}
                    onProcessing={setBusy}
                  />
                </Elements>
              )}
              
              {busy && <p className="muted center" style={{ marginTop: 16 }}>Processing your payment securely...</p>}
            </div>
          )}
        </div>

        <div>
          <div className="panel">
            <h2 style={{ fontSize: "1.125rem", marginTop: 0 }}>Order Summary</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {cart.items.map(item => (
                <div key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: "0.875rem" }}>
                  <span>{item.quantity}x {item.product.name}</span>
                  <span>{money(item.itemTotal, 'EUR')}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
              <span>Total</span>
              <span>{money(cart.total, 'EUR')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
