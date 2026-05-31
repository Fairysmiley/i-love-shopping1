"""
Tests for Rate Limiting middleware
"""
import json
from django.test import TestCase, RequestFactory
from django.http import HttpResponse
from django.core.cache import cache
from ecommerce.middleware import TokenBucketRateLimiter
from .factories import UserFactory


class RateLimitingTestCase(TestCase):
    """Test rate limiting middleware"""
    
    def setUp(self):
        self.factory = RequestFactory()
        self.user = UserFactory()
        
        # Create middleware instance
        def get_response(request):
            return HttpResponse('OK')
        
        self.middleware = TokenBucketRateLimiter(get_response)
        
        # Clear cache before each test
        cache.clear()
    
    def test_rate_limit_allows_normal_requests(self):
        """Test that normal request rates are allowed"""
        request = self.factory.get('/products/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'
        request.user = self.user
        
        # Make several requests within limit
        for i in range(10):
            response = self.middleware(request)
            self.assertEqual(response.status_code, 200)
    
    def test_rate_limit_blocks_excessive_requests(self):
        """Test that excessive requests are blocked"""
        request = self.factory.get('/products/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'
        request.user = self.user
        
        # Make requests up to limit (60 per minute)
        for i in range(60):
            response = self.middleware(request)
            if response.status_code == 429:
                break  # Rate limit hit
        
        # Next request should be rate limited
        response = self.middleware(request)
        self.assertEqual(response.status_code, 429)
    
    def test_rate_limit_skips_static_files(self):
        """Test that rate limiting skips static files"""
        request = self.factory.get('/static/some-file.css')
        request.META['REMOTE_ADDR'] = '127.0.0.1'
        
        # Should not be rate limited
        response = self.middleware(request)
        self.assertEqual(response.status_code, 200)
    
    def test_rate_limit_skips_admin(self):
        """Test that rate limiting skips Django admin"""
        request = self.factory.get('/admin/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'
        
        response = self.middleware(request)
        self.assertEqual(response.status_code, 200)
    
    def test_rate_limit_per_user(self):
        """Test that rate limits are per user"""
        user1 = UserFactory(username='user1', email='user1@test.com')
        user2 = UserFactory(username='user2', email='user2@test.com')
        
        request1 = self.factory.get('/products/')
        request1.META['REMOTE_ADDR'] = '127.0.0.1'
        request1.user = user1
        request1._test_rate_limiting = True  # Enable rate limiting
        
        request2 = self.factory.get('/products/')
        request2.META['REMOTE_ADDR'] = '127.0.0.1'
        request2.user = user2
        request2._test_rate_limiting = True  # Enable rate limiting
        
        # Use up user1's rate limit
        for i in range(60):
            self.middleware(request1)
        
        # User1 should be rate limited
        response1 = self.middleware(request1)
        self.assertEqual(response1.status_code, 429)
        
        # User2 should still have tokens
        response2 = self.middleware(request2)
        self.assertEqual(response2.status_code, 200)
    
    def test_rate_limit_includes_retry_after(self):
        """Test that rate limit response includes retry_after"""
        request = self.factory.get('/products/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'
        request.user = self.user
        
        # Exhaust rate limit
        for i in range(61):
            response = self.middleware(request)
        
        # Check rate limited response
        self.assertEqual(response.status_code, 429)
        data = json.loads(response.content)
        self.assertIn('retry_after', data)
        self.assertEqual(data['retry_after'], 60)
