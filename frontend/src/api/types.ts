export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN';
  isEmailVerified: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: User;
}

export interface ProductImage {
  url: string;
  altText?: string | null;
  isPrimary: boolean;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  stockQuantity: number;
  inStock: boolean;
  category: { id: string; name: string; slug: string };
  brand: { id: string; name: string; slug: string };
  averageRating: number;
  ratingCount: number;
  images: ProductImage[];
  attributes: { name: string; value: string }[];
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface Facets {
  brands: { slug: string; name: string; count: number }[];
  attributes: Record<string, Record<string, number>>;
  price: { min: number; max: number };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  children: Category[];
}

export interface Review {
  id: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  author: string;
  createdAt: string;
}

export interface ReviewList {
  summary: {
    averageRating: number;
    ratingCount: number;
    distribution: Record<string, number>;
  };
  data: Review[];
}
