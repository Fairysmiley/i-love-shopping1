from rest_framework import serializers
import re
from .models import Order, OrderItem, Payment
from .shipping import validate_shipping_method
from apps.products.serializers import ProductSerializer


class OrderItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True, source='get_subtotal')

    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'product_name', 'quantity', 'price_at_time', 'subtotal']
        read_only_fields = ['id', 'product_name', 'price_at_time']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    customer_email = serializers.EmailField(read_only=True, source='get_customer_email')
    can_cancel = serializers.SerializerMethodField()
    can_refund = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'status', 'subtotal', 'shipping_cost', 'total_amount', 'customer_email',
            'billing_address', 'shipping_address', 'shipping_method',
            'tracking_number', 'notes', 'items',
            'can_cancel', 'can_refund',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'status', 'subtotal', 'shipping_cost', 'total_amount', 'created_at', 'updated_at']

    def validate_total_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("total amount must be greater than 0")
        return value

    def validate_billing_address(self, value):
        required_fields = ['address', 'city', 'postal_code', 'country']
        for field in required_fields:
            if field not in value:
                raise serializers.ValidationError(f"billing address missing required field: {field}")
        return value

    def validate_shipping_address(self, value):
        required_fields = ['address', 'city', 'postal_code', 'country']
        for field in required_fields:
            if field not in value:
                raise serializers.ValidationError(f"shipping address missing required field: {field}")
        return value
    
    def get_can_cancel(self, obj):
        return obj.can_cancel()
    
    def get_can_refund(self, obj):
        return obj.can_refund()


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = [
            'id', 'order', 'payment_method', 'status', 'amount',
            'transaction_id', 'payment_intent_id', 'failure_reason',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'status', 'created_at', 'updated_at']

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("amount must be greater than 0")
        return value


class OrderDetailSerializer(serializers.ModelSerializer):
    """Serializer for order detail view with payments included"""
    items = OrderItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    customer_email = serializers.EmailField(read_only=True, source='get_customer_email')
    can_cancel = serializers.SerializerMethodField()
    can_refund = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'status', 'subtotal', 'shipping_cost', 'total_amount', 'customer_email',
            'billing_address', 'shipping_address', 'shipping_method',
            'tracking_number', 'notes', 'items', 'payments',
            'can_cancel', 'can_refund',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'status', 'subtotal', 'shipping_cost', 'total_amount', 'created_at', 'updated_at']
    
    def get_can_cancel(self, obj):
        return obj.can_cancel()
    
    def get_can_refund(self, obj):
        return obj.can_refund()


class OrderCreateSerializer(serializers.Serializer):
    guest_email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=20)
    billing_address = serializers.JSONField()
    shipping_address = serializers.JSONField()
    shipping_method = serializers.ChoiceField(
        choices=['standard', 'express', 'overnight'],
        default='standard'
    )
    notes = serializers.CharField(required=False, allow_blank=True)
    payment_method = serializers.ChoiceField(choices=['stripe'])
    
    def validate_phone(self, value):
        """validate phone number format"""
        if value and value.strip():
            # Remove common separators
            cleaned = value.strip().replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
            # Check if it's digits and optional +
            if not cleaned.replace('+', '').isdigit():
                raise serializers.ValidationError("Phone number must contain only digits, spaces, dashes, or start with +")
            if len(cleaned) < 7 or len(cleaned) > 20:
                raise serializers.ValidationError("Phone number must be between 7 and 20 digits")
        return value

    def _validate_address_fields(self, value, address_type):
        """validate address has required fields and valid formats"""
        required_fields = ['address', 'city', 'postal_code', 'country']
        for field in required_fields:
            if field not in value or not value.get(field):
                raise serializers.ValidationError(f"{address_type} {field} is required")
        
        # validate address length
        address = value.get('address', '').strip()
        if len(address) < 5:
            raise serializers.ValidationError(f"{address_type} street address must be at least 5 characters")
        if len(address) > 255:
            raise serializers.ValidationError(f"{address_type} street address is too long (max 255 characters)")
        
        # validate city length
        city = value.get('city', '').strip()
        if len(city) < 2:
            raise serializers.ValidationError(f"{address_type} city must be at least 2 characters")
        if len(city) > 100:
            raise serializers.ValidationError(f"{address_type} city name is too long (max 100 characters)")
        
        # validate country code (ISO 3166-1 alpha-2)
        country = value.get('country', '').upper()
        valid_countries = ['FI', 'SE']  # Finland and Sweden
        if country not in valid_countries:
            raise serializers.ValidationError(f"{address_type} invalid country code. Must be FI (Finland) or SE (Sweden)")
        
        # validate postal code format
        postal_code = value.get('postal_code', '').strip()
        
        if country == 'FI':
            # Finland: exactly 5 digits
            if not re.match(r'^\d{5}$', postal_code):
                raise serializers.ValidationError(
                    f"{address_type} Finnish postal code must be exactly 5 digits (e.g., 00100)"
                )
        elif country == 'SE':
            # Sweden: 3 digits + optional space + 2 digits
            if not re.match(r'^\d{3}\s?\d{2}$', postal_code):
                raise serializers.ValidationError(
                    f"{address_type} Swedish postal code must be in format 123 45 or 12345"
                )
        
        # state is optional for FI/SE
        state = value.get('state', '')
        if state and len(state) > 100:
            raise serializers.ValidationError(f"{address_type} state/region is too long (max 100 characters)")
        
        return value

    def validate_billing_address(self, value):
        return self._validate_address_fields(value, "billing address")

    def validate_shipping_address(self, value):
        return self._validate_address_fields(value, "shipping address")
    
    def validate_shipping_method(self, value):
        if not validate_shipping_method(value):
            raise serializers.ValidationError(f"invalid shipping method: {value}")
        return value
