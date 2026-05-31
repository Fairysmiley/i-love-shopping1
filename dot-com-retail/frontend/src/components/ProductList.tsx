import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productApi, categoryApi, brandApi } from '../api/products';
import { cartApi } from '../api/cart';
import type { Product, Category, Brand, ProductFilters, SearchSuggestion } from '../types/product';
import { safeParseInt, safeParseFloat, sanitizeSearchQuery } from '../utils/validation';
import ProductCard from './ProductCard';
import { useAuth } from '../context/AuthContext';
import SEO from './SEO';
import './ProductList.css';

const ProductList = () => {
  const [searchParams] = useSearchParams();
  const { getAccessToken } = useAuth();
  const accessToken = getAccessToken();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingToCart, setAddingToCart] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Filter state
  const [filters, setFilters] = useState<ProductFilters>({});
  const [searchQuery, setSearchQuery] = useState('');
  
  // Search suggestions state
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Debounced search suggestions
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length >= 2) {
      try {
        const response = await productApi.getSearchSuggestions(query);
        setSuggestions(response.suggestions);
        setShowSuggestions(true);
      } catch (error) {
        console.error('Failed to fetch suggestions:', error);
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, []);

  // Handle URL search parameters
  useEffect(() => {
    const urlSearch = searchParams.get('search');
    const urlCategory = searchParams.get('category');
    const urlBrand = searchParams.get('brand');
    
    const newFilters: ProductFilters = {};
    
    const searchQuery = sanitizeSearchQuery(urlSearch);
    if (searchQuery) {
      newFilters.search = searchQuery;
      setSearchQuery(searchQuery);
    }
    
    const categoryId = safeParseInt(urlCategory);
    if (categoryId) {
      newFilters.category = categoryId;
    }
    
    const brandId = safeParseInt(urlBrand);
    if (brandId) {
      newFilters.brand = brandId;
    }
    
    setFilters(newFilters);
  }, [searchParams]);

  // Load initial data (categories and brands only)
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [categoriesResponse, brandsResponse] = await Promise.all([
          categoryApi.getCategories(),
          brandApi.getBrands(),
        ]);
        
        setCategories(categoriesResponse.results);
        setBrands(brandsResponse.results);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      }
    };

    loadInitialData();
  }, []);

  // Load products when filters change
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoading(true);
        const productsResponse = await productApi.getProducts(filters);
        setProducts(productsResponse.results);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load products');
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [filters]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ ...filters, search: searchQuery });
  };

  const handleFilterChange = (key: keyof ProductFilters, value: any) => {
    // Validate numeric values to prevent NaN
    if (key === 'category' || key === 'brand') {
      if (typeof value === 'number' && (isNaN(value) || value <= 0)) {
        value = undefined;
      }
    } else if (key === 'min_price' || key === 'max_price') {
      if (typeof value === 'number' && (isNaN(value) || value < 0)) {
        value = undefined;
      }
    }
    
    setFilters({ ...filters, [key]: value || undefined });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading products...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md text-center">
          <svg className="w-12 h-12 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Products</h3>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <SEO 
        title={filters.search ? `Search: ${filters.search}` : "All Products"}
        description={filters.search 
          ? `Search results for ${filters.search}. Find the best deals on electronics, gadgets, and tech accessories.`
          : "Browse our complete catalog of electronics and technology products. Shop laptops, smartphones, accessories, and more at competitive prices."}
        keywords="products, electronics, technology, gadgets, online shopping"
      />
      
      {/* Success Message */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 shadow-lg animate-fade-in">
          {successMessage}
        </div>
      )}

      {/* Page Header */}
      <div className="mb-8">
        {filters.search ? (
          <div>
            <h1 className="text-3xl font-bold mb-2">Search Results</h1>
            <p className="text-gray-600">
              Showing results for "<span className="font-semibold">{filters.search}</span>"
              {products.length > 0 && ` (${products.length} products found)`}
            </p>
          </div>
        ) : (
          <div>
            <h1 className="text-3xl font-bold mb-2">All Products</h1>
            <p className="text-gray-600">Browse our complete Electronics & Technology catalog</p>
          </div>
        )}
      </div>
      
      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative max-w-md">
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => {
                const value = e.target.value;
                setSearchQuery(value);
                fetchSuggestions(value);
              }}
              onFocus={() => searchQuery.length >= 2 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button 
              type="submit"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-blue-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            
            {/* Dynamic Search Suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.id}-${index}`}
                    type="button"
                    onClick={() => {
                      setSearchQuery(suggestion.name);
                      setShowSuggestions(false);
                      setFilters({ ...filters, search: suggestion.name });
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-start space-x-3 border-b border-gray-100 last:border-b-0"
                  >
                    <svg className="w-4 h-4 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <div>
                      <div className="font-medium text-gray-900">{suggestion.name}</div>
                      <div className="text-sm text-gray-500">
                        {suggestion.category} {suggestion.brand && `• ${suggestion.brand}`}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Category Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={filters.category || ''}
              onChange={(e) => handleFilterChange('category', safeParseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {/* Brand Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
            <select
              value={filters.brand || ''}
              onChange={(e) => handleFilterChange('brand', safeParseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Brands</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>

          {/* Price Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price Range</label>
            <div className="flex space-x-2">
              <input
                type="number"
                placeholder="Min"
                value={filters.min_price || ''}
                onChange={(e) => handleFilterChange('min_price', safeParseFloat(e.target.value))}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="number"
                placeholder="Max"
                value={filters.max_price || ''}
                onChange={(e) => handleFilterChange('max_price', safeParseFloat(e.target.value))}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Sort and Options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              value={`${filters.sort_by || 'created_at'}_${filters.sort_order || 'desc'}`}
              onChange={(e) => {
                const [sortBy, sortOrder] = e.target.value.split('_');
                setFilters({
                  ...filters,
                  sort_by: sortBy,
                  sort_order: sortOrder
                });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
            >
              <option value="created_at_desc">Newest First</option>
              <option value="created_at_asc">Oldest First</option>
              <option value="name_asc">Name A-Z</option>
              <option value="name_desc">Name Z-A</option>
              <option value="price_asc">Price Low-High</option>
              <option value="price_desc">Price High-Low</option>
              <option value="rating_desc">Rating High-Low</option>
              <option value="rating_asc">Rating Low-High</option>
              <option value="stock_desc">Stock High-Low</option>
              <option value="stock_asc">Stock Low-High</option>
              <option value="relevance_asc">Relevance</option>
            </select>
            
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={filters.in_stock || false}
                onChange={(e) => handleFilterChange('in_stock', e.target.checked || undefined)}
                className="mr-2 text-blue-600 focus:ring-blue-500"
              />
              In Stock Only
            </label>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {products.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-gray-500 text-lg">No products found.</p>
            {filters.search && (
              <p className="text-gray-400 mt-2">Try adjusting your search terms or filters.</p>
            )}
          </div>
        ) : (
          products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={async (productId) => {
                setAddingToCart(productId);
                try {
                  await cartApi.addItem(productId, 1, accessToken);
                  window.dispatchEvent(new Event('cartUpdated')); // Notify header to refresh cart badge
                  setSuccessMessage('✓ Item added to cart!');
                  setTimeout(() => setSuccessMessage(null), 3000);
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Failed to add to cart');
                } finally {
                  setAddingToCart(null);
                }
              }}
              isAddingToCart={addingToCart === product.id}
              showDescription={true}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ProductList;