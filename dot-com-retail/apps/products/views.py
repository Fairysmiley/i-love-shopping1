from django.db.models import Q, Avg, F
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.views import APIView
from django.db import transaction
import json
import csv
import io

from django.db.models import Case, When, Value, IntegerField, FloatField

from .models import Category, Brand, Product, Review, ReviewHelpful
from .serializers import (CategorySerializer, BrandSerializer, ProductSerializer, 
                          ReviewSerializer, ReviewCreateSerializer)
from apps.users.permissions import IsAdminWith2FA


class ReadOnlyOrAdminPermission:
    """
    Custom permission: Read-only for everyone, write for admins only
    """

    def has_permission(self, request, view):
        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return True
        return request.user and request.user.is_staff


class ApiCategoryListView(generics.ListCreateAPIView):
    """
    GET: List all categories (public)
    POST: Create new category (admin only)
    """
    queryset = Category.objects.all().order_by('name')
    serializer_class = CategorySerializer
    permission_classes = [ReadOnlyOrAdminPermission]


class ApiBrandListView(generics.ListCreateAPIView):
    """
    GET: List all brands (public)
    POST: Create new brand (admin only)
    """
    queryset = Brand.objects.all().order_by('name')
    serializer_class = BrandSerializer
    permission_classes = [ReadOnlyOrAdminPermission]


class ApiProductListView(generics.ListCreateAPIView):
    """
    GET: List products with basic filtering and search (public)
    POST: Create new product (admin only)
    
    Query parameters:
    - search: Search in name, description, category name, brand name
    - category: Filter by category ID
    - brand: Filter by brand ID
    - min_price: Minimum price filter
    - max_price: Maximum price filter
    - in_stock: true/false - only show products with stock > 0
    - sort_by: name, price, created_at, stock, relevance (default: created_at)
    - sort_order: asc/desc (default: desc)
    """
    serializer_class = ProductSerializer
    permission_classes = [ReadOnlyOrAdminPermission]

    def get_queryset(self):

        queryset = Product.objects.filter(is_active=True).select_related('category', 'brand').annotate(
            avg_rating_raw=Avg('reviews__rating'),
            average_rating=Case(
                When(avg_rating_raw__isnull=True, then=Value(0.0)),
                default='avg_rating_raw',
                output_field=FloatField()
            )
        ).prefetch_related('reviews')

        search = self.request.query_params.get('search')
        search_applied = False
        if search:
            search_applied = True
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(description__icontains=search) |
                Q(category__name__icontains=search) |
                Q(brand__name__icontains=search)
            )

            # Add relevance scoring for better search results
            # Prioritize: exact name match > name starts with > brand match > name contains > description contains
            queryset = queryset.annotate(
                search_rank=Case(
                    # Exact match in name (case-insensitive)
                    When(name__iexact=search, then=Value(1)),
                    # Name starts with search term
                    When(name__istartswith=search, then=Value(2)),
                    # Brand name exact match
                    When(brand__name__iexact=search, then=Value(3)),
                    # Brand name starts with search term
                    When(brand__name__istartswith=search, then=Value(4)),
                    # Name contains search term
                    When(name__icontains=search, then=Value(5)),
                    # Brand name contains search term
                    When(brand__name__icontains=search, then=Value(6)),
                    # Category contains search term
                    When(category__name__icontains=search, then=Value(7)),
                    # Description contains search term
                    When(description__icontains=search, then=Value(8)),
                    # Default
                    default=Value(9),
                    output_field=IntegerField()
                )
            )

        category_id = self.request.query_params.get('category')
        if category_id:
            try:
                category_id = int(category_id)
                queryset = queryset.filter(category_id=category_id)
            except (ValueError, TypeError):
                # Invalid category_id, ignore the filter
                pass

        brand_id = self.request.query_params.get('brand')
        if brand_id:
            try:
                brand_id = int(brand_id)
                queryset = queryset.filter(brand_id=brand_id)
            except (ValueError, TypeError):
                # Invalid brand_id, ignore the filter
                pass

        min_price = self.request.query_params.get('min_price')
        if min_price:
            try:
                min_price = float(min_price)
                if min_price >= 0:  # Only allow positive prices
                    queryset = queryset.filter(price__gte=min_price)
            except (ValueError, TypeError):
                # Invalid min_price, ignore the filter
                pass

        max_price = self.request.query_params.get('max_price')
        if max_price:
            try:
                max_price = float(max_price)
                if max_price >= 0:  # Only allow positive prices
                    queryset = queryset.filter(price__lte=max_price)
            except (ValueError, TypeError):
                # Invalid max_price, ignore the filter
                pass

        in_stock = self.request.query_params.get('in_stock')
        if in_stock and in_stock.lower() == 'true':
            queryset = queryset.filter(stock_quantity__gt=0)

        # Sorting functionality
        sort_by = self.request.query_params.get('sort_by', 'relevance' if search_applied else 'created_at')
        sort_order = self.request.query_params.get('sort_order', 'asc' if search_applied else 'desc')

        # Valid sort fields with their default order direction
        valid_sorts = {
            'name': ('name', 'asc'),  # A-Z by default
            'price': ('price', 'asc'),  # Low to High by default
            'created_at': ('created_at', 'desc'),  # Newest first by default
            'stock': ('stock_quantity', 'desc'),  # High stock first by default
            'rating': ('average_rating', 'desc'),  # Highest rated first by default
            'relevance': ('search_rank' if search_applied else 'name', 'asc')
        }

        if sort_by in valid_sorts:
            order_field, default_order = valid_sorts[sort_by]

            # Use provided sort_order or fall back to field-specific default
            final_order = sort_order if sort_order in ['asc', 'desc'] else default_order

            if final_order == 'desc':
                order_field = f'-{order_field}'
            queryset = queryset.order_by(order_field)
        else:
            if search_applied:
                queryset = queryset.order_by('search_rank')  # Sort by relevance when searching
            else:
                queryset = queryset.order_by('-created_at')  # Default

        return queryset


class ApiProductDetailView(generics.RetrieveAPIView):
    """
    GET: Get single product details (public)
    """
    serializer_class = ProductSerializer
    permission_classes = [AllowAny]
    lookup_field = 'id'
    lookup_url_kwarg = 'product_id'

    def get_queryset(self):
        return Product.objects.filter(is_active=True).select_related('category', 'brand').annotate(
            avg_rating_raw=Avg('reviews__rating'),
            average_rating=Case(
                When(avg_rating_raw__isnull=True, then=Value(0.0)),
                default='avg_rating_raw',
                output_field=FloatField()
            )
        ).prefetch_related('reviews')


class ApiProductSearchSuggestionsView(generics.GenericAPIView):
    """
    GET: Get search suggestions for dynamic search
    Query parameter: q (minimum 2 characters)
    """
    permission_classes = [AllowAny]

    def get(self, request):
        query = request.query_params.get('q', '')
        if len(query) < 2:
            return Response({'suggestions': []})

        # Search in product names, categories, and brands
        products = Product.objects.filter(
            Q(name__icontains=query) |
            Q(category__name__icontains=query) |
            Q(brand__name__icontains=query),
            is_active=True
        ).select_related('category', 'brand').distinct()[:10]

        suggestions = []
        for product in products:
            suggestions.append({
                'id': product.id,
                'name': product.name,
                'category': product.category.name,
                'brand': product.brand.name if product.brand else None,
            })

        return Response({'suggestions': suggestions})


class ApiProductImageUploadView(generics.GenericAPIView):
    """
    POST: Upload an image for a specific product (admin only)
    """
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsAdminUser]

    def post(self, request, product_id):
        try:
            product = Product.objects.get(id=product_id, is_active=True)
        except Product.DoesNotExist:
            return Response(
                {'error': 'Product not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )

        image_file = request.FILES.get('image')
        if not image_file:
            return Response(
                {'error': 'No image file provided'}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            image_paths = product.add_image(image_file)
            
            # Handle dict format (with thumbnail support)
            if isinstance(image_paths, dict):
                full_path = image_paths.get('full', '')
                thumb_path = image_paths.get('thumbnail', '')
                return Response({
                    'message': 'Image uploaded successfully',
                    'image_path': full_path,  # Backward compatibility
                    'image_url': f"{request.scheme}://{request.get_host()}/media/{full_path}",
                    'thumbnail_path': thumb_path,
                    'thumbnail_url': f"{request.scheme}://{request.get_host()}/media/{thumb_path}"
                }, status=status.HTTP_201_CREATED)
            else:
                # Handle old string format (shouldn't happen but for safety)
                return Response({
                    'message': 'Image uploaded successfully',
                    'image_path': image_paths,
                    'image_url': f"{request.scheme}://{request.get_host()}/media/{image_paths}"
                }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_400_BAD_REQUEST
            )


class ProductReviewListView(generics.ListAPIView):
    """
    GET: List all reviews for a product (sorted by helpfulness)
    """
    serializer_class = ReviewSerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):
        product_id = self.kwargs['product_id']
        return Review.objects.filter(product_id=product_id).order_by('-helpful_count', '-created_at')


class ReviewCreateView(generics.CreateAPIView):
    """
    POST: Create a review for a product (authenticated users only)
    Users can only review products they have purchased (delivered orders)
    """
    serializer_class = ReviewCreateSerializer
    permission_classes = [IsAuthenticated]
    
    def create(self, request, *args, **kwargs):
        from apps.orders.models import Order, OrderItem
        
        product_id = request.data.get('product')
        
        # Check if user has already reviewed this product
        if product_id and Review.objects.filter(user=request.user, product_id=product_id).exists():
            return Response(
                {'error': 'You have already reviewed this product'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if user has purchased this product (must have delivered order)
        if product_id:
            has_purchased = OrderItem.objects.filter(
                order__user=request.user,
                order__status='delivered',
                product_id=product_id
            ).exists()
            
            if not has_purchased:
                return Response(
                    {'error': 'You can only review products you have purchased'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
        
        return super().create(request, *args, **kwargs)
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ReviewHelpfulVoteView(APIView):
    """
    POST: Vote a review as helpful
    """
    permission_classes = [IsAuthenticated]
    
    @transaction.atomic
    def post(self, request, review_id):
        try:
            review = Review.objects.get(id=review_id)
        except Review.DoesNotExist:
            return Response({'error': 'Review not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Check if user already voted
        vote, created = ReviewHelpful.objects.get_or_create(
            user=request.user,
            review=review
        )
        
        if not created:
            return Response({'message': 'You have already voted this review helpful'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        # Increment helpful count using update to avoid validation issues with F()
        Review.objects.filter(id=review.id).update(helpful_count=F('helpful_count') + 1)
        review.refresh_from_db()
        
        return Response({
            'message': 'Vote recorded',
            'helpful_count': review.helpful_count
        }, status=status.HTTP_200_OK)


class BulkProductUploadView(APIView):
    """
    POST: Bulk upload products via JSON or CSV
    Requires admin with 2FA
    """
    permission_classes = [IsAdminWith2FA]
    parser_classes = [MultiPartParser, FormParser]
    
    @transaction.atomic
    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        file_extension = file.name.split('.')[-1].lower()
        
        try:
            if file_extension == 'json':
                products_data = json.load(file)
                if not isinstance(products_data, list):
                    products_data = [products_data]
            elif file_extension == 'csv':
                products_data = self._parse_csv(file)
            else:
                return Response({
                    'error': 'Invalid file format. Only JSON and CSV are supported'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            created_products = []
            errors = []
            
            for idx, product_data in enumerate(products_data):
                try:
                    # Get or create category
                    category_name = product_data.get('category')
                    if category_name:
                        category, _ = Category.objects.get_or_create(name=category_name)
                        product_data['category'] = category.id
                    
                    # Get or create brand
                    brand_name = product_data.get('brand')
                    if brand_name:
                        brand, _ = Brand.objects.get_or_create(name=brand_name)
                        product_data['brand'] = brand.id
                    
                    # Parse dimensions if string
                    if 'dimensions' in product_data and isinstance(product_data['dimensions'], str):
                        try:
                            product_data['dimensions'] = json.loads(product_data['dimensions'])
                        except:
                            pass
                    
                    # Create product using serializer
                    serializer = ProductSerializer(data=product_data)
                    if serializer.is_valid():
                        product = serializer.save()
                        created_products.append(product.id)
                    else:
                        errors.append({
                            'row': idx + 1,
                            'data': product_data,
                            'errors': serializer.errors
                        })
                except Exception as e:
                    errors.append({
                        'row': idx + 1,
                        'data': product_data,
                        'error': str(e)
                    })
            
            return Response({
                'message': f'Successfully created {len(created_products)} products',
                'created_product_ids': created_products,
                'errors': errors if errors else None
            }, status=status.HTTP_201_CREATED if created_products else status.HTTP_400_BAD_REQUEST)
            
        except json.JSONDecodeError:
            return Response({'error': 'Invalid JSON format'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def _parse_csv(self, file):
        """Parse CSV file to list of dictionaries"""
        decoded_file = file.read().decode('utf-8')
        io_string = io.StringIO(decoded_file)
        reader = csv.DictReader(io_string)
        
        products = []
        for row in reader:
            # Convert numeric fields
            if 'price' in row:
                row['price'] = float(row['price'])
            if 'stock_quantity' in row:
                row['stock_quantity'] = int(row['stock_quantity'])
            if 'weight_kg' in row and row['weight_kg']:
                row['weight_kg'] = float(row['weight_kg'])
            
            # Parse dimensions if present
            if 'dimensions' in row and row['dimensions']:
                try:
                    row['dimensions'] = json.loads(row['dimensions'])
                except:
                    pass
            
            products.append(row)
        
        return products
