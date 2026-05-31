from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
from apps.products.models import Product, Category, Brand
from apps.cart.models import Cart, CartItem
from apps.orders.models import Order, OrderItem, Payment

User = get_user_model()


class OrderTests(TestCase):
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
        
        self.product = Product.objects.create(
            name='Test Product',
            description='test desc',
            price=Decimal('99.99'),
            stock_quantity=10,
            category=self.category,
            brand=self.brand,
            weight_kg=1.0,
            is_active=True
        )
        
        # add item to cart
        self.client.force_authenticate(user=self.user)
        self.client.post('/cart/add/', {
            'product_id': self.product.id,
            'quantity': 2
        })

    def test_create_order(self):
        """test creating order from cart"""
        order_data = {
            'billing_address': {
                'address': 'Mannerheimintie 1',
                'city': 'Helsinki',
                'postal_code': '00100',
                'country': 'FI'
            },
            'shipping_address': {
                'address': 'Mannerheimintie 1',
                'city': 'Helsinki',
                'postal_code': '00100',
                'country': 'FI'
            },
            'shipping_method': 'standard',
            'payment_method': 'stripe'
        }
        
        response = self.client.post('/orders/create/', order_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('order', response.data)
        self.assertIn('payment', response.data)
        self.assertEqual(response.data['order']['status'], 'pending_payment')

    def test_create_order_empty_cart(self):
        """test creating order with empty cart fails"""
        # clear cart
        self.client.delete('/cart/clear/')
        
        order_data = {
            'billing_address': {
                'address': 'Mannerheimintie 1',
                'city': 'Helsinki',
                'postal_code': '00100',
                'country': 'FI'
            },
            'shipping_address': {
                'address': 'Mannerheimintie 1',
                'city': 'Helsinki',
                'postal_code': '00100',
                'country': 'FI'
            },
            'payment_method': 'stripe'
        }
        
        response = self.client.post('/orders/create/', order_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_guest_checkout_requires_email(self):
        """test guest checkout requires email"""
        # logout
        self.client.force_authenticate(user=None)
        
        # add item to cart
        self.client.post('/cart/add/', {
            'product_id': self.product.id,
            'quantity': 1
        })
        
        order_data = {
            'billing_address': {
                'address': 'Mannerheimintie 1',
                'city': 'Helsinki',
                'postal_code': '00100',
                'country': 'FI'
            },
            'shipping_address': {
                'address': 'Mannerheimintie 1',
                'city': 'Helsinki',
                'postal_code': '00100',
                'country': 'FI'
            },
            'payment_method': 'stripe'
        }
        
        response = self.client.post('/orders/create/', order_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_order_list(self):
        """test listing user orders"""
        # create order
        order_data = {
            'billing_address': {
                'address': 'Mannerheimintie 1',
                'city': 'Helsinki',
                'postal_code': '00100',
                'country': 'FI'
            },
            'shipping_address': {
                'address': 'Mannerheimintie 1',
                'city': 'Helsinki',
                'postal_code': '00100',
                'country': 'FI'
            },
            'payment_method': 'stripe'
        }
        self.client.post('/orders/create/', order_data, format='json')
        
        # list orders
        response = self.client.get('/orders/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)

    def test_order_cancel(self):
        """test cancelling order"""
        # create order
        order_data = {
            'billing_address': {
                'address': 'Mannerheimintie 1',
                'city': 'Helsinki',
                'postal_code': '00100',
                'country': 'FI'
            },
            'shipping_address': {
                'address': 'Mannerheimintie 1',
                'city': 'Helsinki',
                'postal_code': '00100',
                'country': 'FI'
            },
            'payment_method': 'stripe'
        }
        order_response = self.client.post('/orders/create/', order_data, format='json')
        order_id = order_response.data['order']['id']
        
        # cancel order
        response = self.client.post(f'/orders/{order_id}/cancel/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'cancelled')

    def test_order_total_calculation(self):
        """test order total includes subtotal plus shipping"""
        order_data = {
            'billing_address': {
                'address': 'Mannerheimintie 1',
                'city': 'Helsinki',
                'postal_code': '00100',
                'country': 'FI'
            },
            'shipping_address': {
                'address': 'Mannerheimintie 1',
                'city': 'Helsinki',
                'postal_code': '00100',
                'country': 'FI'
            },
            'payment_method': 'stripe',
            'shipping_method': 'standard'
        }
        
        response = self.client.post('/orders/create/', order_data, format='json')
        cart_total = Decimal('99.99') * 2
        shipping_cost = Decimal('5.99')  # standard shipping
        expected_total = cart_total + shipping_cost
        
        self.assertEqual(Decimal(response.data['order']['subtotal']), cart_total)
        self.assertEqual(Decimal(response.data['order']['shipping_cost']), shipping_cost)
        self.assertEqual(Decimal(response.data['order']['total_amount']), expected_total)
