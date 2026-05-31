from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
from apps.orders.models import Order, OrderItem, Payment
from apps.orders.payment_service import create_payment_intent
from apps.products.models import Product, Category
from apps.cart.models import Cart, CartItem
from tests.factories import UserFactory, ProductFactory, CategoryFactory
import json
from unittest.mock import patch, MagicMock


class PaymentTests(TestCase):
    def setUp(self):
        """set up test data"""
        self.client = APIClient()
        
        # create user
        self.user = UserFactory()
        self.client.force_authenticate(user=self.user)
        
        # create product
        self.product = ProductFactory(
            name='test laptop',
            price=Decimal('999.99'),
            stock_quantity=10
        )
        
        # create cart with item
        self.cart = Cart.objects.create(user=self.user)
        self.cart_item = CartItem.objects.create(
            cart=self.cart,
            product=self.product,
            quantity=2
        )
    
    def test_create_order_creates_payment(self):
        """test that creating order also creates payment record"""
        data = {
            'shipping_address': {
                'address': 'Mannerheimintie 1',
                'city': 'Helsinki',
                'postal_code': '00100',
                'country': 'FI'
            },
            'billing_address': {
                'address': 'Mannerheimintie 1',
                'city': 'Helsinki',
                'postal_code': '00100',
                'country': 'FI'
            },
            'payment_method': 'stripe'
        }
        
        response = self.client.post('/orders/create/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Order.objects.count(), 1)
        
        order = Order.objects.first()
        self.assertEqual(Payment.objects.filter(order=order).count(), 1)
        
        payment = Payment.objects.first()
        self.assertEqual(payment.status, 'pending')
        self.assertEqual(payment.amount, order.total_amount)
    
    @patch('apps.orders.payment_service.stripe.PaymentIntent.create')
    def test_payment_intent_creation(self, mock_create):
        """test creating stripe payment intent"""
        # create order first
        order = Order.objects.create(
            user=self.user,
            status='pending_payment',
            total_amount=Decimal('1999.98'),
            shipping_address={'address': 'Mannerheimintie 1', 'city': 'Helsinki', 'postal_code': '00100', 'country': 'FI'},
            billing_address={'address': 'Mannerheimintie 1', 'city': 'Helsinki', 'postal_code': '00100', 'country': 'FI'}
        )
        
        OrderItem.objects.create(
            order=order,
            product=self.product,
            quantity=2,
            price_at_time=self.product.price,
            product_name=self.product.name
        )
        
        payment = Payment.objects.create(
            order=order,
            amount=order.total_amount,
            status='pending'
        )
        
        # mock stripe response
        mock_intent = MagicMock()
        mock_intent.id = 'pi_test123'
        mock_intent.client_secret = 'secret_test123'
        mock_intent.status = 'requires_payment_method'
        mock_create.return_value = mock_intent
        
        # call payment service
        result = create_payment_intent(
            amount=order.total_amount,
            metadata={
                'order_id': order.id,
                'customer_email': order.get_customer_email()
            }
        )
        
        self.assertTrue(result['success'])
        self.assertEqual(result['payment_intent_id'], 'pi_test123')
        self.assertEqual(result['client_secret'], 'secret_test123')
        
        # verify stripe was called with correct amount in cents
        mock_create.assert_called_once()
        call_args = mock_create.call_args[1]
        self.assertEqual(call_args['amount'], 199998)  # 1999.98 * 100
        self.assertEqual(call_args['currency'], 'usd')
    
    @patch('apps.orders.message_queue.get_rabbitmq_connection')
    @patch('apps.orders.views.stripe.Webhook.construct_event')
    def test_webhook_payment_success(self, mock_construct, mock_rabbitmq):
        """test webhook handling successful payment"""
        # create order and payment
        order = Order.objects.create(
            user=self.user,
            status='pending_payment',
            total_amount=Decimal('1999.98'),
            shipping_address={'address': 'Mannerheimintie 1', 'city': 'Helsinki', 'postal_code': '00100', 'country': 'FI'},
            billing_address={'address': 'Mannerheimintie 1', 'city': 'Helsinki', 'postal_code': '00100', 'country': 'FI'}
        )
        
        OrderItem.objects.create(
            order=order,
            product=self.product,
            quantity=2,
            price_at_time=self.product.price,
            product_name=self.product.name
        )
        
        payment = Payment.objects.create(
            order=order,
            amount=order.total_amount,
            payment_intent_id='pi_test123',
            status='pending'
        )
        
        # mock webhook event
        mock_event = {
            'type': 'payment_intent.succeeded',
            'data': {
                'object': {
                    'id': 'pi_test123'
                }
            }
        }
        mock_construct.return_value = mock_event
        
        # send webhook
        response = self.client.post(
            '/orders/payment/webhook/',
            data=json.dumps(mock_event),
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='test_signature'
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # verify payment updated (synchronous)
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'successful')
        
        # verify message was published to queue (mocked)
        mock_rabbitmq.assert_called()
        
        # Note: order status and stock reduction happen asynchronously via consumer
        # In production, the consumer service processes these updates
        # For synchronous testing, see test_stock_management.py
    
    @patch('apps.orders.message_queue.get_rabbitmq_connection')
    @patch('apps.orders.views.stripe.Webhook.construct_event')
    def test_webhook_payment_failed(self, mock_construct, mock_rabbitmq):
        """test webhook handling failed payment"""
        # create order and payment
        order = Order.objects.create(
            user=self.user,
            status='pending_payment',
            total_amount=Decimal('1999.98'),
            shipping_address={'address': 'Mannerheimintie 1', 'city': 'Helsinki', 'postal_code': '00100', 'country': 'FI'},
            billing_address={'address': 'Mannerheimintie 1', 'city': 'Helsinki', 'postal_code': '00100', 'country': 'FI'}
        )
        
        payment = Payment.objects.create(
            order=order,
            amount=order.total_amount,
            payment_intent_id='pi_test456',
            status='pending'
        )
        
        # mock webhook event
        mock_event = {
            'type': 'payment_intent.payment_failed',
            'data': {
                'object': {
                    'id': 'pi_test456',
                    'last_payment_error': {
                        'message': 'insufficient funds'
                    }
                }
            }
        }
        mock_construct.return_value = mock_event
        
        # send webhook
        response = self.client.post(
            '/orders/payment/webhook/',
            data=json.dumps(mock_event),
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='test_signature'
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # verify payment updated (synchronous)
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'failed')
        self.assertEqual(payment.failure_reason, 'insufficient funds')
        
        # verify message was published to queue (mocked)
        mock_rabbitmq.assert_called()
        
        # Note: order status update happens asynchronously via consumer
        # In production, the consumer service processes order status changes
    
    def test_payment_config_endpoint(self):
        """test getting stripe publishable key"""
        response = self.client.get('/orders/payment/config/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('publishable_key', response.data)
