from django.db import models
from django.contrib.auth import get_user_model
from apps.products.models import Product
from django.core.exceptions import ValidationError
from .encryption import encrypt_data, decrypt_data
import json

User = get_user_model()


class Order(models.Model):
    STATUS_CHOICES = [
        ('pending_payment', 'Pending Payment'),
        ('payment_failed', 'Payment Failed'),
        ('pending_inventory', 'Pending Inventory'),
        ('processing', 'Processing'),
        ('shipped', 'Shipped'),
        ('delivered', 'Delivered'),
        ('cancelled', 'Cancelled'),
        ('cancelled_insufficient_stock', 'Cancelled - Insufficient Stock'),
        ('refunded', 'Refunded'),
    ]

    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    _guest_email = models.TextField(null=True, blank=True, db_column='guest_email')
    _phone = models.TextField(null=True, blank=True, db_column='phone')
    status = models.CharField(max_length=35, choices=STATUS_CHOICES, default='pending_payment', db_index=True)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    shipping_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    
    # Store encrypted address data wrapped in JSON format: {"encrypted": "..."}
    _billing_address = models.JSONField(db_column='billing_address')
    _shipping_address = models.JSONField(db_column='shipping_address')
    shipping_method = models.CharField(max_length=100, default='standard')
    
    @property
    def guest_email(self):
        """Decrypt and return guest email as string"""
        if self._guest_email:
            try:
                # Try to decrypt (new encrypted format)
                return decrypt_data(self._guest_email)
            except:
                # Fallback for plain text (old data)
                return self._guest_email
        return None
    
    @guest_email.setter
    def guest_email(self, value):
        """Encrypt and store guest email"""
        if value:
            self._guest_email = encrypt_data(value)
        else:
            self._guest_email = None
    
    @property
    def phone(self):
        """Decrypt and return phone as string"""
        if self._phone:
            try:
                # Try to decrypt (new encrypted format)
                return decrypt_data(self._phone)
            except:
                # Fallback for plain text (old data)
                return self._phone
        return None
    
    @phone.setter
    def phone(self, value):
        """Encrypt and store phone"""
        if value:
            self._phone = encrypt_data(value)
        else:
            self._phone = None
    
    @property
    def billing_address(self):
        """Decrypt and return billing address as dict"""
        if self._billing_address and isinstance(self._billing_address, dict) and 'encrypted' in self._billing_address:
            return decrypt_data(self._billing_address['encrypted'])
        return self._billing_address  # Fallback for non-encrypted data
    
    @billing_address.setter
    def billing_address(self, value):
        """Encrypt and store billing address"""
        if value:
            encrypted_str = encrypt_data(value)
            self._billing_address = {"encrypted": encrypted_str}
        else:
            self._billing_address = None
    
    @property
    def shipping_address(self):
        """Decrypt and return shipping address as dict"""
        if self._shipping_address and isinstance(self._shipping_address, dict) and 'encrypted' in self._shipping_address:
            return decrypt_data(self._shipping_address['encrypted'])
        return self._shipping_address  # Fallback for non-encrypted data
    
    @shipping_address.setter
    def shipping_address(self, value):
        """Encrypt and store shipping address"""
        if value:
            encrypted_str = encrypt_data(value)
            self._shipping_address = {"encrypted": encrypted_str}
        else:
            self._shipping_address = None
    
    tracking_number = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    notes = models.TextField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'orders'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['status']),
            models.Index(fields=['tracking_number']),
        ]

    def clean(self):
        if not self.user and not self.guest_email:
            raise ValidationError("either user or guest_email required")
        if self.total_amount <= 0:
            raise ValidationError("total_amount must be greater than 0")

    def can_cancel(self):
        return self.status in ['pending_payment', 'processing']

    def can_refund(self):
        return self.status in ['delivered', 'shipped']
    
    def stock_was_reduced(self):
        """
        Returns True if stock was actually reduced for this order.
        Stock is only reduced when payment succeeds AND order reaches 'processing' status.
        """
        return self.status in ['processing', 'shipped', 'delivered']

    def get_customer_email(self):
        return self.user.email if self.user else self.guest_email

    def __str__(self):
        return f"order #{self.id} - {self.status}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, related_name='items', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True)
    product_name = models.CharField(max_length=255)
    quantity = models.IntegerField()
    price_at_time = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = 'order_items'
        indexes = [
            models.Index(fields=['order']),
            models.Index(fields=['product']),
        ]

    def get_subtotal(self):
        return self.price_at_time * self.quantity

    def clean(self):
        if self.quantity <= 0:
            raise ValidationError("quantity must be greater than 0")
        if self.price_at_time <= 0:
            raise ValidationError("price must be greater than 0")

    def __str__(self):
        return f"{self.quantity}x {self.product_name}"


class Payment(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('successful', 'Successful'),
        ('failed', 'Failed'),
        ('refunded', 'Refunded'),
    ]

    PAYMENT_METHOD_CHOICES = [
        ('stripe', 'Stripe'),
        ('paypal', 'PayPal'),
    ]

    order = models.ForeignKey(Order, related_name='payments', on_delete=models.CASCADE)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    
    # external payment gateway identifiers
    transaction_id = models.CharField(max_length=255, unique=True, null=True, blank=True, db_index=True)
    payment_intent_id = models.CharField(max_length=255, null=True, blank=True)
    
    # error handling
    failure_reason = models.TextField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'payments'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['order']),
            models.Index(fields=['transaction_id']),
            models.Index(fields=['status']),
        ]

    def clean(self):
        if self.amount <= 0:
            raise ValidationError("amount must be greater than 0")

    def __str__(self):
        return f"payment {self.transaction_id} - {self.status}"
