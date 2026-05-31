import { apiFetch, API_ENDPOINTS } from './config';

export interface ShippingOption {
  id: string;
  name: string;
  price: string;
  delivery_days: string;
  description: string;
}

export interface Address {
  address: string;
  city: string;
  state?: string;
  postal_code: string;
  country: string;
}

export interface OrderItem {
  id: number;
  product_name: string;
  quantity: number;
  price_at_time: string;
}

export interface Payment {
  id: number;
  payment_method: string;
  status: string;
  amount: string;
  transaction_id: string;
  created_at: string;
}

export interface Order {
  id: number;
  status: string;
  subtotal: string;
  shipping_cost: string;
  total_amount: string;
  shipping_method: string;
  billing_address: Address;
  shipping_address: Address;
  tracking_number?: string;
  items: OrderItem[];
  payments: Payment[];
  created_at: string;
  updated_at: string;
}

export interface OrderListItem {
  id: number;
  status: string;
  total_amount: string;
  created_at: string;
  item_count: number;
}

export interface PaginatedOrders {
  count: number;
  next: string | null;
  previous: string | null;
  results: OrderListItem[];
}

export interface CreateOrderRequest {
  billing_address: Address;
  shipping_address: Address;
  shipping_method: string;
  payment_method: 'stripe';
  guest_email?: string;
  phone?: string;
}

export interface CreateOrderResponse {
  order: Order;
  client_secret: string;
}

export interface StripeConfig {
  publishable_key: string;
}

// Orders API functions
export const ordersApi = {
  // Get shipping options
  getShippingOptions: async (): Promise<ShippingOption[]> => {
    const response = await apiFetch(API_ENDPOINTS.ORDERS.SHIPPING_OPTIONS);
    // Backend returns array directly, not wrapped in object
    return response;
  },

  // Create new order
  createOrder: async (orderData: CreateOrderRequest, accessToken?: string | null): Promise<CreateOrderResponse> => {
    return apiFetch(API_ENDPOINTS.ORDERS.CREATE, {
      method: 'POST',
      body: JSON.stringify(orderData),
    }, accessToken);
  },

  // Get user's orders with optional filters
  getOrders: async (
    filters: { status?: string; start_date?: string; end_date?: string; page?: number } = {},
    accessToken?: string | null
  ): Promise<PaginatedOrders> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value.toString());
      }
    });
    const endpoint = `${API_ENDPOINTS.ORDERS.LIST}${params.toString() ? `?${params.toString()}` : ''}`;
    return apiFetch(endpoint, {}, accessToken);
  },

  // Get single order details
  getOrder: async (orderId: number, accessToken?: string | null): Promise<Order> => {
    return apiFetch(API_ENDPOINTS.ORDERS.DETAIL(orderId), {}, accessToken);
  },

  // Cancel order
  cancelOrder: async (orderId: number, accessToken?: string | null): Promise<Order> => {
    return apiFetch(API_ENDPOINTS.ORDERS.CANCEL(orderId), {
      method: 'POST',
    }, accessToken);
  },

  // Request refund
  refundOrder: async (orderId: number, amount: string, accessToken?: string | null): Promise<Order> => {
    return apiFetch(API_ENDPOINTS.ORDERS.REFUND(orderId), {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }, accessToken);
  },

  // Get Stripe configuration
  getStripeConfig: async (): Promise<StripeConfig> => {
    return apiFetch(API_ENDPOINTS.ORDERS.STRIPE_CONFIG);
  },
};
