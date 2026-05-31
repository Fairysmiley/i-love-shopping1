from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from .factories import UserFactory, CategoryFactory, BrandFactory, ProductFactory

User = get_user_model()


class BaseTestCase(TestCase):
    
    def setUp(self):
        super().setUp()
        self.user = UserFactory(email='testuser@test.com', username='testuser')
    
    def assertSuccess(self, response):
        """Assert success status"""
        self.assertTrue(200 <= response.status_code < 300)
    
    def assertUnauthorized(self, response):
        """Assert 401 status"""
        self.assertEqual(response.status_code, 401)


class BaseAPITestCase(APITestCase):
    """Simple API test case"""
    
    def setUp(self):
        """Set up API test environment"""
        super().setUp()
        self.client = APIClient()
        self.user = UserFactory(email='testuser@test.com', username='testuser')
        
        # Create basic test data
        self.category = CategoryFactory()
        self.brand = BrandFactory()
        self.product = ProductFactory(category=self.category, brand=self.brand)
    
    def get_tokens_for_user(self, user):
        """Generate JWT tokens"""
        refresh = RefreshToken.for_user(user)
        access = refresh.access_token
        access["tv"] = user.token_version  # Add token version
        return {
            'refresh': str(refresh),
            'access': str(access)
        }
    
    def authenticate_user(self, user=None):
        """Authenticate user"""
        if user is None:
            user = self.user
        tokens = self.get_tokens_for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        return tokens
    
    def assertAPISuccess(self, response):
        """Assert API success"""
        self.assertEqual(response.status_code, 200)
    
    def assertAPIError(self, response):
        """Assert API error"""
        self.assertEqual(response.status_code, 400)
    
    def assertUnauthorized(self, response):
        """Assert 401 status"""
        self.assertEqual(response.status_code, 401)