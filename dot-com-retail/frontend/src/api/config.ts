// API configuration
export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

// API endpoints
export const API_ENDPOINTS = {
  // Auth endpoints
  AUTH: {
    REGISTER: '/users/register/',
    LOGIN: '/users/login/',
    REFRESH: '/users/token/refresh/',
    REVOKE: '/users/token/revoke/',
    PROFILE: '/users/profile/',
  },
  // Product endpoints
  PRODUCTS: {
    LIST: '/products/',
    DETAIL: (id: number) => `/products/${id}/`,
    SEARCH_SUGGESTIONS: '/products/search/suggestions/',
  },
  // Category endpoints
  CATEGORIES: {
    LIST: '/products/categories/',
    DETAIL: (id: number) => `/products/categories/${id}/`,
  },
  // Brand endpoints
  BRANDS: {
    LIST: '/products/brands/',
    DETAIL: (id: number) => `/products/brands/${id}/`,
  },
  // Cart endpoints
  CART: {
    GET: '/cart/',
    ADD_ITEM: '/cart/add/',
    UPDATE_ITEM: (itemId: number) => `/cart/update/${itemId}/`,
    REMOVE_ITEM: (itemId: number) => `/cart/remove/${itemId}/`,
    CLEAR: '/cart/clear/',
  },
  // Order endpoints
  ORDERS: {
    LIST: '/orders/',
    CREATE: '/orders/create/',
    DETAIL: (orderId: number) => `/orders/${orderId}/`,
    CANCEL: (orderId: number) => `/orders/${orderId}/cancel/`,
    REFUND: (orderId: number) => `/orders/${orderId}/refund/`,
    SHIPPING_OPTIONS: '/orders/shipping-options/',
    STRIPE_CONFIG: '/orders/payment/config/',
  },
} as const;

// Common fetch wrapper with error handling
export const apiFetch = async (
  endpoint: string, 
  options: RequestInit = {},
  accessToken?: string | null
) => {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  
  // Add auth token if provided
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // For CSRF token (not refresh tokens - those are memory-only)
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}`);
  }
  
  return response.json();
};

// API client with common methods
export const api = {
  get: async (endpoint: string, accessToken?: string | null) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {};
    
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include',
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }
    
    return { data: await response.json() };
  },
  
  post: async (endpoint: string, data: any, accessTokenOrOptions?: string | null | { headers?: Record<string, string> }) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {};
    
    // Handle accessToken or options object
    let accessToken: string | null = null;
    if (typeof accessTokenOrOptions === 'string') {
      accessToken = accessTokenOrOptions;
    } else if (accessTokenOrOptions && 'headers' in accessTokenOrOptions) {
      Object.assign(headers, accessTokenOrOptions.headers);
    }
    
    // Don't set Content-Type for FormData (browser will set it with boundary)
    if (!(data instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: data instanceof FormData ? data : JSON.stringify(data),
      credentials: 'include',
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }
    
    return { data: await response.json() };
  },
  
  put: async (endpoint: string, data: any, accessToken?: string | null) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    
    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
      credentials: 'include',
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }
    
    return { data: await response.json() };
  },
  
  patch: async (endpoint: string, data: any, accessToken?: string | null) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
      credentials: 'include',
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }
    
    return { data: await response.json() };
  },
  
  delete: async (endpoint: string, accessToken?: string | null) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {};
    
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }
    
    return { data: await response.json().catch(() => ({})) };
  },
};