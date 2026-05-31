"""
Tests for Admin functionality
"""
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from .simple_base import BaseAPITestCase
from .factories import UserFactory, ProductFactory, CategoryFactory, BrandFactory
from apps.products.models import Review
from apps.orders.models import Order
from django.contrib.auth import get_user_model

User = get_user_model()


class AdminPermissionTestCase(BaseAPITestCase):
    """Test admin 2FA enforcement"""
    
    def setUp(self):
        super().setUp()
        # Create admin user without 2FA
        self.admin_no_2fa = UserFactory(
            username='admin_no_2fa',
            email='admin_no_2fa@test.com',
            is_staff=True,
            twofa_enabled=False
        )
        
        # Create admin user with 2FA
        self.admin_with_2fa = UserFactory(
            username='admin_2fa',
            email='admin_2fa@test.com',
            is_staff=True,
            twofa_enabled=True,
            twofa_secret='testsecret123'
        )
    
    def test_admin_requires_2fa(self):
        """Test that admin endpoints require 2FA"""
        tokens = self.get_tokens_for_user(self.admin_no_2fa)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        
        response = self.client.get('/admin-api/stats/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('2FA', response.data['detail'])
    
    def test_admin_with_2fa_can_access(self):
        """Test that admin with 2FA can access admin endpoints"""
        tokens = self.get_tokens_for_user(self.admin_with_2fa)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        
        response = self.client.get('/admin-api/stats/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
    
    def test_regular_user_cannot_access_admin(self):
        """Test that regular users cannot access admin endpoints"""
        tokens = self.get_tokens_for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        
        response = self.client.get('/admin-api/stats/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class AdminCRUDTestCase(BaseAPITestCase):
    """Test admin CRUD operations"""
    
    def setUp(self):
        super().setUp()
        self.admin = UserFactory(
            username='admin',
            email='admin@test.com',
            is_staff=True,
            twofa_enabled=True,
            twofa_secret='secret123'
        )
        self.tokens = self.get_tokens_for_user(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.tokens["access"]}')
    
    def test_admin_can_update_product(self):
        """Test admin can update product"""
        data = {
            'name': 'Updated Product Name',
            'price': '999.99'
        }
        
        response = self.client.patch(f'/admin-api/products/{self.product.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.product.refresh_from_db()
        self.assertEqual(self.product.name, 'Updated Product Name')
    
    def test_admin_can_delete_product(self):
        """Test admin can delete product"""
        product = ProductFactory(category=self.category)
        
        response = self.client.delete(f'/admin-api/products/{product.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        # Verify product was deleted
        from apps.products.models import Product
        self.assertFalse(Product.objects.filter(id=product.id).exists())
    
    def test_admin_can_manage_user_roles(self):
        """Test admin can update user roles"""
        regular_user = UserFactory(username='regular', email='regular@test.com', is_staff=False)
        
        data = {'is_staff': True}
        response = self.client.patch(f'/admin-api/users/{regular_user.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        regular_user.refresh_from_db()
        self.assertTrue(regular_user.is_staff)
    
    def test_admin_can_moderate_reviews(self):
        """Test admin can delete reviews"""
        review = Review.objects.create(
            user=self.user,
            product=self.product,
            rating=5,
            review_text='Test review'
        )
        
        response = self.client.delete(f'/admin-api/reviews/{review.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify review was deleted
        self.assertFalse(Review.objects.filter(id=review.id).exists())
    
    def test_admin_dashboard_stats(self):
        """Test admin dashboard statistics"""
        response = self.client.get('/admin-api/stats/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify response contains expected fields
        self.assertIn('total_products', response.data)
        self.assertIn('total_orders', response.data)
        self.assertIn('total_users', response.data)
        self.assertIn('total_reviews', response.data)


class BulkUploadTestCase(BaseAPITestCase):
    """Test bulk product upload"""
    
    def setUp(self):
        super().setUp()
        self.admin = UserFactory(
            username='admin',
            email='admin@test.com',
            is_staff=True,
            twofa_enabled=True,
            twofa_secret='secret123'
        )
        self.tokens = self.get_tokens_for_user(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.tokens["access"]}')
    
    def test_bulk_upload_json(self):
        """Test bulk upload via JSON"""
        import json
        import io
        
        products_data = [
            {
                'name': 'Bulk Product 1',
                'price': '99.99',
                'stock_quantity': 10,
                'category': self.category.name,
                'brand': self.brand.name
            },
            {
                'name': 'Bulk Product 2',
                'price': '149.99',
                'stock_quantity': 5,
                'category': self.category.name,
                'brand': self.brand.name
            }
        ]
        
        json_file = io.BytesIO(json.dumps(products_data).encode())
        json_file.name = 'products.json'
        
        response = self.client.post('/products/bulk-upload/', {'file': json_file}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Verify products were created
        self.assertEqual(len(response.data['created_product_ids']), 2)
    
    def test_bulk_upload_requires_admin_2fa(self):
        """Test bulk upload requires admin with 2FA"""
        # Use regular user
        tokens = self.get_tokens_for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')
        
        import json
        import io
        
        json_file = io.BytesIO(json.dumps([]).encode())
        json_file.name = 'products.json'
        
        response = self.client.post('/products/bulk-upload/', {'file': json_file}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
