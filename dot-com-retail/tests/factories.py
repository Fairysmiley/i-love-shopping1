import factory
from factory.django import DjangoModelFactory
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta

from apps.users.models import PasswordResetToken
from apps.products.models import Category, Brand, Product

User = get_user_model()


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User
    
    username = factory.Sequence(lambda n: f"testuser{n}")
    email = factory.Sequence(lambda n: f"test{n}@example.com")
    is_active = True
    is_staff = False
    is_superuser = False
    twofa_enabled = False
    token_version = 0
    
    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        """Handle password properly"""
        raw_password = kwargs.pop('password', 'testpass123')
        user = model_class.objects.create_user(*args, **kwargs, password=raw_password)
        return user


class CategoryFactory(DjangoModelFactory):
    class Meta:
        model = Category
    
    name = factory.Sequence(lambda n: f"Category {n}")
    description = "Test category description"


class BrandFactory(DjangoModelFactory):
    class Meta:
        model = Brand
    
    name = factory.Sequence(lambda n: f"Brand {n}")
    description = "Test brand description"


class ProductFactory(DjangoModelFactory):
    class Meta:
        model = Product
    
    name = factory.Sequence(lambda n: f"Product {n}")
    description = "Test product description"
    price = Decimal('99.99')
    stock_quantity = 10
    category = factory.SubFactory(CategoryFactory)
    brand = factory.SubFactory(BrandFactory)
    weight_kg = Decimal('1.00')
    is_active = True


class PasswordResetTokenFactory(DjangoModelFactory):
    class Meta:
        model = PasswordResetToken
    
    user = factory.SubFactory(UserFactory)
    token = factory.Sequence(lambda n: f"reset_token_{n}")
    expires_at = factory.LazyFunction(lambda: timezone.now() + timedelta(hours=24))
    used = False