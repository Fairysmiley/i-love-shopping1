import { useState, useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { ordersApi, type Order } from '../api/orders';
import { useAuth } from '../context/AuthContext';

const OrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { getAccessToken, isAuthenticated } = useAuth();
  const accessToken = getAccessToken();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');

  useEffect(() => {
    loadOrder();
  }, [orderId, accessToken]);

  const loadOrder = async () => {
    if (!orderId) return;

    try {
      setLoading(true);
      const data = await ordersApi.getOrder(parseInt(orderId), accessToken);
      setOrder(data);
      setRefundAmount(data.total_amount);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order || !window.confirm('Are you sure you want to cancel this order?')) return;

    setActionLoading(true);
    try {
      const updated = await ordersApi.cancelOrder(order.id, accessToken);
      setOrder(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel order');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefundOrder = async () => {
    if (!order) return;

    const amount = parseFloat(refundAmount);
    const maxAmount = parseFloat(order.total_amount);

    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid refund amount');
      return;
    }

    if (amount > maxAmount) {
      setError(`Refund amount cannot exceed $${maxAmount.toFixed(2)}`);
      return;
    }

    setActionLoading(true);
    try {
      const updated = await ordersApi.refundOrder(order.id, refundAmount, accessToken);
      setOrder(updated);
      setShowRefundModal(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process refund');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending_payment: 'bg-yellow-100 text-yellow-800',
      payment_failed: 'bg-red-100 text-red-800',
      processing: 'bg-blue-100 text-blue-800',
      shipped: 'bg-purple-100 text-purple-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-gray-100 text-gray-800',
      refunded: 'bg-orange-100 text-orange-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const formatStatus = (status: string) => {
    return status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const canCancel = order?.status === 'pending_payment' || order?.status === 'processing';
  const canRefund = order?.status === 'delivered' || order?.status === 'shipped';

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!order) {
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

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link to="/orders" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
          ← Back to Orders
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Order #{order.id}</h1>
            <p className="text-gray-600 mt-1">
              Placed on {new Date(order.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
          <span className={`px-4 py-2 rounded-full text-sm font-medium ${getStatusColor(order.status)}`}>
            {formatStatus(order.status)}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left side - Order details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Order Items</h2>
            <div className="space-y-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex justify-between pb-4 border-b border-gray-200 last:border-0">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{item.product_name}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      ${parseFloat(item.price_at_time).toFixed(2)} × {item.quantity}
                    </div>
                  </div>
                  <div className="font-bold text-gray-900">
                    ${(parseFloat(item.price_at_time) * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping Address */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Shipping Address</h2>
            <div className="text-gray-700">
              <div>{order.shipping_address.address}</div>
              <div>
                {order.shipping_address.city}
                {order.shipping_address.state && `, ${order.shipping_address.state}`} {order.shipping_address.postal_code}
              </div>
              <div>{order.shipping_address.country}</div>
            </div>
            {order.tracking_number && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-sm text-gray-700">Tracking Number:</span>
                <span className="ml-2 font-mono font-bold text-blue-700">{order.tracking_number}</span>
              </div>
            )}
          </div>

          {/* Billing Address */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Billing Address</h2>
            <div className="text-gray-700">
              <div>{order.billing_address.address}</div>
              <div>
                {order.billing_address.city}
                {order.billing_address.state && `, ${order.billing_address.state}`} {order.billing_address.postal_code}
              </div>
              <div>{order.billing_address.country}</div>
            </div>
          </div>

          {/* Payment Information */}
          {order.payments && order.payments.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Payment Information</h2>
              <div className="space-y-3">
                {order.payments.map((payment) => (
                  <div key={payment.id} className="flex justify-between items-center">
                    <div>
                      <div className="font-medium text-gray-900 capitalize">{payment.payment_method}</div>
                      <div className="text-sm text-gray-500">
                        {new Date(payment.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900">${parseFloat(payment.amount).toFixed(2)}</div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        payment.status === 'successful' ? 'bg-green-100 text-green-800' :
                        payment.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {formatStatus(payment.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right side - Summary and actions */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-lg p-6 sticky top-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Order Summary</h2>
            
            <div className="space-y-3 pb-4 border-b border-gray-200">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>${parseFloat(order.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Shipping ({formatStatus(order.shipping_method)})</span>
                <span>${parseFloat(order.shipping_cost).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-between text-lg font-bold text-gray-900 pt-4 mb-6">
              <span>Total</span>
              <span>${parseFloat(order.total_amount).toFixed(2)}</span>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              {canCancel && (
                <button
                  onClick={handleCancelOrder}
                  disabled={actionLoading}
                  className="w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? 'Processing...' : 'Cancel Order'}
                </button>
              )}
              
              {canRefund && (
                <button
                  onClick={() => setShowRefundModal(true)}
                  disabled={actionLoading}
                  className="w-full bg-orange-600 text-white py-3 rounded-lg hover:bg-orange-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Request Refund
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Request Refund</h3>
            <p className="text-gray-600 mb-4">
              Enter the amount you'd like to refund (max: ${parseFloat(order.total_amount).toFixed(2)})
            </p>
            <input
              type="number"
              step="0.01"
              min="0"
              max={order.total_amount}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowRefundModal(false)}
                className="flex-1 bg-gray-100 text-gray-900 py-2 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRefundOrder}
                disabled={actionLoading}
                className="flex-1 bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Processing...' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDetail;
