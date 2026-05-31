from django.test import TestCase
from apps.products.models import Product, Category, Brand
from .factories import ProductFactory, CategoryFactory, BrandFactory


class ProductModelTest(TestCase):
    
    def test_product_creation(self):
        product = ProductFactory()
        self.assertIsNotNone(product.id)
        self.assertTrue(product.is_active)

    def test_product_string_representation(self):
        product = ProductFactory(name='Test Product')
        self.assertEqual(str(product), 'Test Product')

    def test_category_string_representation(self):
        category = CategoryFactory(name='Test Category')
        self.assertEqual(str(category), 'Test Category')

    def test_brand_string_representation(self):
        brand = BrandFactory(name='Test Brand')
        self.assertEqual(str(brand), 'Test Brand')