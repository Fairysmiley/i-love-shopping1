import { apiFetch, API_ENDPOINTS } from './config';

export interface CartItem {
  id: number;
  product: {
    id: number;
    name: string;
    price: string;
    primary_image?: string;
    stock_quantity: number;
  };
  quantity: number;
  subtotal: string;
}

export interface Cart {
  id: number;
  items: CartItem[];
  total: string;
  item_count: number;
  recommended_products?: Array<{
    id: number;
    name: string;
    description: string;
    price: string;
    primary_image?: string;
    stock_quantity: number;
    average_rating: number;
    rating_count: number;
  }>;
}

// Cart API functions
export const cartApi = {
  // Get current cart
  getCart: async (accessToken?: string | null): Promise<Cart> => {
    return apiFetch(API_ENDPOINTS.CART.GET, {}, accessToken);
  },

  // Add item to cart
  addItem: async (productId: number, quantity: number = 1, accessToken?: string | null): Promise<Cart> => {
    return apiFetch(API_ENDPOINTS.CART.ADD_ITEM, {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, quantity }),
    }, accessToken);
  },

  // Update cart item quantity
  updateItem: async (itemId: number, quantity: number, accessToken?: string | null): Promise<Cart> => {
    return apiFetch(API_ENDPOINTS.CART.UPDATE_ITEM(itemId), {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    }, accessToken);
  },

  // Remove item from cart
  removeItem: async (itemId: number, accessToken?: string | null): Promise<{ message: string }> => {
    return apiFetch(API_ENDPOINTS.CART.REMOVE_ITEM(itemId), {
      method: 'DELETE',
    }, accessToken);
  },

  // Clear cart
  clearCart: async (accessToken?: string | null): Promise<void> => {
    return apiFetch(API_ENDPOINTS.CART.CLEAR, {
      method: 'DELETE',
    }, accessToken);
  },
};
