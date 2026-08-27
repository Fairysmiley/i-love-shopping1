import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../cart/CartContext';
import { api, ApiError } from '../api/client';
import { money } from '../format';
import { useAuth } from '../auth/AuthContext';
import { StripePaymentForm } from '../components/StripePaymentForm';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { SEO } from '../components/SEO';
import type { Address as SavedAddress } from '../api/types';

// We initialize Stripe with a dummy test key if VITE_STRIPE_PUBLIC_KEY is missing
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_TYooMQauvdEDq54NiTphI7jx');

interface DeliveryOption {
  id: string;
  name: string;
  description: string | null;
  price: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
}

interface Address {
  street: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string;
}

const EMPTY_ADDRESS: Address = { street: '', city: '', postalCode: '', country: '', phone: '' };
// Lenient client-side check (digits, spaces, +()- , 7-20 chars) — the server's
// IsPhoneNumber validation is the strict, authoritative check.
const PHONE_PATTERN = /^\+?[0-9\s\-()]{7,20}$/;

export function CheckoutPage() {
  const { cart, refreshCart, updateItem, removeItem } = useCart();
  const navigate = useNavigate();
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [email, setEmail] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('card');
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [deliveryOptionId, setDeliveryOptionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  // Once this order's PaymentIntent has failed once, our backend has already
  // cancelled the order and released its stock (see handleStripeWebhook) —
  // Stripe would still technically accept a retry on the same intent, but
  // our Order is already closed out, so a second success on it would be
  // silently dropped by the order-status consumer's idempotency check. Force
  // a brand new order/intent instead of re-showing the same payment form.
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const { user } = useAuth();

  // "For logged-in users, known information is pre-filled in the checkout form. (Task 2)"
  useEffect(() => {
    if (!user) return;
    setEmail(user.email);
    api
      .get<SavedAddress[]>('/addresses')
      .then((addresses) => {
        setSavedAddresses(addresses);
        const preferred = addresses.find((a) => a.isDefault) ?? addresses[0];
        if (preferred) {
          setSelectedAddressId(preferred.id);
          setAddress((prev) => ({ street: preferred.street, city: preferred.city, postalCode: preferred.postalCode, country: preferred.country, phone: prev.phone }));
        }
      })
      .catch(() => setSavedAddresses([]));
  }, [user]);

  const selectSavedAddress = (id: string) => {
    setSelectedAddressId(id);
    if (!id) {
      setAddress(EMPTY_ADDRESS);
      return;
    }
    const found = savedAddresses.find((a) => a.id === id);
    if (found) {
      setAddress((prev) => ({ street: found.street, city: found.city, postalCode: found.postalCode, country: found.country, phone: prev.phone }));
    }
  };

  useEffect(() => {
    api
      .get<DeliveryOption[]>('/delivery-options?activeOnly=true')
      .then((options) => {
        setDeliveryOptions(options);
        if (options.length > 0) setDeliveryOptionId((current) => current || options[0].id);
      })
      .catch(() => setDeliveryOptions([]));
  }, []);

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container" style={{ padding: 28 }}>
        <SEO title="Checkout" description="Checkout securely with Villi — shipping, payment, and order summary in one page." canonical="https://villi.com/checkout" noindex />
        <h1>Checkout</h1>
        <p>Your cart is empty.</p>
        <button className="btn" onClick={() => navigate('/shop')}>Continue shopping</button>
      </div>
    );
  }

  const selectedOption = deliveryOptions.find((o) => o.id === deliveryOptionId);
  const shippingCost = selectedOption?.price ?? 0;
  const total = cart.total + shippingCost;

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.street.trim() || !address.city.trim() || !address.postalCode.trim() || !address.country.trim()) {
      setError('Please fill in your full shipping address.');
      return;
    }
    if (!address.phone.trim()) {
      setError('Please enter a phone number for delivery contact.');
      return;
    }
    if (!PHONE_PATTERN.test(address.phone.trim())) {
      setError('Please enter a valid phone number (e.g. +358 40 1234567).');
      return;
    }
    if (!user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address for your order confirmation.');
      return;
    }
    if (!deliveryOptionId) {
      setError('Please choose a shipping option.');
      return;
    }
    setError('');
    setBusy(true);

    try {
      // 1. Create PENDING order
      const order = await api.post<{ id: string }>('/checkout', {
        paymentMethodId,
        shippingAddress: address,
        deliveryOptionId,
        ...(user ? {} : { email }),
      });
      setOrderId(order.id);

      // 2. Create Stripe Payment Intent — amount is derived server-side from
      // the order we just created, never trusted from the client.
      const intent = await api.post<{ clientSecret: string, intentId: string }>('/checkout/create-intent', {
        orderId: order.id,
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
    setPaymentFailed(true);
  };

  /** Starts a fresh order from scratch after a failed payment — the failed
   *  order/PaymentIntent are already dead server-side, so retrying needs a
   *  new one, not another confirm on the same intent. The cart itself was
   *  already emptied when the failed order was created (processCheckout
   *  clears it up front, not on payment success), so refresh cart state
   *  here too — this naturally falls back to the page's own empty-cart view
   *  instead of re-showing stale items that can't actually be re-submitted. */
  const startNewOrder = () => {
    setOrderId(null);
    setClientSecret(null);
    setPaymentFailed(false);
    setError('');
    refreshCart();
  };

  const runCartAction = async (action: () => Promise<void>) => {
    try {
      setError('');
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update your cart.');
    }
  };

  return (
    <div className="container" style={{ padding: 28, maxWidth: 800 }}>
      <SEO title="Checkout" description="Checkout securely with Villi — shipping, payment, and order summary in one page." canonical="https://villi.com/checkout" noindex />
      <h1>Checkout</h1>

      <div className="layout" style={{ gap: 40, gridTemplateColumns: '1fr 320px', padding: 0 }}>
        <div>
          {!orderId ? (
            <form className="panel" onSubmit={handlePlaceOrder}>
              <h2>Shipping & Payment</h2>
              {error && <div className="alert alert-error">{error}</div>}

              {!user && (
                <div className="field">
                  <label htmlFor="guest-email">Email</label>
                  <input
                    id="guest-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                  <p className="muted" style={{ fontSize: '0.75rem' }}>
                    We'll send your order confirmation here. <a href="/login">Sign in</a> to check out faster next time.
                  </p>
                </div>
              )}

              {user && savedAddresses.length > 0 && (
                <div className="field">
                  <label htmlFor="saved-address">Shipping address</label>
                  <select
                    id="saved-address"
                    value={selectedAddressId}
                    onChange={(e) => selectSavedAddress(e.target.value)}
                  >
                    <option value="">Enter a new address</option>
                    {savedAddresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label ? `${a.label} — ` : ''}
                        {a.street}, {a.city}
                        {a.isDefault ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="field">
                <label htmlFor="street">Street address</label>
                <input
                  id="street"
                  value={address.street}
                  onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  placeholder="123 Example St"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <div className="field">
                  <label htmlFor="city">City</label>
                  <input
                    id="city"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    placeholder="Helsinki"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="postalCode">Postal code</label>
                  <input
                    id="postalCode"
                    value={address.postalCode}
                    onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                    placeholder="00100"
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="country">Country</label>
                <input
                  id="country"
                  value={address.country}
                  onChange={(e) => setAddress({ ...address, country: e.target.value })}
                  placeholder="Finland"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  type="tel"
                  value={address.phone}
                  onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                  placeholder="+358 40 1234567"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="delivery">Shipping option</label>
                <select
                  id="delivery"
                  value={deliveryOptionId}
                  onChange={(e) => setDeliveryOptionId(e.target.value)}
                  required
                >
                  {deliveryOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name} — {money(opt.price, 'EUR')} ({opt.estimatedDaysMin}-{opt.estimatedDaysMax} days)
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="payment">Payment Method</label>
                <select
                  id="payment"
                  value={paymentMethodId}
                  onChange={(e) => setPaymentMethodId(e.target.value)}
                >
                  <option value="card">Credit / Debit Card (Stripe)</option>
                </select>
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Creating Order...' : `Proceed to Payment (${money(total, 'EUR')})`}
              </button>
            </form>
          ) : (
            <div className="panel">
              <h2>Complete Payment</h2>
              {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

              {paymentFailed ? (
                <div>
                  <p className="muted">
                    This order wasn't charged and won't be retried — place a new order to try again with a different card.
                  </p>
                  <button type="button" className="btn btn-primary" onClick={startNewOrder}>
                    Start a new order
                  </button>
                </div>
              ) : (
                clientSecret && (
                  <Elements stripe={stripePromise} options={{ clientSecret }}>
                    <StripePaymentForm
                      orderId={orderId}
                      onSuccess={handlePaymentSuccess}
                      onError={handlePaymentError}
                      onProcessing={setBusy}
                    />
                  </Elements>
                )
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
                <div key={item.productId} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: "0.875rem" }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{item.product.name}</span>
                    <span>{money(item.itemTotal, 'EUR')}</span>
                  </div>
                  {!orderId && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '0 6px', fontSize: '0.75rem' }}
                          onClick={() => runCartAction(() => updateItem(item.productId, Math.max(1, item.quantity - 1)))}
                        >
                          -
                        </button>
                        <span style={{ minWidth: 18, textAlign: 'center' }}>{item.quantity}</span>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '0 6px', fontSize: '0.75rem' }}
                          onClick={() => runCartAction(() => updateItem(item.productId, item.quantity + 1))}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn"
                        style={{ color: 'var(--danger)', borderColor: 'var(--danger)', padding: '0 6px', fontSize: '0.7rem' }}
                        onClick={() => runCartAction(() => removeItem(item.productId))}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: 4 }}>
              <span className="muted">Subtotal</span>
              <span>{money(cart.total, 'EUR')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: 16 }}>
              <span className="muted">Shipping{selectedOption ? ` (${selectedOption.name})` : ''}</span>
              <span>{money(shippingCost, 'EUR')}</span>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
              <span>Total</span>
              <span>{money(total, 'EUR')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
