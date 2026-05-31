from rest_framework import generics, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, NotFound
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.conf import settings
from datetime import timedelta
from .models import Order, OrderItem, Payment
from .serializers import OrderSerializer, OrderCreateSerializer, PaymentSerializer, OrderDetailSerializer
from .payment_service import create_payment_intent, confirm_payment, get_publishable_key, create_refund
from .shipping import get_shipping_price, get_shipping_options
from .message_queue import publish_payment_status
from apps.cart.views import get_or_create_cart
from apps.cart.models import Cart
from apps.products.models import Product
import stripe
import logging

logger = logging.getLogger(__name__)


class OrderListPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class OrderListView(generics.ListAPIView):
    """
    GET: list user orders with pagination (20 per page)
    """
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = OrderListPagination

    def get_queryset(self):
        queryset = Order.objects.filter(user=self.request.user)
        
        # filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # filter by date range
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            queryset = queryset.filter(created_at__gte=start_date)
        if end_date:
            queryset = queryset.filter(created_at__lte=end_date)
        
        # sorting
        ordering = self.request.query_params.get('ordering', '-created_at')
        allowed_fields = ['created_at', '-created_at', 'total_amount', '-total_amount']
        if ordering in allowed_fields:
            queryset = queryset.order_by(ordering)
        
        return queryset


class OrderDetailView(generics.RetrieveAPIView):
    """
    GET: get order details with payments
    Allows authenticated users to view their orders,
    or anyone to view an order within 10 minutes of creation (for post-payment redirect)
    """
    serializer_class = OrderDetailSerializer
    permission_classes = [AllowAny]

    def get_object(self):
        order_id = self.kwargs.get('pk')
        try:
            order = Order.objects.get(id=order_id)
            
            # Allow if user owns the order
            if self.request.user.is_authenticated and order.user == self.request.user:
                return order
            
            # Allow if order was created recently (within 10 minutes) for post-payment access
            if order.created_at > timezone.now() - timedelta(minutes=10):
                return order
            
            # Otherwise, deny access
            raise PermissionDenied('You do not have permission to view this order')
        except Order.DoesNotExist:
            raise NotFound('Order not found')


class OrderCreateView(APIView):
    """
    POST: create order from cart
    """
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        """
        ACID Compliance Strategy (Two-Phase Commit):
        
        Phase 1 (Order Creation):
        - Soft check stock availability (fail fast if obviously out of stock)
        - Create order with status 'pending_payment'
        - DO NOT reduce stock yet (prevents phantom reservations)
        
        Phase 2 (Webhook - payment_intent.succeeded):
        - Lock product rows with select_for_update()
        - Atomically reduce stock with F() expressions
        - If insufficient stock: initiate automatic refund + cancel order
        - If sufficient: mark order as 'processing'
        
        Benefits:
        - No phantom reservations if user abandons checkout
        - Race conditions handled by refusing order + refunding
        - Stock only locked for milliseconds during webhook processing
        - User experience: "Sorry, sold out. Refund issued."
        """
        serializer = OrderCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        # validate guest email for guest checkout
        if not request.user.is_authenticated:
            guest_email = request.data.get('guest_email')
            if not guest_email:
                return Response({'error': 'guest_email required for guest checkout'}, status=status.HTTP_400_BAD_REQUEST)
        
        # get cart
        cart = get_or_create_cart(request)
        
        if not cart.items.exists():
            return Response({'error': 'cart is empty'}, status=status.HTTP_400_BAD_REQUEST)
        
        # check stock availability (but don't reduce yet - wait for payment)
        # this is a soft check to fail fast if obviously out of stock
        for item in cart.items.select_related('product').all():
            product = item.product
            
            if not product.is_active:
                return Response(
                    {'error': f'{product.name} is no longer available'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if item.quantity > product.stock_quantity:
                return Response(
                    {'error': f'only {product.stock_quantity} items available for {product.name}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # calculate costs
        subtotal = cart.get_total()
        shipping_method = serializer.validated_data.get('shipping_method', 'standard')
        shipping_cost = get_shipping_price(shipping_method)
        total_amount = subtotal + shipping_cost
        
        # create order
        order = Order.objects.create(
            user=request.user if request.user.is_authenticated else None,
            guest_email=request.data.get('guest_email') if not request.user.is_authenticated else None,
            phone=serializer.validated_data.get('phone', ''),
            billing_address=serializer.validated_data['billing_address'],
            shipping_address=serializer.validated_data['shipping_address'],
            shipping_method=shipping_method,
            notes=serializer.validated_data.get('notes', ''),
            subtotal=subtotal,
            shipping_cost=shipping_cost,
            total_amount=total_amount,
            status='pending_payment'
        )
        
        # create order items - stock will be reduced when payment succeeds
        for cart_item in cart.items.all():
            OrderItem.objects.create(
                order=order,
                product=cart_item.product,
                product_name=cart_item.product.name,
                quantity=cart_item.quantity,
                price_at_time=cart_item.product.price
            )
        
        # create stripe payment intent
        payment_result = create_payment_intent(
            amount=float(order.total_amount),
            metadata={
                'order_id': order.id,
                'user_email': order.get_customer_email()
            }
        )
        
        if not payment_result['success']:
            # rollback order if payment intent creation fails
            order.delete()
            return Response(
                {'error': f"payment creation failed: {payment_result.get('error')}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # create payment record
        payment = Payment.objects.create(
            order=order,
            payment_method=serializer.validated_data['payment_method'],
            amount=order.total_amount,
            transaction_id=payment_result['payment_intent_id'],
            payment_intent_id=payment_result['payment_intent_id'],
            status='pending'
        )
        
        # clear cart
        cart.items.all().delete()
        
        order_serializer = OrderSerializer(order)
        return Response({
            'order': order_serializer.data,
            'payment': PaymentSerializer(payment).data,
            'client_secret': payment_result['client_secret']
        }, status=status.HTTP_201_CREATED)


class OrderCancelView(APIView):
    """
    POST: cancel order
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id, user=request.user)
        except Order.DoesNotExist:
            return Response({'error': 'order not found'}, status=status.HTTP_404_NOT_FOUND)
        
        if not order.can_cancel():
            return Response({'error': 'order cannot be cancelled'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Only restore stock if it was actually reduced (order reached 'processing' status)
        if order.stock_was_reduced():
            for item in order.items.all():
                if item.product:
                    Product.objects.filter(id=item.product.id).update(
                        stock_quantity=F('stock_quantity') + item.quantity
                    )
            logger.info(f'restored stock for cancelled order {order.id}')
        else:
            logger.info(f'no stock restoration needed for order {order.id} (status: {order.status})')
        
        order.status = 'cancelled'
        order.save()
        
        serializer = OrderSerializer(order)
        return Response(serializer.data)


class OrderRefundView(APIView):
    """
    POST: request refund for order
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id, user=request.user)
        except Order.DoesNotExist:
            return Response({'error': 'order not found'}, status=status.HTTP_404_NOT_FOUND)
        
        if not order.can_refund():
            return Response({'error': 'order cannot be refunded'}, status=status.HTTP_400_BAD_REQUEST)
        
        # get successful payment for this order
        payment = order.payments.filter(status='successful').first()
        if not payment or not payment.payment_intent_id:
            return Response({'error': 'no successful payment found'}, status=status.HTTP_400_BAD_REQUEST)
        
        # validate refund amount if provided
        refund_amount = request.data.get('amount')
        if refund_amount:
            refund_amount = float(refund_amount)
            if refund_amount <= 0 or refund_amount > float(payment.amount):
                return Response(
                    {'error': f'refund amount must be between 0 and {payment.amount}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # create refund via stripe
        refund_result = create_refund(payment.payment_intent_id, refund_amount)
        
        if not refund_result['success']:
            return Response({'error': refund_result.get('error')}, status=status.HTTP_400_BAD_REQUEST)
        
        # update payment and order status
        payment.status = 'refunded'
        payment.save()
        
        order.status = 'refunded'
        order.save()
        
        # restore stock atomically (only if it was reduced in the first place)
        if order.stock_was_reduced():
            for item in order.items.all():
                if item.product:
                    Product.objects.filter(id=item.product.id).update(
                        stock_quantity=F('stock_quantity') + item.quantity
                    )
            logger.info(f'restored stock for refunded order {order.id}')
        else:
            logger.info(f'no stock restoration needed for refunded order {order.id} (status was: {order.status})')
        
        serializer = OrderSerializer(order)
        return Response({
            'order': serializer.data,
            'refund': {
                'refund_id': refund_result.get('refund_id'),
                'amount': refund_result.get('amount'),
                'status': refund_result.get('status')
            }
        })


class PaymentConfirmView(APIView):
    """
    POST: confirm payment success and update order
    """
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        payment_intent_id = request.data.get('payment_intent_id')
        
        if not payment_intent_id:
            return Response({'error': 'payment_intent_id required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            payment = Payment.objects.get(payment_intent_id=payment_intent_id)
        except Payment.DoesNotExist:
            return Response({'error': 'payment not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # confirm payment with stripe
        result = confirm_payment(payment_intent_id)
        
        if not result['success']:
            payment.status = 'failed'
            payment.failure_reason = result.get('error')
            payment.save()
            
            payment.order.status = 'payment_failed'
            payment.order.save()
            
            # publish failure to queue
            publish_payment_status(
                payment.order.id,
                'failed',
                payment.id,
                result.get('error')
            )
            
            return Response({'error': 'payment confirmation failed'}, status=status.HTTP_400_BAD_REQUEST)
        
        # update payment status
        payment.status = 'successful'
        payment.save()
        
        # update order status (stock reduction happens in webhook handler to avoid double processing)
        order = payment.order
        order.status = 'processing'
        order.save()
        
        # publish success to queue (webhook will handle inventory updates)
        publish_payment_status(order.id, 'successful', payment.id)
        
        return Response({
            'status': 'success',
            'order': OrderSerializer(order).data
        })


class ShippingOptionsView(APIView):
    """
    GET: get available shipping options
    """
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(get_shipping_options())


class StripePublishableKeyView(APIView):
    """
    GET: get stripe publishable key for frontend
    """
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'publishable_key': get_publishable_key()})


class StripeWebhookView(APIView):
    """
    POST: handle stripe webhook events
    """
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        payload = request.body
        sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')
        
        if not sig_header:
            return Response({'error': 'missing signature'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except ValueError:
            return Response({'error': 'invalid payload'}, status=status.HTTP_400_BAD_REQUEST)
        except stripe.error.SignatureVerificationError:
            return Response({'error': 'invalid signature'}, status=status.HTTP_400_BAD_REQUEST)
        
        # handle payment intent succeeded
        if event['type'] == 'payment_intent.succeeded':
            payment_intent = event['data']['object']
            payment_intent_id = payment_intent['id']
            
            try:
                payment = Payment.objects.get(payment_intent_id=payment_intent_id)
                
                # check if already processed (idempotency check)
                if payment.status == 'successful':
                    logger.info(f'payment {payment_intent_id} already processed, skipping')
                    return Response({'status': 'success'})
                
                # ONLY update payment status - business logic handled by consumer
                payment.status = 'successful'
                
                # Only update transaction_id if we have a valid charge ID (avoid empty string duplicates)
                charge_id = payment_intent.get('charges', {}).get('data', [{}])[0].get('id')
                if charge_id:
                    payment.transaction_id = charge_id
                
                payment.save()
                
                # Publish to message queue - consumer will handle stock reduction and notifications
                publish_payment_status(payment.order.id, 'successful', payment.id)
                
                logger.info(f'payment {payment_intent_id} marked successful, published to queue for processing')
                
            except Payment.DoesNotExist:
                logger.warning(f'received payment_intent.succeeded webhook for unknown payment_intent_id: {payment_intent_id}')
        
        # handle payment intent failed
        elif event['type'] == 'payment_intent.payment_failed':
            payment_intent = event['data']['object']
            payment_intent_id = payment_intent['id']
            error_message = payment_intent.get('last_payment_error', {}).get('message', 'unknown error')
            
            try:
                payment = Payment.objects.get(payment_intent_id=payment_intent_id)
                
                # ONLY update payment status - business logic handled by consumer
                payment.status = 'failed'
                payment.failure_reason = error_message
                payment.save()
                
                # Publish to message queue - consumer will handle order status update and notifications
                publish_payment_status(payment.order.id, 'failed', payment.id, error_message)
                
                logger.info(f'payment {payment_intent_id} marked failed, published to queue: {error_message}')
                
            except Payment.DoesNotExist:
                logger.warning(f'received payment_intent.payment_failed webhook for unknown payment_intent_id: {payment_intent_id}')
        
        return Response({'status': 'success'})
