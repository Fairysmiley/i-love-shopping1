// Product types
export interface Product {
  id: number;
  name: string;
  description: string;
  price: string; // Decimal field comes as string from API
  stock_quantity: number;
  category: number;
  category_name: string;
  brand: number | null;
  brand_name: string | null;
  images: string[] | null;
  image_urls?: string[] | null;
  primary_image?: string | null;
  weight_kg: string | null;
  dimensions: any | null;
  is_active: boolean;
  created_at: string;
  average_rating: number;
  review_count: number;
}

export interface Category {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  created_at: string;
}

export interface Brand {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

// Search suggestion type
export interface SearchSuggestion {
  id: number;
  name: string;
  category: string;
  brand: string | null;
}

// API response types
export interface ProductListResponse {
  results: Product[];
  count?: number;
  next?: string | null;
  previous?: string | null;
}

export interface SearchSuggestionsResponse {
  suggestions: SearchSuggestion[];
}

// Paginated API response type
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Search/filter parameters
export interface ProductFilters {
  search?: string;
  category?: number;
  brand?: number;
  min_price?: number;
  max_price?: number;
  in_stock?: boolean;
  sort_by?: string;
  sort_order?: string;
}