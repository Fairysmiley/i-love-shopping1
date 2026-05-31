# Category model
from django.db import models
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from django.db.models import Avg
from django.core.files.storage import default_storage
from django.conf import settings
from django.core.files.base import ContentFile
from PIL import Image
from io import BytesIO
import os
import uuid

User = get_user_model()


def upload_product_image(image_file, product_id=None):
    """
    Upload a product image file with multiple sizes (thumbnail, full-size)
    Returns dict with paths for both sizes
    """
    if not image_file:
        return None
    
    # Validate format
    ext = os.path.splitext(image_file.name)[1].lower()
    if ext not in ['.jpg', '.jpeg', '.png', '.webp']:
        raise ValidationError("Invalid image format. Only JPG, PNG, and WebP are allowed.")
    
    # Generate unique filename base
    filename_base = str(uuid.uuid4())
    
    # Read image - seek to start first
    image_file.seek(0)
    image_data = BytesIO(image_file.read())
    image = Image.open(image_data)
    
    # Convert RGBA to RGB if needed (for JPEG)
    if image.mode in ('RGBA', 'LA', 'P'):
        background = Image.new('RGB', image.size, (255, 255, 255))
        if image.mode == 'P':
            image = image.convert('RGBA')
        background.paste(image, mask=image.split()[-1] if image.mode in ('RGBA', 'LA') else None)
        image = background
    
    paths = {}
    
    # Save full-size image (max 1200x1200, preserve aspect ratio)
    full_image = image.copy()
    full_image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    full_buffer = BytesIO()
    full_image.save(full_buffer, format='JPEG', quality=85)
    full_buffer.seek(0)
    
    if product_id:
        full_path = f"products/{product_id}/{filename_base}_full.jpg"
    else:
        full_path = f"products/temp/{filename_base}_full.jpg"

    paths['full'] = default_storage.save(full_path, ContentFile(full_buffer.read()))
    
    # Save thumbnail (200x200, preserve aspect ratio)
    thumb_image = image.copy()
    thumb_image.thumbnail((200, 200), Image.Resampling.LANCZOS)
    thumb_buffer = BytesIO()
    thumb_image.save(thumb_buffer, format='JPEG', quality=85)
    thumb_buffer.seek(0)
    
    if product_id:
        thumb_path = f"products/{product_id}/{filename_base}_thumb.jpg"
    else:
        thumb_path = f"products/temp/{filename_base}_thumb.jpg"
    
    paths['thumbnail'] = default_storage.save(thumb_path, ContentFile(thumb_buffer.read()))
    
    return paths


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)
    icon = models.CharField(max_length=50, blank=True, null=True, help_text='Icon identifier (e.g., smartphone, laptop, camera)')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'categories'

    def __str__(self):
        return self.name


class Brand(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'brands'

    def __str__(self):
        return self.name


class Product(models.Model):
    name = models.CharField(max_length=255, db_index=True)
    description = models.TextField(blank=True, null=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, db_index=True)
    stock_quantity = models.IntegerField(default=0, db_index=True)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='products')
    brand = models.ForeignKey(Brand, on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    images = models.JSONField(blank=True, null=True)
    weight_kg = models.DecimalField(max_digits=8, decimal_places=2, blank=True, null=True)
    dimensions = models.JSONField(blank=True, null=True)  # {length, width, height} in cm
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    
    def clean(self):
        """Validation logic"""
        
        # Price must be positive
        if self.price is not None and float(self.price) <= 0:
            raise ValidationError({'price': 'Price must be greater than 0'})
        
        # Stock quantity must be non-negative
        if self.stock_quantity < 0:
            raise ValidationError({'stock_quantity': 'Stock quantity cannot be negative'})

        # Weight must be positive if provided
        if self.weight_kg is not None and float(self.weight_kg) <= 0:
            raise ValidationError({'weight_kg': 'Weight must be greater than 0'})
    
    def save(self, *args, **kwargs):
        """Override save to run validation"""
        self.full_clean()
        super().save(*args, **kwargs)
    
    @property
    def weight_lb(self):
        """Convert weight from kg to pounds"""
        if self.weight_kg:
            return round(float(self.weight_kg) * 2.20462, 2)
        return None
    
    @property
    def dimensions_metric(self):
        """Get dimensions in metric units. So the same as stored."""
        if self.dimensions:
            return self.dimensions
        return None
    
    @property
    def dimensions_imperial(self):
        """Convert dimensions to imperial units (inches)"""
        if self.dimensions and isinstance(self.dimensions, dict):
            imperial = {}
            for key, value in self.dimensions.items():
                if isinstance(value, (int, float)) and key in ['length', 'width', 'height']:
                    # Convert cm to inches
                    imperial[key] = round(float(value) * 0.393701, 2)
                else:
                    imperial[key] = value
            return imperial
        return None

    def get_average_rating(self):
        """Calculate average rating from reviews"""
        avg = self.reviews.aggregate(avg_rating=Avg('rating'))['avg_rating']
        return round(avg, 1) if avg else 0.0
    
    def get_review_count(self):
        """Get total number of reviews"""
        return self.reviews.count()

    def add_image(self, image_file):
        """Add an image to the product (with thumbnail)"""
        # Create new list to ensure Django detects the change
        current_images = list(self.images) if self.images else []
        
        image_paths = upload_product_image(image_file, self.id)
        if image_paths:
            current_images.append(image_paths)  # Store dict with 'full' and 'thumbnail' keys
        
        # Assign new list (Django will detect this as a change)
        self.images = current_images
        self.save(update_fields=['images'])
        return image_paths

    def get_primary_image(self):
        """Get the first (primary) image URL (full size)"""
        if self.images and len(self.images) > 0:
            media_url = getattr(settings, 'MEDIA_URL', '/media/')
            first_image = self.images[0]
            # Handle both old format (string) and new format (dict)
            if isinstance(first_image, dict):
                return f"{media_url}{first_image.get('full', first_image.get('thumbnail', ''))}"
            return f"{media_url}{first_image}"
        return None
    
    def get_primary_thumbnail(self):
        """Get the first (primary) thumbnail URL"""
        if self.images and len(self.images) > 0:
            media_url = getattr(settings, 'MEDIA_URL', '/media/')
            first_image = self.images[0]
            # Handle both old format (string) and new format (dict)
            if isinstance(first_image, dict):
                return f"{media_url}{first_image.get('thumbnail', first_image.get('full', ''))}"
            return f"{media_url}{first_image}"  # Fallback to full size for old data
        return None

    def get_all_image_urls(self):
        """Get all image URLs (full size)"""
        if not self.images:
            return []
        
        media_url = getattr(settings, 'MEDIA_URL', '/media/')
        urls = []
        for img in self.images:
            if isinstance(img, dict):
                urls.append(f"{media_url}{img.get('full', img.get('thumbnail', ''))}")
            else:
                urls.append(f"{media_url}{img}")
        return urls

    class Meta:
        db_table = 'products'

    def __str__(self):
        return self.name


class Review(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reviews')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='reviews')
    rating = models.IntegerField(choices=[(i, i) for i in range(1, 6)], help_text='Rating from 1 to 5 stars')
    review_text = models.TextField(blank=True, null=True)
    helpful_count = models.IntegerField(default=0, help_text='Number of users who found this review helpful')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def clean(self):
        if self.rating < 1 or int(self.rating) > 5:
            raise ValidationError({'rating': 'Rating must be between 1 and 5'})
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta:
        db_table = 'reviews'
        unique_together = ('user', 'product')  # One review per user per product
        ordering = ['-helpful_count', '-created_at']  # Sort by helpfulness, then newest

    def __str__(self):
        return f"{self.user.username} - {self.product.name} ({self.rating}★)"


class ReviewHelpful(models.Model):
    """Track which users found which reviews helpful (prevent duplicate votes)"""
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    review = models.ForeignKey(Review, on_delete=models.CASCADE, related_name='helpful_votes')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'review_helpful'
        unique_together = ('user', 'review')  # One vote per user per review
    
    def __str__(self):
        return f"{self.user.username} found review {self.review.id} helpful"




