import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export interface CartItem {
  productId: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    slug: string;
    price: number;
    stockQuantity: number;
    image: string | null;
  };
  itemTotal: number;
}

export interface CartData {
  items: CartItem[];
  total: number;
}

interface CartContextValue {
  cart: CartData | null;
  isLoading: boolean;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  addItem: (productId: string, quantity?: number) => Promise<void>;
  updateItem: (productId: string, quantity: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();

  const refreshCart = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<CartData>('/cart');
      setCart(data);
    } catch (err) {
      console.error('Failed to load cart', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Merge cart on login if needed
  useEffect(() => {
    if (user) {
      const guestId = localStorage.getItem('villi-guest-cart-id');
      if (guestId) {
        api.post('/cart/merge', { guestCartId: guestId })
          .then(() => {
            localStorage.removeItem('villi-guest-cart-id');
            refreshCart();
          })
          .catch(() => refreshCart());
      } else {
        refreshCart();
      }
    } else {
      refreshCart();
    }
  }, [user, refreshCart]);

  const addItem = async (productId: string, quantity = 1) => {
    try {
      const updated = await api.post<CartData>('/cart/items', { productId, quantity });
      setCart(updated);
      setIsOpen(true); // Auto-open cart
    } catch (err) {
      throw err;
    }
  };

  const updateItem = async (productId: string, quantity: number) => {
    try {
      const updated = await api.patch<CartData>(`/cart/items/${productId}`, { quantity });
      setCart(updated);
    } catch (err) {
      throw err;
    }
  };

  const removeItem = async (productId: string) => {
    try {
      const updated = await api.del<CartData>(`/cart/items/${productId}`);
      setCart(updated);
    } catch (err) {
      throw err;
    }
  };

  return (
    <CartContext.Provider value={{ cart, isLoading, isOpen, setIsOpen, addItem, updateItem, removeItem, refreshCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
