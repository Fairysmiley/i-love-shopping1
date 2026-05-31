from decimal import Decimal

"""
shipping options and calculations
"""


SHIPPING_OPTIONS = {
    'standard': {
        'name': 'Standard Shipping',
        'price': Decimal('5.99'),
        'delivery_days': '5-7 business days',
        'description': 'Standard ground shipping'
    },
    'express': {
        'name': 'Express Shipping',
        'price': Decimal('15.99'),
        'delivery_days': '2-3 business days',
        'description': 'Expedited delivery'
    },
    'overnight': {
        'name': 'Overnight Shipping',
        'price': Decimal('29.99'),
        'delivery_days': '1 business day',
        'description': 'Next day delivery'
    }
}


def get_shipping_options():
    """
    get all available shipping options as array with id field
    """
    return [
        {
            'id': key,
            'name': value['name'],
            'price': str(value['price']),  # Convert Decimal to string for JSON serialization
            'delivery_days': value['delivery_days'],
            'description': value['description']
        }
        for key, value in SHIPPING_OPTIONS.items()
    ]


def get_shipping_price(shipping_method):
    """
    get price for specific shipping method
    """
    if shipping_method not in SHIPPING_OPTIONS:
        return Decimal('0.00')
    return SHIPPING_OPTIONS[shipping_method]['price']


def validate_shipping_method(shipping_method):
    """
    validate shipping method is valid
    """
    return shipping_method in SHIPPING_OPTIONS
