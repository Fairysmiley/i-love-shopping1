from rest_framework import serializers
from .models import Cart, CartItem
from apps.products.serializers import ProductSerializer
from apps.products.models import Product


class CartItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.IntegerField(write_only=True)
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True, source='get_subtotal')

    class Meta:
        model = CartItem
        fields = ['id', 'product', 'product_id', 'quantity', 'subtotal', 'added_at']
        read_only_fields = ['id', 'added_at']

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("quantity must be greater than 0")
        return value

    def validate(self, data):
        product_id = data.get('product_id')
        quantity = data.get('quantity', 1)
        
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            raise serializers.ValidationError("product not found")
        
        if not product.is_active:
            raise serializers.ValidationError("product is not available")
        
        if quantity > product.stock_quantity:
            raise serializers.ValidationError(f"only {product.stock_quantity} items available in stock")
        
        return data


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True, source='get_total')
    item_count = serializers.IntegerField(read_only=True, source='get_item_count')
    recommended_products = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ['id', 'items', 'total', 'item_count', 'recommended_products', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_recommended_products(self, obj):
        if not obj.items.exists():
            return []
        
        # get categories from cart items
        categories = set(item.product.category for item in obj.items.all() if item.product.category)
        
        if not categories:
            return []
        
        # get products from same categories not in cart
        cart_product_ids = [item.product.id for item in obj.items.all()]
        recommended = Product.objects.filter(
            category__in=categories,
            is_active=True,
            stock_quantity__gt=0
        ).exclude(id__in=cart_product_ids)[:5]
        
        return ProductSerializer(recommended, many=True).data
