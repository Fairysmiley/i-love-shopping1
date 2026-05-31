interface StarRatingProps {
  rating: number;
  reviewCount?: number;
  showCount?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const StarRating = ({ rating, reviewCount = 0, showCount = true, size = 'sm' }: StarRatingProps) => {
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base', 
    lg: 'text-lg'
  };

  const renderStars = () => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <span key={i} className="text-yellow-400">★</span>
      );
    }
    
    if (hasHalfStar) {
      stars.push(
        <span key="half" className="text-yellow-400">☆</span>
      );
    }
    
    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(
        <span key={`empty-${i}`} className="text-gray-300">☆</span>
      );
    }
    
    return stars;
  };

  if (rating === 0 && reviewCount === 0) {
    return (
      <div className={`flex items-center ${sizeClasses[size]} text-gray-400`}>
        <span>No reviews</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center ${sizeClasses[size]}`}>
      <div className="flex">{renderStars()}</div>
      <span className="ml-1 text-gray-700 font-medium">{rating.toFixed(1)}</span>
      {showCount && (
        <span className="ml-1 text-gray-500">({reviewCount})</span>
      )}
    </div>
  );
};

export default StarRating;