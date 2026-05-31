from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from apps.users.permissions import IsAdminWith2FA
from apps.products.models import Product, Category, Brand, Review
from apps.products.serializers import ProductSerializer, CategorySerializer, BrandSerializer
from apps.orders.models import Order, OrderItem
from apps.orders.serializers import OrderSerializer, OrderDetailSerializer
from django.db import transaction

User = get_user_model()


# Product Management
class AdminProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET: Retrieve product details
    PUT/PATCH: Update product
    DELETE: Delete product
    """
    permission_classes = [IsAdminWith2FA]
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    lookup_url_kwarg = 'product_id'


# Category Management
class AdminCategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET: Retrieve category
    PUT/PATCH: Update category
    DELETE: Delete category
    """
    permission_classes = [IsAdminWith2FA]
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    lookup_url_kwarg = 'category_id'


# Brand Management
class AdminBrandDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET: Retrieve brand
    PUT/PATCH: Update brand
    DELETE: Delete brand
    """
    permission_classes = [IsAdminWith2FA]
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer
    lookup_url_kwarg = 'brand_id'


# Order Management
class AdminOrderListView(generics.ListAPIView):
    """
    GET: List all orders (admin view)
    """
    permission_classes = [IsAdminWith2FA]
    serializer_class = OrderSerializer
    queryset = Order.objects.all().select_related('user').order_by('-created_at')


class AdminOrderDetailView(generics.RetrieveUpdateAPIView):
    """
    GET: Retrieve order details
    PUT/PATCH: Update order (status, shipping, etc)
    """
    permission_classes = [IsAdminWith2FA]
    queryset = Order.objects.all()
    serializer_class = OrderDetailSerializer
    lookup_url_kwarg = 'order_id'


class AdminOrderStatusUpdateView(APIView):
    """
    POST: Update order status
    """
    permission_classes = [IsAdminWith2FA]
    
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            new_status = request.data.get('status')
            
            valid_statuses = ['pending_payment', 'processing', 'shipped', 'delivered', 'cancelled']
            if new_status not in valid_statuses:
                return Response({
                    'error': f'Invalid status. Must be one of: {", ".join(valid_statuses)}'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            order.status = new_status
            order.save(update_fields=['status'])
            
            return Response({
                'message': 'Order status updated',
                'order_id': order.id,
                'status': order.status
            })
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)


class AdminOrderShippingUpdateView(APIView):
    """
    POST: Update shipping information
    """
    permission_classes = [IsAdminWith2FA]
    
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            tracking_number = request.data.get('tracking_number')
            shipping_carrier = request.data.get('shipping_carrier')
            estimated_delivery = request.data.get('estimated_delivery')
            
            if tracking_number:
                order.tracking_number = tracking_number
            if shipping_carrier:
                order.shipping_carrier = shipping_carrier
            if estimated_delivery:
                order.estimated_delivery = estimated_delivery
            
            order.save()
            
            return Response({
                'message': 'Shipping information updated',
                'order_id': order.id,
                'tracking_number': order.tracking_number,
                'shipping_carrier': order.shipping_carrier
            })
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)


# User Management
class AdminUserListView(APIView):
    """
    GET: List all users
    """
    permission_classes = [IsAdminWith2FA]
    
    def get(self, request):
        users = User.objects.all().order_by('-date_joined')
        users_data = [{
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'first_name': u.first_name,
            'last_name': u.last_name,
            'is_staff': u.is_staff,
            'is_active': u.is_active,
            'twofa_enabled': u.twofa_enabled,
            'date_joined': u.date_joined
        } for u in users]
        
        return Response(users_data)


class AdminUserDetailView(APIView):
    """
    GET: Retrieve user details
    PATCH: Update user roles
    """
    permission_classes = [IsAdminWith2FA]
    
    def get(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
            return Response({
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'is_staff': user.is_staff,
                'is_active': user.is_active,
                'twofa_enabled': user.twofa_enabled,
                'date_joined': user.date_joined,
                'last_login': user.last_login
            })
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def patch(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
            
            # Update allowed fields
            if 'is_staff' in request.data:
                user.is_staff = request.data['is_staff']
            if 'is_active' in request.data:
                user.is_active = request.data['is_active']
            
            user.save()
            
            return Response({
                'message': 'User updated',
                'user_id': user.id,
                'is_staff': user.is_staff,
                'is_active': user.is_active
            })
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)


# Review Moderation
class AdminReviewListView(APIView):
    """
    GET: List all reviews (for moderation)
    """
    permission_classes = [IsAdminWith2FA]
    
    def get(self, request):
        reviews = Review.objects.all().select_related('user', 'product').order_by('-created_at')
        reviews_data = [{
            'id': r.id,
            'user': r.user.username,
            'product': r.product.name,
            'product_id': r.product.id,
            'rating': r.rating,
            'review_text': r.review_text,
            'helpful_count': r.helpful_count,
            'created_at': r.created_at
        } for r in reviews]
        
        return Response(reviews_data)


class AdminReviewDeleteView(APIView):
    """
    DELETE: Delete review (moderation)
    """
    permission_classes = [IsAdminWith2FA]
    
    def delete(self, request, review_id):
        try:
            review = Review.objects.get(id=review_id)
            product_name = review.product.name
            review.delete()
            
            return Response({
                'message': f'Review deleted from {product_name}'
            })
        except Review.DoesNotExist:
            return Response({'error': 'Review not found'}, status=status.HTTP_404_NOT_FOUND)


# Dashboard Stats
class AdminDashboardStatsView(APIView):
    """
    GET: Get dashboard statistics
    """
    permission_classes = [IsAdminWith2FA]
    
    def get(self, request):
        from django.db.models import Sum, Count, Avg
        from django.utils import timezone
        from datetime import timedelta
        
        # Get stats
        total_products = Product.objects.count()
        total_orders = Order.objects.count()
        total_users = User.objects.count()
        total_reviews = Review.objects.count()
        
        # Recent orders (last 30 days)
        thirty_days_ago = timezone.now() - timedelta(days=30)
        recent_orders = Order.objects.filter(created_at__gte=thirty_days_ago)
        recent_orders_count = recent_orders.count()
        recent_revenue = recent_orders.filter(status='delivered').aggregate(
            total=Sum('total_amount')
        )['total'] or 0
        
        # Low stock products
        low_stock_products = Product.objects.filter(stock_quantity__lte=10, stock_quantity__gt=0).count()
        out_of_stock = Product.objects.filter(stock_quantity=0).count()
        
        return Response({
            'total_products': total_products,
            'total_orders': total_orders,
            'total_users': total_users,
            'total_reviews': total_reviews,
            'recent_orders_30d': recent_orders_count,
            'recent_revenue_30d': float(recent_revenue),
            'low_stock_products': low_stock_products,
            'out_of_stock_products': out_of_stock
        })
