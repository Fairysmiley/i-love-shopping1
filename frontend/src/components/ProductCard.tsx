import { Link } from 'react-router-dom';
import { money } from '../format';
import type { Product } from '../api/types';
import { StarRating } from './StarRating';
import { useCart } from '../cart/CartContext';
import { useState } from 'react';

interface Props {
  product: Product;
}

function shortDescription(text: string, max = 120): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}

/** Horizontal search-result card (image left, details + cart action right). */
export function ProductCard({ product }: Props) {
  const img = product.images[0];
  const { addItem } = useCart();
  const [adding, setAdding] = useState(false);

  return (
    <article className="product-card">
      <Link to={`/product/${product.slug}`} className="product-card__link">
        <div className="product-card__media">
          <img
            src={img?.thumbnailUrl || img?.url}
            alt={img?.altText || `Photograph of ${product.name}`}
            loading="lazy"
          />
        </div>
        <div className="product-card__body">
          <span className={`product-card__stock ${product.inStock ? 'in' : 'out'}`}>
            {product.inStock ? 'in stock' : 'sold'}
          </span>
          <h2 className="product-card__name">{product.name}</h2>
          <StarRating value={product.averageRating} />
          <p className="product-card__desc">{shortDescription(product.description)}</p>
          <div className="product-card__footer">
            <span className="product-card__price">{money(product.price, product.currency)}</span>
          </div>
        </div>
      </Link>
      <button
        type="button"
        className="product-card__cart"
        disabled={!product.inStock || adding}
        aria-label={product.inStock ? `Add ${product.name} to cart` : `${product.name} is sold`}
        title={product.inStock ? `Add ${product.name} to cart` : 'This item is sold'}
        onClick={async (e) => {
          e.preventDefault();
          setAdding(true);
          try {
            await addItem(product.id, 1);
          } catch (err: any) {
            alert(err.message || 'Could not add item to cart');
          } finally {
            setAdding(false);
          }
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 6h15l-1.5 9h-12L5 3H2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="9" cy="20" r="1.5" fill="currentColor" />
          <circle cx="18" cy="20" r="1.5" fill="currentColor" />
        </svg>
      </button>
    </article>
  );
}
