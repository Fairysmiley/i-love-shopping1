from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
from apps.products.models import Product, Category, Brand
from apps.cart.models import Cart, CartItem

User = get_user_model()


class CartTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # create test user
        self.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='testpass123'
        )
        
        # create test products
        self.category = Category.objects.create(name='Electronics')
        self.brand = Brand.objects.create(name='TestBrand')
        
        self.product1 = Product.objects.create(
            name='Test Product 1',
            description='test desc',
            price=Decimal('99.99'),
            stock_quantity=10,
            category=self.category,
            brand=self.brand,
            weight_kg=1.0,
            is_active=True
        )
        
        self.product2 = Product.objects.create(
            name='Test Product 2',
            description='test desc 2',
            price=Decimal('49.99'),
            stock_quantity=5,
            category=self.category,
            brand=self.brand,
            weight_kg=0.5,
            is_active=True
        )

    def test_guest_cart_creation(self):
        """test guest can create cart"""
        response = self.client.get('/cart/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['item_count'], 0)

    def test_add_item_to_cart(self):
        """test adding item to cart"""
        response = self.client.post('/cart/add/', {
            'product_id': self.product1.id,
            'quantity': 2
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['item_count'], 2)
        self.assertEqual(len(response.data['items']), 1)

    def test_add_item_exceeds_stock(self):
        """test adding more items than available stock"""
        response = self.client.post('/cart/add/', {
            'product_id': self.product1.id,
            'quantity': 20
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_cart_item_quantity(self):
        """test updating item quantity in cart"""
        # add item
        self.client.post('/cart/add/', {
            'product_id': self.product1.id,
            'quantity': 2
        })
        
        # get cart
        cart_response = self.client.get('/cart/')
        item_id = cart_response.data['items'][0]['id']
        
        # update quantity
        response = self.client.put(f'/cart/update/{item_id}/', {
            'quantity': 5
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['items'][0]['quantity'], 5)

    def test_remove_item_from_cart(self):
        """test removing item from cart"""
        # add item
        self.client.post('/cart/add/', {
            'product_id': self.product1.id,
            'quantity': 2
        })
        
        # get cart
        cart_response = self.client.get('/cart/')
        item_id = cart_response.data['items'][0]['id']
        
        # remove item
        response = self.client.delete(f'/cart/remove/{item_id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['item_count'], 0)

    def test_clear_cart(self):
        """test clearing all items from cart"""
        # add items
        self.client.post('/cart/add/', {
            'product_id': self.product1.id,
            'quantity': 2
        })
        self.client.post('/cart/add/', {
            'product_id': self.product2.id,
            'quantity': 1
        })
        
        # clear cart
        response = self.client.delete('/cart/clear/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['item_count'], 0)

    def test_cart_total_calculation(self):
        """test cart total is calculated correctly"""
        # add items
        self.client.post('/cart/add/', {
            'product_id': self.product1.id,
            'quantity': 2
        })
        self.client.post('/cart/add/', {
            'product_id': self.product2.id,
            'quantity': 1
        })
        
        response = self.client.get('/cart/')
        expected_total = (Decimal('99.99') * 2) + Decimal('49.99')
        self.assertEqual(Decimal(response.data['total']), expected_total)

    def test_user_cart_persistence(self):
        """test logged in user cart persists"""
        # login
        self.client.force_authenticate(user=self.user)
        
        # add item
        self.client.post('/cart/add/', {
            'product_id': self.product1.id,
            'quantity': 2
        })
        
        # logout and login again
        self.client.force_authenticate(user=None)
        self.client.force_authenticate(user=self.user)
        
        # cart should still have items
        response = self.client.get('/cart/')
        self.assertEqual(response.data['item_count'], 2)

    def test_guest_cart_merge_on_login(self):
        """test guest cart merges into user cart on login"""
        # add item as guest
        self.client.post('/cart/add/', {
            'product_id': self.product1.id,
            'quantity': 1
        })
        
        # login
        self.client.force_authenticate(user=self.user)
        
        # get cart - should have guest items
        response = self.client.get('/cart/')
        self.assertEqual(response.data['item_count'], 1)
