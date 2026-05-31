from django.urls import path
from . import views

app_name = 'admin_api'

urlpatterns = [
    # Dashboard
    path('stats/', views.AdminDashboardStatsView.as_view(), name='dashboard-stats'),
    
    # Products
    path('products/<int:product_id>/', views.AdminProductDetailView.as_view(), name='product-detail'),
    
    # Categories
    path('categories/<int:category_id>/', views.AdminCategoryDetailView.as_view(), name='category-detail'),
    
    # Brands
    path('brands/<int:brand_id>/', views.AdminBrandDetailView.as_view(), name='brand-detail'),
    
    # Orders
    path('orders/', views.AdminOrderListView.as_view(), name='order-list'),
    path('orders/<int:order_id>/', views.AdminOrderDetailView.as_view(), name='order-detail'),
    path('orders/<int:order_id>/status/', views.AdminOrderStatusUpdateView.as_view(), name='order-status'),
    path('orders/<int:order_id>/shipping/', views.AdminOrderShippingUpdateView.as_view(), name='order-shipping'),
    
    # Users
    path('users/', views.AdminUserListView.as_view(), name='user-list'),
    path('users/<int:user_id>/', views.AdminUserDetailView.as_view(), name='user-detail'),
    
    # Reviews
    path('reviews/', views.AdminReviewListView.as_view(), name='review-list'),
    path('reviews/<int:review_id>/', views.AdminReviewDeleteView.as_view(), name='review-delete'),
]
