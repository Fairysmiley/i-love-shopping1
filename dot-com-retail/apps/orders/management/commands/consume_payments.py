from django.core.management.base import BaseCommand
from apps.orders.message_queue import consume_payment_status
from apps.orders.models import Order, Payment
from apps.orders.payment_service import create_refund
from apps.products.models import Product
from apps.cart.models import Cart
from apps.users.models import UserProfile
from django.core.mail import send_mail
from django.conf import settings
from django.db import transaction
from django.db.models import F
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'consume payment status updates from rabbitmq'

    def handle(self, *args, **options):
        self.stdout.write('starting payment status consumer...')
        
        def process_payment_status(order_id, status, payment_id, error_message):
            try:
                order = Order.objects.get(id=order_id)
                
                if status == 'successful':
                    # Process successful payment with atomic stock reduction
                    stock_issues = []
                    
                    with transaction.atomic():
                        # Lock and reduce stock for each order item
                        for item in order.items.select_related('product').all():
                            if item.product:
                                # Lock the product row to prevent concurrent modifications
                                product = Product.objects.select_for_update().get(id=item.product.id)
                                
                                # Check if enough stock is available
                                if product.stock_quantity >= item.quantity:
                                    # Reduce stock atomically
                                    Product.objects.filter(id=product.id).update(
                                        stock_quantity=F('stock_quantity') - item.quantity
                                    )
                                    logger.info(f'reduced stock by {item.quantity} for product {product.id} in order {order.id}')
                                else:
                                    # Insufficient stock - mark for refund
                                    stock_issues.append({
                                        'product_name': item.product_name,
                                        'requested': item.quantity,
                                        'available': product.stock_quantity
                                    })
                                    logger.warning(f'insufficient stock for product {item.product.id} in order {order.id}: requested {item.quantity}, available {product.stock_quantity}')
                    
                    # Handle insufficient stock - initiate refund
                    if stock_issues:
                        order.status = 'cancelled_insufficient_stock'
                        stock_issues_text = ', '.join([
                            f"{issue['product_name']} (requested: {issue['requested']}, available: {issue['available']})"
                            for issue in stock_issues
                        ])
                        order.notes = f"Items out of stock: {stock_issues_text}"
                        order.save()
                        
                        # Initiate Stripe refund
                        try:
                            payment = Payment.objects.get(id=payment_id)
                            refund_result = create_refund(payment.payment_intent_id, None)
                            
                            if refund_result.get('success'):
                                logger.info(f'initiated refund for order {order.id} due to insufficient stock')
                                order.notes += f"\nRefund initiated: {refund_result.get('refund_id')}"
                                order.save()
                                
                                # Send refund notification email
                                frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
                                refund_message = f"""Order #{order.id} Cancelled - Refund Issued

We apologize, but we were unable to fulfill your order due to insufficient stock for the following items:
{stock_issues_text}

A full refund of ${order.total_amount} has been automatically processed to your original payment method.
Refund ID: {refund_result.get('refund_id')}

The refund should appear in your account within 5-10 business days, depending on your payment provider.

We sincerely apologize for any inconvenience. If you have any questions, please contact our support team.

You can browse our available products at: {frontend_url}/products
"""
                                
                                send_mail(
                                    subject=f'Order #{order.id} Cancelled - Refund Issued',
                                    message=refund_message,
                                    from_email=settings.DEFAULT_FROM_EMAIL,
                                    recipient_list=[order.get_customer_email()],
                                    fail_silently=True
                                )
                            else:
                                logger.error(f'failed to initiate refund for order {order.id}: {refund_result.get("error")}')
                                order.notes += f"\nRefund failed: {refund_result.get('error')} - manual refund required"
                                order.save()
                        except Exception as e:
                            logger.error(f'error initiating refund for order {order.id}: {str(e)}')
                            order.notes += f"\nRefund error: {str(e)} - manual refund required"
                            order.save()
                        
                        return  # Exit early, don't send success email
                    
                    # All stock successfully reduced - order can proceed
                    order.status = 'processing'
                    order.save()
                    
                    # Clear cart after successful payment (for authenticated users)
                    if order.user:
                        try:
                            cart = Cart.objects.get(user=order.user)
                            cart.items.all().delete()
                            logger.info(f'cleared cart for user {order.user.id} after order {order.id}')
                        except Cart.DoesNotExist:
                            pass
                    
                    # Update user profile with shipping address for future orders
                    if order.user:
                        shipping_addr = order.shipping_address
                        if shipping_addr:
                            UserProfile.objects.update_or_create(
                                user=order.user,
                                defaults={
                                    'phone': order.phone or '',
                                    'address': shipping_addr.get('address', ''),
                                    'city': shipping_addr.get('city', ''),
                                    'state': shipping_addr.get('state', ''),
                                    'postal_code': shipping_addr.get('postal_code', ''),
                                    'country': shipping_addr.get('country', 'FI'),
                                }
                            )
                    
                    # build detailed email with order summary
                    items_text = "\n".join([
                        f"  • {item.product_name} x{item.quantity} @ ${item.price_at_time} = ${float(item.quantity) * float(item.price_at_time):.2f}"
                        for item in order.items.all()
                    ])
                    
                    shipping_addr = order.shipping_address
                    addr_text = f"{shipping_addr.get('address', '')}\n{shipping_addr.get('city', '')}, {shipping_addr.get('postal_code', '')}\n{shipping_addr.get('country', '')}"
                    
                    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
                    
                    message = f"""Thank you for your order!

Your order #{order.id} has been confirmed and is being processed.

ORDER SUMMARY:
{items_text}

Subtotal: ${order.subtotal}
Shipping ({order.shipping_method}): ${order.shipping_cost}
-----------------------------------
Total: ${order.total_amount}

SHIPPING ADDRESS:
{addr_text}

You can track your order status at:
{frontend_url}/orders/{order.id}

Thank you for shopping with us!

If you have any questions, please contact our support team.
"""
                    
                    # send confirmation email
                    send_mail(
                        subject=f'Order #{order.id} Confirmed - Thank You!',
                        message=message,
                        from_email=settings.DEFAULT_FROM_EMAIL,
                        recipient_list=[order.get_customer_email()],
                        fail_silently=True
                    )
                    
                    logger.info(f'processed successful payment for order {order_id}')
                
                elif status == 'failed':
                    order.status = 'payment_failed'
                    order.save()
                    
                    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
                    
                    failure_message = f"""Payment Failed for Order #{order.id}

We're sorry, but your payment for order #{order.id} could not be processed.

Order Amount: ${order.total_amount}
Reason: {error_message or "Payment was declined or could not be processed"}

WHAT TO DO NEXT:
• Please check your payment method details
• Ensure you have sufficient funds available
• Try using a different payment method
• Contact your bank if you believe this is an error

You can retry payment by visiting:
{frontend_url}/checkout

If you continue to experience issues, please contact our support team.

Your cart has been preserved and you can complete checkout at any time.
"""
                    
                    # send failure email
                    send_mail(
                        subject=f'Payment Failed - Order #{order.id}',
                        message=failure_message,
                        from_email=settings.DEFAULT_FROM_EMAIL,
                        recipient_list=[order.get_customer_email()],
                        fail_silently=True
                    )
                    
                    logger.info(f'processed failed payment for order {order_id}')
                
            except Order.DoesNotExist:
                logger.error(f'order {order_id} not found')
            except Exception as e:
                logger.error(f'error processing payment status: {e}')
        
        try:
            consume_payment_status(process_payment_status)
        except KeyboardInterrupt:
            self.stdout.write('stopping consumer...')
