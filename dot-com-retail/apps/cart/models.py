from django.db import models
from django.contrib.auth import get_user_model
from apps.products.models import Product
from django.utils import timezone
from datetime import timedelta
from django.core.exceptions import ValidationError

User = get_user_model()


class Cart(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, null=True, blank=True)
    session_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'carts'
        indexes = [
            models.Index(fields=['session_id']),
            models.Index(fields=['expires_at']),
        ]

    def save(self, *args, **kwargs):
        # guest carts expire after 7 days
        if not self.user and not self.expires_at:
            self.expires_at = timezone.now() + timedelta(days=7)
        super().save(*args, **kwargs)

    def get_total(self):
        return sum(item.get_subtotal() for item in self.items.all())

    def get_item_count(self):
        return sum(item.quantity for item in self.items.all())

    def is_expired(self):
        if self.expires_at:
            return timezone.now() > self.expires_at
        return False

    def __str__(self):
        if self.user:
            return f"cart for {self.user.email}"
        return f"guest cart {self.session_id}"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, related_name='items', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.IntegerField(default=1)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'cart_items'
        unique_together = ['cart', 'product']
        indexes = [
            models.Index(fields=['cart']),
            models.Index(fields=['product']),
        ]

    def get_subtotal(self):
        return self.product.price * self.quantity

    def clean(self):
        if self.quantity <= 0:
            raise ValidationError("quantity must be greater than 0")
        if self.product.stock_quantity < self.quantity:
            raise ValidationError(f"only {self.product.stock_quantity} items available in stock")

    def __str__(self):
        return f"{self.quantity}x {self.product.name}"
