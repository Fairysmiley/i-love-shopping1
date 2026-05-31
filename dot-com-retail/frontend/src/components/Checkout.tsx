import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { cartApi } from '../api/cart';
import { ordersApi, type ShippingOption, type Address, type CreateOrderRequest } from '../api/orders';
import { useAuth } from '../context/AuthContext';
import CheckoutForm from './CheckoutForm';
import { validateCheckout, parseApiErrorDetailed } from '../utils/checkoutValidation';

const Checkout = () => {
  const { getAccessToken, isAuthenticated } = useAuth();
  const accessToken = getAccessToken();
  const navigate = useNavigate();

  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string>('');
  const [orderId, setOrderId] = useState<number | null>(null);
  
  const [cart, setCart] = useState<any>(null);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [processingOrder, setProcessingOrder] = useState(false);

  // Form state
  const [guestEmail, setGuestEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [billingAddress, setBillingAddress] = useState<Address>({
    address: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'FI',
  });
  const [shippingAddress, setShippingAddress] = useState<Address>({
    address: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'FI',
  });
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [selectedShipping, setSelectedShipping] = useState<string>('standard');

  // Load saved checkout state from sessionStorage on mount
  useEffect(() => {
    const savedState = sessionStorage.getItem('checkout_state');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        if (state.guestEmail) setGuestEmail(state.guestEmail);
        if (state.phone) setPhone(state.phone);
        if (state.billingAddress) setBillingAddress(state.billingAddress);
        if (state.shippingAddress) setShippingAddress(state.shippingAddress);
        if (state.sameAsShipping !== undefined) setSameAsShipping(state.sameAsShipping);
        if (state.selectedShipping) setSelectedShipping(state.selectedShipping);
      } catch (err) {
        console.warn('Failed to restore checkout state:', err);
      }
    }
  }, []);

  // Save checkout state to sessionStorage whenever form data changes
  useEffect(() => {
    const checkoutState = {
      guestEmail,
      phone,
      billingAddress,
      shippingAddress,
      sameAsShipping,
      selectedShipping,
    };
    sessionStorage.setItem('checkout_state', JSON.stringify(checkoutState));
  }, [guestEmail, phone, billingAddress, shippingAddress, sameAsShipping, selectedShipping]);

  // Load Stripe and initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);

        // Load Stripe publishable key
        const stripeConfig = await ordersApi.getStripeConfig();
        setStripePromise(loadStripe(stripeConfig.publishable_key));

        // Load cart
        const cartData = await cartApi.getCart(accessToken);
        if (!cartData || cartData.items.length === 0) {
          navigate('/cart');
          return;
        }
        setCart(cartData);

        // Load shipping options (now returns array directly)
        const shipping = await ordersApi.getShippingOptions();
        if (Array.isArray(shipping)) {
          setShippingOptions(shipping);
        } else {
          console.error('Unexpected shipping options format:', shipping);
          setShippingOptions([]);
        }

        // Pre-fill user profile data for logged-in users
        if (isAuthenticated && accessToken) {
          try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/users/profile/`, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
              },
            });
            if (response.ok) {
              const userData = await response.json();
              // Pre-fill shipping address if profile data exists
              if (userData.profile) {
                const profile = userData.profile;
                
                // Pre-fill phone
                if (profile.phone) {
                  setPhone(profile.phone);
                }
                
                if (profile.address || profile.city || profile.state || profile.postal_code) {
                  setShippingAddress({
                    address: profile.address || '',
                    city: profile.city || '',
                    state: profile.state || '',
                    postal_code: profile.postal_code || '',
                    country: profile.country || 'FI',
                  });
                  // Also pre-fill billing address by default
                  setBillingAddress({
                    address: profile.address || '',
                    city: profile.city || '',
                    state: profile.state || '',
                    postal_code: profile.postal_code || '',
                    country: profile.country || 'FI',
                  });
                }
              }
            }
          } catch (err) {
            console.warn('Failed to load user profile:', err);
            // Don't block checkout if profile fetch fails
          }
        }

        setError(null);
      } catch (err) {
        console.error('Checkout load error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load checkout data');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [accessToken, navigate, isAuthenticated]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    setError(null);
    setFieldErrors({});

    // Client-side validation
    const validation = validateCheckout(
      guestEmail,
      isAuthenticated,
      shippingAddress,
      billingAddress,
      sameAsShipping,
      selectedShipping
    );

    if (!validation.isValid) {
      // Convert validation errors to field errors object
      const errors: Record<string, string> = {};
      validation.errors.forEach(err => {
        errors[err.field] = err.message;
      });
      setFieldErrors(errors);
      
      // Set a general error message
      setError('Please fix the errors below before continuing');
      
      // Scroll to first error
      const firstErrorField = document.querySelector('.border-red-500');
      if (firstErrorField) {
        firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      
      return;
    }

    setProcessingOrder(true);

    try {
      const finalBillingAddress = sameAsShipping ? shippingAddress : billingAddress;

      const orderData: CreateOrderRequest = {
        billing_address: finalBillingAddress,
        shipping_address: shippingAddress,
        shipping_method: selectedShipping,
        payment_method: 'stripe',
        ...((!isAuthenticated && guestEmail) && { guest_email: guestEmail }),
        ...(phone && { phone }),
      };

      const response = await ordersApi.createOrder(orderData, accessToken);
      setClientSecret(response.client_secret);
      setOrderId(response.order.id);
      
      // Clear saved checkout state after successful order creation
      sessionStorage.removeItem('checkout_state');
    } catch (err) {
      const errorDetails = parseApiErrorDetailed(err);
      setError(errorDetails.message);
      
      // Merge backend field errors with any existing errors
      if (Object.keys(errorDetails.fieldErrors).length > 0) {
        setFieldErrors(prev => ({ ...prev, ...errorDetails.fieldErrors }));
        
        // Scroll to first error
        setTimeout(() => {
          const firstErrorField = document.querySelector('.border-red-500');
          if (firstErrorField) {
            firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
      
      setProcessingOrder(false);
    }
  };

  const calculateTotal = () => {
    if (!cart) return '0.00';
    const subtotal = parseFloat(cart.total);
    const shipping = shippingOptions.find(opt => opt.id === selectedShipping);
    const shippingCost = shipping ? parseFloat(shipping.price) : 0;
    return (subtotal + shippingCost).toFixed(2);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return null; // Will redirect in useEffect
  }

  // Show payment form if we have client secret
  if (clientSecret && orderId && stripePromise) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Complete Payment</h1>
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <CheckoutForm 
            clientSecret={clientSecret} 
            orderId={orderId}
            orderTotal={calculateTotal()}
          />
        </Elements>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Checkout</h1>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleCreateOrder}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left side - Checkout form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Information */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Contact Information</h2>
              <div className="space-y-4">
                {/* Email for guests */}
                {!isAuthenticated && (
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      required
                      value={guestEmail}
                      onChange={(e) => {
                        setGuestEmail(e.target.value);
                        if (fieldErrors.email) {
                          const newErrors = { ...fieldErrors };
                          delete newErrors.email;
                          setFieldErrors(newErrors);
                        }
                      }}
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                        fieldErrors.email 
                          ? 'border-red-500 focus:border-red-500' 
                          : 'border-gray-300 focus:border-blue-500'
                      }`}
                      placeholder="your@email.com"
                    />
                    {fieldErrors.email && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>
                    )}
                    {!fieldErrors.email && (
                      <p className="mt-2 text-sm text-gray-500">
                        We'll send your order confirmation here
                      </p>
                    )}
                  </div>
                )}
                
                {/* Phone Number */}
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (fieldErrors.phone) {
                        const newErrors = { ...fieldErrors };
                        delete newErrors.phone;
                        setFieldErrors(newErrors);
                      }
                    }}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      fieldErrors.phone 
                        ? 'border-red-500 focus:border-red-500' 
                        : 'border-gray-300 focus:border-blue-500'
                    }`}
                    placeholder="+358 40 123 4567"
                  />
                  {fieldErrors.phone && (
                    <p className="mt-1 text-sm text-red-600">{fieldErrors.phone}</p>
                  )}
                  {!fieldErrors.phone && (
                    <p className="mt-2 text-sm text-gray-500">
                      For delivery updates (optional)
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Shipping Address</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="shipping-address" className="block text-sm font-medium text-gray-700 mb-2">
                    Street Address
                  </label>
                  <input
                    type="text"
                    id="shipping-address"
                    required
                    value={shippingAddress.address}
                    onChange={(e) => {
                      setShippingAddress({ ...shippingAddress, address: e.target.value });
                      if (fieldErrors.shipping_address) {
                        const newErrors = { ...fieldErrors };
                        delete newErrors.shipping_address;
                        setFieldErrors(newErrors);
                      }
                    }}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      fieldErrors.shipping_address 
                        ? 'border-red-500 focus:border-red-500' 
                        : 'border-gray-300 focus:border-blue-500'
                    }`}
                    placeholder="e.g., Mannerheimintie 1"
                  />
                  {fieldErrors.shipping_address && (
                    <p className="mt-1 text-sm text-red-600">{fieldErrors.shipping_address}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="shipping-city" className="block text-sm font-medium text-gray-700 mb-2">
                      City
                    </label>
                    <input
                      type="text"
                      id="shipping-city"
                      required
                      value={shippingAddress.city}
                      onChange={(e) => {
                        setShippingAddress({ ...shippingAddress, city: e.target.value });
                        if (fieldErrors.shipping_city) {
                          const newErrors = { ...fieldErrors };
                          delete newErrors.shipping_city;
                          setFieldErrors(newErrors);
                        }
                      }}
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                        fieldErrors.shipping_city 
                          ? 'border-red-500 focus:border-red-500' 
                          : 'border-gray-300 focus:border-blue-500'
                      }`}
                      placeholder="e.g., Helsinki"
                    />
                    {fieldErrors.shipping_city && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.shipping_city}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="shipping-state" className="block text-sm font-medium text-gray-700 mb-2">
                      State/Province
                    </label>
                    <input
                      type="text"
                      id="shipping-state"
                      value={shippingAddress.state}
                      onChange={(e) => {
                        setShippingAddress({ ...shippingAddress, state: e.target.value });
                        if (fieldErrors.shipping_state) {
                          const newErrors = { ...fieldErrors };
                          delete newErrors.shipping_state;
                          setFieldErrors(newErrors);
                        }
                      }}
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                        fieldErrors.shipping_state 
                          ? 'border-red-500 focus:border-red-500' 
                          : 'border-gray-300 focus:border-blue-500'
                      }`}
                      placeholder="Optional"
                    />
                    {fieldErrors.shipping_state && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.shipping_state}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="shipping-postal" className="block text-sm font-medium text-gray-700 mb-2">
                      Postal Code
                    </label>
                    <input
                      type="text"
                      id="shipping-postal"
                      required
                      value={shippingAddress.postal_code}
                      onChange={(e) => {
                        setShippingAddress({ ...shippingAddress, postal_code: e.target.value });
                        if (fieldErrors.shipping_postal_code) {
                          const newErrors = { ...fieldErrors };
                          delete newErrors.shipping_postal_code;
                          setFieldErrors(newErrors);
                        }
                      }}
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                        fieldErrors.shipping_postal_code 
                          ? 'border-red-500 focus:border-red-500' 
                          : 'border-gray-300 focus:border-blue-500'
                      }`}
                      placeholder={shippingAddress.country === 'FI' ? '00100' : '123 45'}
                    />
                    {fieldErrors.shipping_postal_code && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.shipping_postal_code}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="shipping-country" className="block text-sm font-medium text-gray-700 mb-2">
                      Country
                    </label>
                    <select
                      id="shipping-country"
                      required
                      value={shippingAddress.country}
                      onChange={(e) => {
                        setShippingAddress({ ...shippingAddress, country: e.target.value });
                        if (fieldErrors.shipping_country) {
                          const newErrors = { ...fieldErrors };
                          delete newErrors.shipping_country;
                          setFieldErrors(newErrors);
                        }
                      }}
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                        fieldErrors.shipping_country 
                          ? 'border-red-500 focus:border-red-500' 
                          : 'border-gray-300 focus:border-blue-500'
                      }`}
                    >
                      <option value="FI">Finland</option>
                      <option value="SE">Sweden</option>
                    </select>
                    {fieldErrors.shipping_country && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.shipping_country}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Billing Address */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Billing Address</h2>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sameAsShipping}
                    onChange={(e) => setSameAsShipping(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Same as shipping</span>
                </label>
              </div>

              {!sameAsShipping && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="billing-address" className="block text-sm font-medium text-gray-700 mb-2">
                      Street Address
                    </label>
                    <input
                      type="text"
                      id="billing-address"
                      required
                      value={billingAddress.address}
                      onChange={(e) => {
                        setBillingAddress({ ...billingAddress, address: e.target.value });
                        if (fieldErrors.billing_address) {
                          const newErrors = { ...fieldErrors };
                          delete newErrors.billing_address;
                          setFieldErrors(newErrors);
                        }
                      }}
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                        fieldErrors.billing_address 
                          ? 'border-red-500 focus:border-red-500' 
                          : 'border-gray-300 focus:border-blue-500'
                      }`}
                      placeholder="e.g., Mannerheimintie 1"
                    />
                    {fieldErrors.billing_address && (
                      <p className="mt-1 text-sm text-red-600">{fieldErrors.billing_address}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="billing-city" className="block text-sm font-medium text-gray-700 mb-2">
                        City
                      </label>
                      <input
                        type="text"
                        id="billing-city"
                        required
                        value={billingAddress.city}
                        onChange={(e) => {
                          setBillingAddress({ ...billingAddress, city: e.target.value });
                          if (fieldErrors.billing_city) {
                            const newErrors = { ...fieldErrors };
                            delete newErrors.billing_city;
                            setFieldErrors(newErrors);
                          }
                        }}
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                          fieldErrors.billing_city 
                            ? 'border-red-500 focus:border-red-500' 
                            : 'border-gray-300 focus:border-blue-500'
                        }`}
                        placeholder="e.g., Helsinki"
                      />
                      {fieldErrors.billing_city && (
                        <p className="mt-1 text-sm text-red-600">{fieldErrors.billing_city}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="billing-state" className="block text-sm font-medium text-gray-700 mb-2">
                        State/Province
                      </label>
                      <input
                        type="text"
                        id="billing-state"
                        value={billingAddress.state}
                        onChange={(e) => {
                          setBillingAddress({ ...billingAddress, state: e.target.value });
                          if (fieldErrors.billing_state) {
                            const newErrors = { ...fieldErrors };
                            delete newErrors.billing_state;
                            setFieldErrors(newErrors);
                          }
                        }}
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                          fieldErrors.billing_state 
                            ? 'border-red-500 focus:border-red-500' 
                            : 'border-gray-300 focus:border-blue-500'
                        }`}
                        placeholder="Optional"
                      />
                      {fieldErrors.billing_state && (
                        <p className="mt-1 text-sm text-red-600">{fieldErrors.billing_state}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="billing-postal" className="block text-sm font-medium text-gray-700 mb-2">
                        Postal Code
                      </label>
                      <input
                        type="text"
                        id="billing-postal"
                        required
                        value={billingAddress.postal_code}
                        onChange={(e) => {
                          setBillingAddress({ ...billingAddress, postal_code: e.target.value });
                          if (fieldErrors.billing_postal_code) {
                            const newErrors = { ...fieldErrors };
                            delete newErrors.billing_postal_code;
                            setFieldErrors(newErrors);
                          }
                        }}
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                          fieldErrors.billing_postal_code 
                            ? 'border-red-500 focus:border-red-500' 
                            : 'border-gray-300 focus:border-blue-500'
                        }`}
                        placeholder={billingAddress.country === 'FI' ? '00100' : '123 45'}
                      />
                      {fieldErrors.billing_postal_code && (
                        <p className="mt-1 text-sm text-red-600">{fieldErrors.billing_postal_code}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="billing-country" className="block text-sm font-medium text-gray-700 mb-2">
                        Country
                      </label>
                      <select
                        id="billing-country"
                        required
                        value={billingAddress.country}
                        onChange={(e) => {
                          setBillingAddress({ ...billingAddress, country: e.target.value });
                          if (fieldErrors.billing_country) {
                            const newErrors = { ...fieldErrors };
                            delete newErrors.billing_country;
                            setFieldErrors(newErrors);
                          }
                        }}
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                          fieldErrors.billing_country 
                            ? 'border-red-500 focus:border-red-500' 
                            : 'border-gray-300 focus:border-blue-500'
                        }`}
                      >
                        <option value="FI">Finland</option>
                        <option value="SE">Sweden</option>
                      </select>
                      {fieldErrors.billing_country && (
                        <p className="mt-1 text-sm text-red-600">{fieldErrors.billing_country}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Shipping Method */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Shipping Method</h2>
              <div className="space-y-3">
                {shippingOptions.map((option) => (
                  <label
                    key={option.id}
                    className="flex items-center justify-between p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-500 transition-colors"
                    style={{
                      borderColor: selectedShipping === option.id ? '#3B82F6' : undefined,
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      <input
                        type="radio"
                        name="shipping"
                        value={option.id}
                        checked={selectedShipping === option.id}
                        onChange={(e) => setSelectedShipping(e.target.value)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="font-medium text-gray-900">{option.name}</div>
                        <div className="text-sm text-gray-500">{option.delivery_days}</div>
                      </div>
                    </div>
                    <div className="font-bold text-gray-900">${parseFloat(option.price).toFixed(2)}</div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Right side - Order summary */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-200 rounded-lg p-6 sticky top-4">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Order Summary</h2>
              
              {/* Cart Items */}
              <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                {cart.items.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{item.product.name}</div>
                      <div className="text-gray-500">Qty: {item.quantity}</div>
                    </div>
                    <div className="font-medium text-gray-900">
                      ${(parseFloat(item.product.price) * item.quantity).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-200 pt-4 space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>${parseFloat(cart.total).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span>
                    ${(shippingOptions.find(opt => opt.id === selectedShipping)?.price || '0')}
                  </span>
                </div>
                <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-200">
                  <span>Total</span>
                  <span>${calculateTotal()}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={processingOrder}
                className="w-full mt-6 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingOrder ? 'Processing...' : 'Continue to Payment'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default Checkout;
