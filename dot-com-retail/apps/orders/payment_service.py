import stripe
from django.conf import settings
from decimal import Decimal

stripe.api_key = settings.STRIPE_SECRET_KEY


def create_payment_intent(amount, currency='usd', metadata=None):
    """
    create stripe payment intent
    amount should be in dollars
    """
    try:
        # stripe expects amount in cents
        amount_cents = int(amount * 100)
        
        intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency=currency,
            metadata=metadata or {},
            automatic_payment_methods={'enabled': True}
        )
        
        return {
            'success': True,
            'payment_intent_id': intent.id,
            'client_secret': intent.client_secret,
            'status': intent.status
        }
    except stripe.error.StripeError as e:
        return {
            'success': False,
            'error': str(e)
        }


def confirm_payment(payment_intent_id):
    """
    confirm payment intent status
    """
    try:
        intent = stripe.PaymentIntent.retrieve(payment_intent_id)
        return {
            'success': True,
            'status': intent.status,
            'amount': Decimal(intent.amount) / 100
        }
    except stripe.error.StripeError as e:
        return {
            'success': False,
            'error': str(e)
        }


def create_refund(payment_intent_id, amount=None):
    """
    create refund for payment
    amount in dollars, if not provided refunds full amount
    """
    try:
        refund_data = {'payment_intent': payment_intent_id}
        if amount:
            refund_data['amount'] = int(amount * 100)
        
        refund = stripe.Refund.create(**refund_data)
        
        return {
            'success': True,
            'refund_id': refund.id,
            'status': refund.status,
            'amount': Decimal(refund.amount) / 100
        }
    except stripe.error.StripeError as e:
        return {
            'success': False,
            'error': str(e)
        }


def get_publishable_key():
    """
    get stripe publishable key for frontend
    """
    return settings.STRIPE_PUBLISHABLE_KEY
