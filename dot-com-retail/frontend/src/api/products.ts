import { apiFetch, API_ENDPOINTS } from './config';
import type { Product, Category, Brand, ProductFilters, SearchSuggestionsResponse, PaginatedResponse } from '../types/product';

// Product API functions
export const productApi = {
  // Get all products with optional filters
  getProducts: async (filters: ProductFilters = {}): Promise<PaginatedResponse<Product>> => {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value.toString());
      }
    });
    
    const endpoint = `${API_ENDPOINTS.PRODUCTS.LIST}${params.toString() ? `?${params.toString()}` : ''}`;
    return apiFetch(endpoint);
  },

  // Get single product
  getProduct: async (id: number): Promise<Product> => {
    return apiFetch(API_ENDPOINTS.PRODUCTS.DETAIL(id));
  },

  // Get search suggestions
  getSearchSuggestions: async (query: string): Promise<SearchSuggestionsResponse> => {
    const params = new URLSearchParams({ q: query });
    return apiFetch(`${API_ENDPOINTS.PRODUCTS.SEARCH_SUGGESTIONS}?${params.toString()}`);
  },
};

// Category API functions
export const categoryApi = {
  getCategories: async (): Promise<PaginatedResponse<Category>> => {
    return apiFetch(API_ENDPOINTS.CATEGORIES.LIST);
  },

  getCategory: async (id: number): Promise<Category> => {
    return apiFetch(API_ENDPOINTS.CATEGORIES.DETAIL(id));
  },
};

// Brand API functions
export const brandApi = {
  getBrands: async (): Promise<PaginatedResponse<Brand>> => {
    return apiFetch(API_ENDPOINTS.BRANDS.LIST);
  },

  getBrand: async (id: number): Promise<Brand> => {
    return apiFetch(API_ENDPOINTS.BRANDS.DETAIL(id));
  },
};