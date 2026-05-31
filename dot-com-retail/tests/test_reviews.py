"""
Tests for Product Reviews functionality
"""
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from .simple_base import BaseAPITestCase
from .factories import UserFactory, ProductFactory, CategoryFactory, BrandFactory
from apps.products.models import Review, ReviewHelpful


class ReviewTestCase(BaseAPITestCase):
    """Test product review functionality"""
    
    def setUp(self):
        super().setUp()
        self.user2 = UserFactory(username='user2', email='user2@test.com')
        self.product = ProductFactory(category=self.category, brand=self.brand)
        
        # Create a delivered order so users can review the product
        from apps.orders.models import Order, OrderItem
        self.order = Order.objects.create(
            user=self.user,
            status='delivered',
            total_amount=self.product.price,
            billing_address={'street': '123 Test St', 'city': 'Test City', 'postal_code': '12345'},
            shipping_address={'street': '123 Test St', 'city': 'Test City', 'postal_code': '12345'}
        )
        OrderItem.objects.create(
            order=self.order,
            product=self.product,
            product_name=self.product.name,
            quantity=1,
            price_at_time=self.product.price
        )
    
    def test_create_review(self):
        """Test creating a product review"""
        tokens = self.get_tokens_for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        
        data = {
            'product': self.product.id,
            'rating': 5,
            'review_text': 'Excellent product!'
        }
        
        response = self.client.post('/products/reviews/create/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Verify review was created
        self.assertTrue(Review.objects.filter(user=self.user, product=self.product).exists())
        review = Review.objects.get(user=self.user, product=self.product)
        self.assertEqual(review.rating, 5)
        self.assertEqual(review.review_text, 'Excellent product!')
    
    def test_duplicate_review_not_allowed(self):
        """Test that user cannot review same product twice"""
        tokens = self.get_tokens_for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        
        data = {
            'product': self.product.id,
            'rating': 5,
            'review_text': 'Great!'
        }
        
        # First review should succeed
        response = self.client.post('/products/reviews/create/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Second review should fail
        response = self.client.post('/products/reviews/create/', data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_list_product_reviews(self):
        """Test listing reviews for a product"""
        # Create a fresh product for this test to avoid conflicts
        from apps.products.models import Product
        test_product = ProductFactory(category=self.category, brand=self.brand)
        
        # Ensure no existing reviews for this product
        Review.objects.filter(product=test_product).delete()
        
        # Create exactly 2 reviews
        Review.objects.create(user=self.user, product=test_product, rating=5, review_text='Great!')
        Review.objects.create(user=self.user2, product=test_product, rating=4, review_text='Good')
        
        # Verify we have exactly 2 reviews
        count = Review.objects.filter(product=test_product).count()
        self.assertEqual(count, 2, f"Expected 2 reviews, but found {count}")
        
        response = self.client.get(f'/products/{test_product.id}/reviews/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Response is paginated, check the results
        self.assertEqual(len(response.data['results']), 2)
    
    def test_helpful_vote(self):
        """Test voting review as helpful"""
        review = Review.objects.create(
            user=self.user2, 
            product=self.product, 
            rating=5, 
            review_text='Excellent!'
        )
        
        tokens = self.get_tokens_for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        
        response = self.client.post(f'/products/reviews/{review.id}/helpful/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify vote was recorded
        self.assertTrue(ReviewHelpful.objects.filter(user=self.user, review=review).exists())
        
        # Verify helpful count increased
        review.refresh_from_db()
        self.assertEqual(review.helpful_count, 1)
    
    def test_duplicate_helpful_vote_not_allowed(self):
        """Test that user cannot vote same review helpful twice"""
        review = Review.objects.create(
            user=self.user2, 
            product=self.product, 
            rating=5, 
            review_text='Great!'
        )
        
        tokens = self.get_tokens_for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        
        # First vote should succeed
        response = self.client.post(f'/products/reviews/{review.id}/helpful/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Second vote should fail
        response = self.client.post(f'/products/reviews/{review.id}/helpful/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_average_rating_calculation(self):
        """Test that average rating is calculated correctly"""
        Review.objects.create(user=self.user, product=self.product, rating=5)
        Review.objects.create(user=self.user2, product=self.product, rating=3)
        
        avg = self.product.get_average_rating()
        self.assertEqual(avg, 4.0)  # (5 + 3) / 2 = 4.0
    
    def test_review_requires_authentication(self):
        """Test that review creation requires authentication"""
        data = {
            'product': self.product.id,
            'rating': 5,
            'review_text': 'Great!'
        }
        
        response = self.client.post('/products/reviews/create/', data)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_cannot_review_without_purchase(self):
        """Test that users cannot review products they haven't purchased"""
        # Create a new product that the user hasn't ordered
        unpurchased_product = ProductFactory(
            category=self.category,
            brand=self.brand,
            name='Unpurchased Product'
        )
        
        tokens = self.get_tokens_for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        
        data = {
            'product': unpurchased_product.id,
            'rating': 5,
            'review_text': 'Trying to review without purchasing!'
        }
        
        response = self.client.post('/products/reviews/create/', data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('purchased', response.data.get('error', '').lower())
        
        # Verify review was NOT created
        self.assertFalse(Review.objects.filter(user=self.user, product=unpurchased_product).exists())

    
    def test_review_rating_validation(self):
        """Test that rating must be between 1 and 5"""
        tokens = self.get_tokens_for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        
        # Test invalid rating
        data = {
            'product': self.product.id,
            'rating': 6,  # Invalid
            'review_text': 'Test'
        }
        
        response = self.client.post('/products/reviews/create/', data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
