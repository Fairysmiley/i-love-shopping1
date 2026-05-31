import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { productApi, categoryApi } from '../api/products';
import { cartApi } from '../api/cart';
import type { Product, Category } from '../types/product';
import { getCategoryIcon } from '../utils/categoryIcons';
import { useAuth } from '../context/AuthContext';
import ProductCard from './ProductCard';
import SEO from './SEO';

const Home = () => {
  const { getAccessToken } = useAuth();
  const accessToken = getAccessToken();
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get first 6 products as featured and all categories
        const [productsResponse, categoriesResponse] = await Promise.all([
          productApi.getProducts(), // Get paginated products
          categoryApi.getCategories(), // Get paginated categories
        ]);
        
        // Extract data from paginated responses and take first 6 products as featured
        setFeaturedProducts(productsResponse.results.slice(0, 6));
        setCategories(categoriesResponse.results);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO 
        title="Home"
        description="Shop the latest products from top brands. Browse our extensive catalog of electronics, fashion, home goods, and more at unbeatable prices."
        keywords="online shopping, best deals, products, electronics, fashion"
      />
      
      {/* Success Message */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 shadow-lg">
          {successMessage}
        </div>
      )}

      {/* Hero Section with H1 */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Welcome to Dot-Com Retail</h1>
          <p className="text-xl text-blue-100">Your one-stop shop for quality products at great prices</p>
        </div>
      </section>

      {/* Categories Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900">Shop by Category</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {categories.map(category => (
            <Link
              key={category.id}
              to={`/products?category=${category.id}`}
              className="group bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 border border-gray-200"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300 mx-auto">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {getCategoryIcon(category.icon)}
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors duration-300 text-center">
                {category.name}
              </h3>
              <p className="text-gray-600 text-sm text-center">{category.description}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Products Section */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Featured Products</h2>
            <p className="text-gray-600 mt-2">Discover our handpicked selection of top products</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {featuredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={async (productId) => {
                  setAddingToCart(productId);
                  try {
                    await cartApi.addItem(productId, 1, accessToken);
                    setSuccessMessage('✓ Item added to cart!');
                    setTimeout(() => setSuccessMessage(null), 3000);
                  } catch (error) {
                    console.error('Failed to add to cart:', error);
                  } finally {
                    setAddingToCart(null);
                  }
                }}
                isAddingToCart={addingToCart === product.id}
                showDescription={true}
              />
            ))}
          </div>
          
          <div className="text-center mt-12">
            <Link 
              to="/products" 
              className="inline-flex items-center space-x-2 bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-all duration-200"
            >
              <span>View All Products</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;