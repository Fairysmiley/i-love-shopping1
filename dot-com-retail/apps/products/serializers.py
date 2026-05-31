from rest_framework import serializers
from django.conf import settings
from .models import Category, Brand, Product, Review, ReviewHelpful


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'description', 'created_at']


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ['id', 'name', 'description', 'created_at']


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    brand_name = serializers.CharField(source='brand.name', read_only=True)
    average_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    image_urls = serializers.SerializerMethodField()
    primary_image = serializers.SerializerMethodField()
    primary_thumbnail = serializers.SerializerMethodField()
    weight_lb = serializers.ReadOnlyField()
    dimensions_metric = serializers.ReadOnlyField()
    dimensions_imperial = serializers.ReadOnlyField()

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'description', 'price', 'stock_quantity',
            'category', 'category_name', 'brand', 'brand_name',
            'images', 'image_urls', 'primary_image', 'primary_thumbnail',
            'weight_kg', 'weight_lb', 'dimensions', 'dimensions_metric', 'dimensions_imperial',
            'is_active', 'created_at',
            'average_rating', 'review_count'
        ]

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError('Price must be greater than 0.')
        return value

    def validate_stock_quantity(self, value):
        if value < 0:
            raise serializers.ValidationError("Stock quantity cannot be negative")
        return value
    
    def get_average_rating(self, obj):
        # Use annotated value if available, otherwise calculate
        if hasattr(obj, 'average_rating') and obj.average_rating is not None:
            return round(float(obj.average_rating), 1)
        return obj.get_average_rating()
    
    def get_review_count(self, obj):
        # Use prefetch_related count if available, otherwise calculate
        if hasattr(obj, 'reviews'):
            return obj.reviews.count()
        return obj.get_review_count()
    
    def get_primary_thumbnail(self, obj):
        """Get thumbnail URL for list views"""
        request = self.context.get('request')
        thumb_url = obj.get_primary_thumbnail()
        if not thumb_url:
            return None
        
        if thumb_url.startswith(('http://', 'https://')):
            return thumb_url
        
        if request:
            base_url = f"{request.scheme}://{request.get_host()}"
            return f"{base_url}{thumb_url}"
        return thumb_url

    def get_image_urls(self, obj):
        """Get all image URLs with proper domain (full size)"""
        request = self.context.get('request')
        if not obj.images:
            return []
            
        urls = []
        for img in obj.images:
            # Handle new format (dict with 'full' and 'thumbnail')
            if isinstance(img, dict):
                img_path = img.get('full', img.get('thumbnail', ''))
            else:
                img_path = img
            
            # Check if it's already a full URL (starts with http/https)
            if img_path.startswith(('http://', 'https://')):
                urls.append(img_path)
            else:
                # It's a relative path, prepend media URL
                if request:
                    base_url = f"{request.scheme}://{request.get_host()}"
                    media_url = getattr(settings, 'MEDIA_URL', '/media/')
                    urls.append(f"{base_url}{media_url}{img_path}")
                else:
                    # Fallback to relative URL
                    media_url = getattr(settings, 'MEDIA_URL', '/media/')
                    urls.append(f"{media_url}{img_path}")
        return urls

    def get_primary_image(self, obj):
        """Get the primary image URL"""
        request = self.context.get('request')
        if not obj.images or len(obj.images) == 0:
            return None
            
        img = obj.images[0]
        # Check if it's already a full URL (starts with http/https)
        if img.startswith(('http://', 'https://')):
            return img
        else:
            # It's a relative path, prepend media URL
            if request:
                base_url = f"{request.scheme}://{request.get_host()}"
                media_url = getattr(settings, 'MEDIA_URL', '/media/')
                return f"{base_url}{media_url}{img}"
            else:
                # Fallback to relative URL
                media_url = getattr(settings, 'MEDIA_URL', '/media/')
                return f"{media_url}{img}"

    def validate_images(self, value):
        # Expect a list of strings (URLs/paths)
        if value is None:
            return value
        if not isinstance(value, list):
            raise serializers.ValidationError('Images must be a list of URLs.')
        for item in value:
            if not isinstance(item, str) or len(item) == 0:
                raise serializers.ValidationError('Each image must be a non-empty string URL.')
        return value

    def validate_dimensions(self, value):
        if value is None:
            return value
        if not isinstance(value, dict):
            raise serializers.ValidationError('Dimensions must be an object.')
        for key in ['length', 'width', 'height']:
            if key in value:
                try:
                    v = float(value[key])
                    if v <= 0:
                        raise ValueError()
                except Exception:
                    raise serializers.ValidationError(f'Dimensions.{key} must be a positive number (cm).')
        return value


class ReviewSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    user_voted_helpful = serializers.SerializerMethodField()
    
    class Meta:
        model = Review
        fields = ['id', 'user', 'username', 'product', 'rating', 'review_text', 
                  'helpful_count', 'user_voted_helpful', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'helpful_count', 'created_at', 'updated_at']
    
    def get_user_voted_helpful(self, obj):
        """Check if current user has voted this review helpful"""
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return ReviewHelpful.objects.filter(user=request.user, review=obj).exists()
        return False


class ReviewCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Review
        fields = ['product', 'rating', 'review_text']
    
    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError('Rating must be between 1 and 5')
        return value
    
    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
