from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db import transaction
from django.db.models import F
from .models import Cart, CartItem
from .serializers import CartSerializer, CartItemSerializer
from apps.products.models import Product


def get_or_create_cart(request):
    """
    get or create cart for user or guest
    merge guest cart into user cart when user logs in
    """
    if request.user.is_authenticated:
        # get user cart
        user_cart, created = Cart.objects.get_or_create(user=request.user)
        
        # check if theres a guest cart to merge
        session_id = request.session.session_key
        if session_id:
            try:
                guest_cart = Cart.objects.get(session_id=session_id, user=None)
                
                # merge guest cart items into user cart
                for guest_item in guest_cart.items.all():
                    user_item, created = CartItem.objects.get_or_create(
                        cart=user_cart,
                        product=guest_item.product,
                        defaults={'quantity': guest_item.quantity}
                    )
                    if not created:
                        # add quantities if item already exists
                        new_quantity = user_item.quantity + guest_item.quantity
                        # check stock
                        if new_quantity > user_item.product.stock_quantity:
                            new_quantity = user_item.product.stock_quantity
                        user_item.quantity = new_quantity
                        user_item.save()
                
                # delete guest cart
                guest_cart.delete()
            except Cart.DoesNotExist:
                pass
        
        return user_cart
    else:
        # guest cart based on session
        session_id = request.session.session_key
        if not session_id:
            request.session.create()
            session_id = request.session.session_key
        
        cart, created = Cart.objects.get_or_create(session_id=session_id)
        
        # check if cart expired
        if cart.is_expired():
            cart.items.all().delete()
            cart.save()
        
        return cart


class CartView(APIView):
    """
    GET: get current cart
    """
    permission_classes = [AllowAny]

    def get(self, request):
        cart = get_or_create_cart(request)
        serializer = CartSerializer(cart)
        return Response(serializer.data)


class CartAddItemView(APIView):
    """
    POST: add item to cart
    """
    permission_classes = [AllowAny]

    def post(self, request):
        cart = get_or_create_cart(request)
        
        serializer = CartItemSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        product_id = serializer.validated_data['product_id']
        quantity = serializer.validated_data['quantity']
        
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return Response({'error': 'product not found'}, status=status.HTTP_404_NOT_FOUND)
        
        if not product.is_active:
            return Response({'error': 'product not available'}, status=status.HTTP_400_BAD_REQUEST)
        
        if quantity > product.stock_quantity:
            return Response({'error': f'only {product.stock_quantity} items available'}, status=status.HTTP_400_BAD_REQUEST)
        
        # check if item already in cart
        cart_item, created = CartItem.objects.get_or_create(
            cart=cart,
            product=product,
            defaults={'quantity': quantity}
        )
        
        if not created:
            # update quantity
            cart_item.quantity += quantity
            if cart_item.quantity > product.stock_quantity:
                return Response({'error': f'only {product.stock_quantity} items available'}, status=status.HTTP_400_BAD_REQUEST)
            cart_item.save()
        
        cart_serializer = CartSerializer(cart)
        return Response(cart_serializer.data, status=status.HTTP_200_OK)


class CartUpdateItemView(APIView):
    """
    PUT: update item quantity in cart
    """
    permission_classes = [AllowAny]

    def put(self, request, item_id):
        cart = get_or_create_cart(request)
        
        try:
            cart_item = CartItem.objects.get(id=item_id, cart=cart)
        except CartItem.DoesNotExist:
            return Response({'error': 'item not found in cart'}, status=status.HTTP_404_NOT_FOUND)
        
        quantity = request.data.get('quantity')
        try:
            quantity = int(quantity)
        except (ValueError, TypeError):
            return Response({'error': 'quantity must be a valid number'}, status=status.HTTP_400_BAD_REQUEST)
        
        if quantity <= 0:
            return Response({'error': 'quantity must be greater than 0'}, status=status.HTTP_400_BAD_REQUEST)
        
        if quantity > cart_item.product.stock_quantity:
            return Response({'error': f'only {cart_item.product.stock_quantity} items available'}, status=status.HTTP_400_BAD_REQUEST)
        
        cart_item.quantity = quantity
        cart_item.save()
        
        cart_serializer = CartSerializer(cart)
        return Response(cart_serializer.data)


class CartRemoveItemView(APIView):
    """
    DELETE: remove item from cart
    """
    permission_classes = [AllowAny]

    def delete(self, request, item_id):
        cart = get_or_create_cart(request)
        
        try:
            cart_item = CartItem.objects.get(id=item_id, cart=cart)
        except CartItem.DoesNotExist:
            return Response({'error': 'item not found in cart'}, status=status.HTTP_404_NOT_FOUND)
        
        cart_item.delete()
        
        cart_serializer = CartSerializer(cart)
        return Response(cart_serializer.data)


class CartClearView(APIView):
    """
    DELETE: clear all items from cart
    """
    permission_classes = [AllowAny]

    def delete(self, request):
        cart = get_or_create_cart(request)
        cart.items.all().delete()
        
        cart_serializer = CartSerializer(cart)
        return Response(cart_serializer.data)
