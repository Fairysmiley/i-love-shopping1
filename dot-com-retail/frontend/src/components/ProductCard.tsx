import { StarRating } from './StarRating';
import { useNavigate } from 'react-router-dom';

export interface ProductCardData {
  id: number;
  name: string;
  description?: string;
  price: string;
  primary_image?: string | null;
  image_urls?: string[] | null;
  images?: string[] | null;
  stock_quantity: number;
  average_rating?: number;
  rating_count?: number;
  review_count?: number;
  category_name?: string | null;
  brand_name?: string | null;
}

interface ProductCardProps {
  product: ProductCardData;
  onAddToCart?: (productId: number) => Promise<void>;
  isAddingToCart?: boolean;
  showDescription?: boolean;
  className?: string;
}

const ProductCard = ({ 
  product, 
  onAddToCart, 
  isAddingToCart = false,
  showDescription = false,
  className = ''
}: ProductCardProps) => {
  const navigate = useNavigate();
  
  return (
    <div
      onClick={() => navigate(`/products/${product.id}`)}
      className={`bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer ${className}`}
    >
      {/* Product Image */}
      <div className="aspect-square bg-gray-100 overflow-hidden">
        {product.primary_image || (product.image_urls && product.image_urls.length > 0) || (product.images && product.images.length > 0) ? (
          <img
            src={
              product.primary_image || 
              (product.image_urls && product.image_urls[0]) || 
              (product.images ? 
                (product.images[0].startsWith('/') ? product.images[0] : `/media/${product.images[0]}`) 
                : '')
            }
            alt={product.name}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-6xl">
            📦
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="p-4">
        <h3 className="font-semibold text-lg mb-2 text-gray-800 line-clamp-2">
          {product.name}
        </h3>

        {/* Description (optional) */}
        {showDescription && product.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-3">
            {product.description.substring(0, 100)}...
          </p>
        )}
        
        {/* Category and Brand */}
        {(product.category_name || product.brand_name) && (
          <div className="mb-2 space-y-1">
            {product.category_name && (
              <p className="text-sm text-gray-600">{product.category_name}</p>
            )}
            {product.brand_name && (
              <p className="text-sm text-gray-500">{product.brand_name}</p>
            )}
          </div>
        )}
        
        {/* Price and Rating */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-2xl font-bold text-blue-600">${parseFloat(product.price).toFixed(2)}</p>
          <StarRating 
            rating={product.average_rating || 0} 
            reviewCount={(product.review_count || product.rating_count) || 0}
            size="sm"
          />
        </div>

        {/* Stock Status */}
        <p className={`text-sm mb-3 ${product.stock_quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {product.stock_quantity > 0 
            ? `${product.stock_quantity} in stock`
            : 'Out of stock'
          }
        </p>

        {/* Action Button */}
        {onAddToCart && (
          <button
            onClick={(e) => {
              e.stopPropagation(); // Prevent card click from firing
              onAddToCart(product.id);
            }}
            disabled={product.stock_quantity === 0 || isAddingToCart}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isAddingToCart ? 'Adding...' : product.stock_quantity === 0 ? 'Out of Stock' : 'Add to Cart'}
          </button>
        )}
      </div>
    </div>
  );
};

export default ProductCard;
