from django.urls import path
from . import views

app_name = 'products'
urlpatterns = [
    # Category endpoints
    path('categories/', views.ApiCategoryListView.as_view(), name='category-list'),
    # Brand endpoints
    path('brands/', views.ApiBrandListView.as_view(), name='brand-list'),

    # Product endpoints
    path('', views.ApiProductListView.as_view(), name='product-list'),
    path('search/suggestions/', views.ApiProductSearchSuggestionsView.as_view(), name='product-search-suggestions'),
    path('<int:product_id>/', views.ApiProductDetailView.as_view(), name='product-detail'),
    path('<int:product_id>/upload-image/', views.ApiProductImageUploadView.as_view(), name='product-image-upload'),
    
    # Review endpoints
    path('<int:product_id>/reviews/', views.ProductReviewListView.as_view(), name='product-reviews'),
    path('reviews/create/', views.ReviewCreateView.as_view(), name='review-create'),
    path('reviews/<int:review_id>/helpful/', views.ReviewHelpfulVoteView.as_view(), name='review-helpful'),
    
    # Admin endpoints
    path('bulk-upload/', views.BulkProductUploadView.as_view(), name='bulk-upload'),
]
