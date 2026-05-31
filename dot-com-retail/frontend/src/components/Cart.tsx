import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cartApi, type Cart as CartType, type CartItem as CartItemType } from '../api/cart';
import { useAuth } from '../context/AuthContext';
import ProductCard from './ProductCard';

const Cart = () => {
  const { getAccessToken } = useAuth();
  const accessToken = getAccessToken();
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingItems, setUpdatingItems] = useState<Set<number>>(new Set());
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);

  // Load cart
  useEffect(() => {
    loadCart();
  }, [accessToken]);

  const loadCart = async () => {
    try {
      setLoading(true);
      const cartData = await cartApi.getCart(accessToken);
      setCart(cartData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cart');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateQuantity = async (itemId: number, newQuantity: number) => {
    if (newQuantity < 1) return;

    setUpdatingItems(prev => new Set(prev).add(itemId));
    try {
      const updatedCart = await cartApi.updateItem(itemId, newQuantity, accessToken);
      setCart(updatedCart);
      window.dispatchEvent(new Event('cartUpdated')); // Notify header to refresh cart badge
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update quantity');
    } finally {
      setUpdatingItems(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const handleRemoveItem = async (itemId: number) => {
    setUpdatingItems(prev => new Set(prev).add(itemId));
    try {
      await cartApi.removeItem(itemId, accessToken);
      await loadCart();
      window.dispatchEvent(new Event('cartUpdated')); // Notify header to refresh cart badge
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove item');
      setUpdatingItems(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
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
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto text-center py-12">
          <div className="mx-auto h-16 w-16 text-gray-400 mb-4 text-6xl">🛒</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Your cart is empty</h2>
          <p className="text-gray-600 mb-6">Start adding some products to your cart!</p>
          <Link
            to="/products"
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Browse Products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Shopping Cart</h1>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          {cart.items.map((item: CartItemType) => (
            <div
              key={item.id}
              className="bg-white border border-gray-200 rounded-lg p-6 flex gap-4"
            >
              {/* Product Image */}
              <div className="flex-shrink-0 w-24 h-24 bg-gray-100 rounded-lg overflow-hidden">
                {(item.product as any).primary_image ? (
                  <img
                    src={(item.product as any).primary_image}
                    alt={item.product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-4xl">
                    📦
                  </div>
                )}
              </div>

              {/* Product Details */}
              <div className="flex-grow">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {item.product.name}
                </h3>
                <p className="text-xl font-bold text-blue-600">
                  ${parseFloat(item.product.price).toFixed(2)}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {item.product.stock_quantity} in stock
                </p>
              </div>

              {/* Quantity Controls */}
              <div className="flex flex-col items-end justify-between">
                <button
                  onClick={() => handleRemoveItem(item.id)}
                  disabled={updatingItems.has(item.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 text-xl"
                  aria-label="Remove item"
                >
                  🗑️
                </button>

                <div className="flex items-center gap-2 border border-gray-300 rounded-lg">
                  <button
                    onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                    disabled={item.quantity <= 1 || updatingItems.has(item.id)}
                    className="p-2 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="w-12 text-center font-medium">{item.quantity}</span>
                  <button
                    onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                    disabled={
                      item.quantity >= item.product.stock_quantity ||
                      updatingItems.has(item.id)
                    }
                    className="p-2 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <p className="text-lg font-bold text-gray-900">
                  ${(parseFloat(item.product.price) * item.quantity).toFixed(2)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-lg p-6 sticky top-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Order Summary</h2>
            
            <div className="space-y-3 mb-6 pb-6 border-b border-gray-200">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal ({cart.item_count} items)</span>
                <span>${parseFloat(cart.total).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span>
                <span className="text-sm">Calculated at checkout</span>
              </div>
            </div>

            <div className="flex justify-between text-lg font-bold text-gray-900 mb-6">
              <span>Total</span>
              <span>${parseFloat(cart.total).toFixed(2)}</span>
            </div>

            <button
              onClick={() => navigate('/checkout')}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-semibold"
            >
              Proceed to Checkout
              <span className="text-xl">→</span>
            </button>

            <Link
              to="/products"
              className="block w-full text-center text-blue-600 hover:text-blue-700 mt-4"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>

      {/* Recommended Products */}
      {cart.recommended_products && cart.recommended_products.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">You might also like</h2>
            {cart.recommended_products.length > 4 && (
              <button
                onClick={() => setShowAllRecommendations(!showAllRecommendations)}
                className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
              >
                {showAllRecommendations ? (
                  <>
                    Show Less
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </>
                ) : (
                  <>
                    Show All ({cart.recommended_products.length})
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </>
                )}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {(showAllRecommendations ? cart.recommended_products : cart.recommended_products.slice(0, 4)).map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={async (productId) => {
                  try {
                    setUpdatingItems(prev => new Set(prev).add(productId));
                    await cartApi.addItem(productId, 1, accessToken);
                    await loadCart();
                    setError(null);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to add item');
                  } finally {
                    setUpdatingItems(prev => {
                      const next = new Set(prev);
                      next.delete(productId);
                      return next;
                    });
                  }
                }}
                isAddingToCart={updatingItems.has(product.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Cart;
