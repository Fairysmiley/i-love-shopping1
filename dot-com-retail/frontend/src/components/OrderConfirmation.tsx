import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ordersApi, type Order } from '../api/orders';
import { useAuth } from '../context/AuthContext';

const OrderConfirmation = () => {
  const [searchParams] = useSearchParams();
  const { getAccessToken, refreshAccessToken } = useAuth();
  
  const orderId = searchParams.get('order_id');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Wait for auth state to be ready after Stripe redirect
  useEffect(() => {
    const initAuth = async () => {
      // Give AuthContext time to restore session from refresh token
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try to refresh token to ensure we have valid auth
      await refreshAccessToken();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      setAuthReady(true);
    };

    initAuth();
  }, [refreshAccessToken]);

  useEffect(() => {
    // Don't load order until auth is ready
    if (!authReady) return;

    const loadOrder = async () => {
      if (!orderId) {
        setError('No order ID provided');
        setLoading(false);
        return;
      }

      try {
        const accessToken = getAccessToken();
        const orderData = await ordersApi.getOrder(parseInt(orderId), accessToken);
        setOrder(orderData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load order');
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
    
    // Poll for updates every 2 seconds for up to 30 seconds
    // This handles the async message queue processing
    const pollInterval = setInterval(loadOrder, 2000);
    const stopPolling = setTimeout(() => clearInterval(pollInterval), 30000);
    
    return () => {
      clearInterval(pollInterval);
      clearTimeout(stopPolling);
    };
  }, [orderId, authReady, getAccessToken]);
 
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Order Not Found</h1>
          <p className="text-gray-600 mb-8">{error || 'Unable to load order details'}</p>
          <Link to="/orders" className="text-blue-600 hover:text-blue-700 font-medium">
            View All Orders
          </Link>
        </div>
      </div>
    );
  }

  const isPaymentSuccessful = order.payments && order.payments.length > 0 
    ? order.payments.some(p => p.status === 'successful')
    : false;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        {/* Success Message */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">{isPaymentSuccessful ? '✅' : '⏳'}</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {isPaymentSuccessful ? 'Order Confirmed!' : 'Order Received'}
          </h1>
          <p className="text-gray-600 mb-4">
            {isPaymentSuccessful 
              ? 'Thank you for your purchase. Your order has been confirmed.'
              : 'Your order is being processed. We\'ll send you an email confirmation shortly.'}
          </p>
          <div className="inline-block bg-gray-100 px-4 py-2 rounded-lg">
            <span className="text-sm text-gray-600">Order Number:</span>
            <span className="ml-2 font-bold text-gray-900">#{order.id}</span>
          </div>
        </div>

        {/* Order Details */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Order Summary</h2>
          
          <div className="space-y-3 mb-4 pb-4 border-b border-gray-200">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between">
                <div>
                  <div className="font-medium text-gray-900">{item.product_name}</div>
                  <div className="text-sm text-gray-500">Quantity: {item.quantity}</div>
                </div>
                <div className="font-medium text-gray-900">
                  ${(parseFloat(item.price_at_time) * item.quantity).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>${parseFloat(order.subtotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Shipping ({order.shipping_method})</span>
              <span>${parseFloat(order.shipping_cost).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span>
              <span>${parseFloat(order.total_amount).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Shipping Address */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="font-bold text-gray-900 mb-2">Shipping Address</h3>
          <div className="text-gray-600">
            <div>{order.shipping_address.address}</div>
            <div>
              {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}
            </div>
            <div>{order.shipping_address.country}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            to={`/orders/${order.id}`}
            className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors text-center font-semibold"
          >
            View Order Details
          </Link>
          <Link
            to="/products"
            className="flex-1 bg-gray-100 text-gray-900 py-3 rounded-lg hover:bg-gray-200 transition-colors text-center font-semibold"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmation;
