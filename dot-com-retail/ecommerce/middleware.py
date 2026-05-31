"""
Token Bucket Rate Limiting Middleware
Implements rate limiting to prevent API abuse
"""
import time
from django.core.cache import cache
from django.http import JsonResponse
from django.conf import settings


class TokenBucketRateLimiter:
    """
    Token bucket algorithm for rate limiting
    """
    def __init__(self, get_response):
        self.get_response = get_response
        # Rate limit settings (requests per minute)
        self.rate_limit = getattr(settings, 'RATE_LIMIT_REQUESTS', 60)
        self.window_seconds = getattr(settings, 'RATE_LIMIT_WINDOW', 60)
        
    def __call__(self, request):
        # Skip rate limiting for certain paths
        if self._should_skip_rate_limit(request):
            return self.get_response(request)
        
        # Get identifier (IP + user if authenticated)
        identifier = self._get_identifier(request)
        
        # Check rate limit
        if not self._check_rate_limit(identifier):
            return JsonResponse({
                'error': 'Rate limit exceeded. Please try again later.',
                'retry_after': self.window_seconds
            }, status=429)
        
        return self.get_response(request)
    
    def _should_skip_rate_limit(self, request):
        """Skip rate limiting for static files and admin"""
        path = request.path
        skip_paths = [
            '/static/',
            '/media/',
            '/admin/',  # Django admin uses different protection
        ]
        return any(path.startswith(skip_path) for skip_path in skip_paths)
    
    def _get_identifier(self, request):
        """Get unique identifier for rate limiting"""
        # Use IP address
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        
        # Add user ID if authenticated
        if hasattr(request, 'user') and request.user.is_authenticated:
            return f'ratelimit:{ip}:{request.user.id}'
        
        return f'ratelimit:{ip}'
    
    def _check_rate_limit(self, identifier):
        """
        Token bucket algorithm implementation
        Returns True if request is allowed, False if rate limit exceeded
        """
        now = time.time()
        bucket_key = f'{identifier}:bucket'
        last_check_key = f'{identifier}:last_check'
        
        # Get current bucket state from cache
        tokens = cache.get(bucket_key, self.rate_limit)
        last_check = cache.get(last_check_key, now)
        
        # Calculate tokens to add based on time elapsed
        time_elapsed = now - last_check
        tokens_to_add = time_elapsed * (self.rate_limit / self.window_seconds)
        
        # Refill bucket (up to maximum)
        tokens = min(self.rate_limit, tokens + tokens_to_add)
        
        # Check if we have tokens available
        if tokens >= 1:
            # Consume one token
            tokens -= 1
            cache.set(bucket_key, tokens, self.window_seconds * 2)
            cache.set(last_check_key, now, self.window_seconds * 2)
            return True
        else:
            # No tokens available
            cache.set(bucket_key, tokens, self.window_seconds * 2)
            cache.set(last_check_key, now, self.window_seconds * 2)
            return False
