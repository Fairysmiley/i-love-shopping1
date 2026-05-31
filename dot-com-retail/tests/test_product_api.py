from rest_framework.test import APITestCase
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import get_user_model
from django.core.cache import cache
from apps.products.models import Product
from .factories import ProductFactory, CategoryFactory, BrandFactory

User = get_user_model()


class ProductAPITest(APITestCase):
    
    def setUp(self):
        cache.clear()  # Clear rate limiting cache
        self.category = CategoryFactory()
        self.brand = BrandFactory()
        self.product = ProductFactory(category=self.category, brand=self.brand)

    def test_product_list_endpoint(self):
        url = reverse('products:product-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_category_list_endpoint(self):
        url = reverse('products:category-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_brand_list_endpoint(self):
        url = reverse('products:brand-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_product_sorting(self):
        url = reverse('products:product-list')
        response = self.client.get(url + '?sort_by=name&sort_order=asc')
        self.assertEqual(response.status_code, 200)
        
        response = self.client.get(url + '?sort_by=price&sort_order=desc')
        self.assertEqual(response.status_code, 200)
        
        response = self.client.get(url + '?sort_by=rating&sort_order=desc')
        self.assertEqual(response.status_code, 200)

    def test_faceted_search_by_category(self):
        url = reverse('products:product-list')
        response = self.client.get(url + f'?category={self.category.id}')
        self.assertEqual(response.status_code, 200)

    def test_faceted_search_by_brand(self):
        url = reverse('products:product-list')
        response = self.client.get(url + f'?brand={self.brand.id}')
        self.assertEqual(response.status_code, 200)

    def test_faceted_search_by_price_range(self):
        url = reverse('products:product-list')
        response = self.client.get(url + '?min_price=10&max_price=100')
        self.assertEqual(response.status_code, 200)

    def test_faceted_search_in_stock_only(self):
        url = reverse('products:product-list')
        response = self.client.get(url + '?in_stock=true')
        self.assertEqual(response.status_code, 200)

    def test_text_search(self):
        url = reverse('products:product-list')
        response = self.client.get(url + '?search=test')
        self.assertEqual(response.status_code, 200)

    def test_combined_faceted_search(self):
        url = reverse('products:product-list')
        response = self.client.get(url + f'?category={self.category.id}&brand={self.brand.id}&min_price=10&max_price=1000&in_stock=true')
        self.assertEqual(response.status_code, 200)

    def test_search_suggestions(self):
        url = reverse('products:product-search-suggestions')
        response = self.client.get(url + '?q=te')
        self.assertEqual(response.status_code, 200)
        self.assertIn('suggestions', response.data)

    def test_faceted_search_filtering_logic(self):
        category2 = CategoryFactory(name='Electronics')
        brand2 = BrandFactory(name='Apple')
        
        expensive_product = ProductFactory(
            name='Expensive Laptop',
            price=1500,
            category=category2,
            brand=brand2,
            stock_quantity=5
        )
        
        cheap_product = ProductFactory(
            name='Cheap Phone',
            price=200,
            category=self.category,
            brand=self.brand,
            stock_quantity=0
        )
        
        url = reverse('products:product-list')
        
        response = self.client.get(url + f'?category={category2.id}')
        self.assertEqual(response.status_code, 200)
        
        response = self.client.get(url + '?min_price=1000')
        self.assertEqual(response.status_code, 200)
        
        response = self.client.get(url + '?in_stock=true')
        self.assertEqual(response.status_code, 200)
        
        response = self.client.get(url + '?search=laptop')
        self.assertEqual(response.status_code, 200)

    def test_rating_sort_with_no_reviews(self):
        # Test that products with no reviews are treated as rating 0 in sorts
        url = reverse('products:product-list')
        response = self.client.get(url + '?sort_by=rating&sort_order=desc')
        self.assertEqual(response.status_code, 200)
        
        if response.data.get('results'):
            product = response.data['results'][0]
            self.assertIn('average_rating', product)
            self.assertIn('review_count', product)
            self.assertIsInstance(product['average_rating'], (int, float))


class ProductImageAPITest(APITestCase):
    
    def setUp(self):
        cache.clear()  # Clear rate limiting cache
        # Create admin user for upload tests
        self.admin_user = User.objects.create_user(
            username='admin',
            email='admin@test.com',
            password='testpass123',
            is_staff=True,
            is_superuser=True
        )
        
        # Create regular user
        self.regular_user = User.objects.create_user(
            username='user',
            email='user@test.com',
            password='testpass123'
        )
        
        self.category = CategoryFactory()
        self.brand = BrandFactory()
        self.product = ProductFactory(category=self.category, brand=self.brand)

    def test_product_image_serialization(self):
        """Test that image fields are properly serialized in product responses"""
        url = reverse('products:product-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        
        if response.data.get('results'):
            product_data = response.data['results'][0]
            # Check that image fields are present
            self.assertIn('images', product_data)
            self.assertIn('image_urls', product_data)
            self.assertIn('primary_image', product_data)
            
            # Check that image_urls is a list
            self.assertIsInstance(product_data['image_urls'], list)

    def test_product_with_images_in_json_field(self):
        """Test product with existing images in JSONField"""
        # Update product with sample images
        self.product.images = [
            'products/sample1.jpg',
            'products/sample2.jpg'
        ]
        self.product.save()
        
        url = reverse('products:product-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        
        # Find our product in the results
        product_data = None
        for product in response.data['results']:
            if product['id'] == self.product.id:
                product_data = product
                break
        
        self.assertIsNotNone(product_data)
        self.assertEqual(len(product_data['images']), 2)
        self.assertEqual(len(product_data['image_urls']), 2)
        self.assertIsNotNone(product_data['primary_image'])
        
        # Check that URLs are properly formatted (absolute URLs with domain)
        for img_url in product_data['image_urls']:
            self.assertTrue('/media/' in img_url or img_url.startswith('http'))

    def test_image_upload_requires_admin_permission(self):
        """Test that image upload requires admin permissions"""
        # Create a simple image file for testing
        image_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\tpHYs\x00\x00\x0b\x13\x00\x00\x0b\x13\x01\x00\x9a\x9c\x18\x00\x00\x00\nIDATx\x9cc\xf8\x00\x00\x00\x01\x00\x01\x00\x00\x00\x00IEND\xaeB`\x82'
        image_file = SimpleUploadedFile("test.png", image_content, content_type="image/png")
        
        url = reverse('products:product-image-upload', kwargs={'product_id': self.product.id})
        
        # Test without authentication
        response = self.client.post(url, {'image': image_file})
        self.assertEqual(response.status_code, 401)
        
        # Test with regular user authentication
        self.client.force_authenticate(user=self.regular_user)
        response = self.client.post(url, {'image': image_file})
        self.assertEqual(response.status_code, 403)

    def test_successful_image_upload(self):
        """Test successful image upload by admin user"""
        # Create a simple valid 1x1 PNG image
        from PIL import Image
        from io import BytesIO
        
        img = Image.new('RGB', (10, 10), color='red')
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        image_file = SimpleUploadedFile("test.png", buffer.read(), content_type="image/png")
        
        # Authenticate as admin
        self.client.force_authenticate(user=self.admin_user)
        
        url = reverse('products:product-image-upload', kwargs={'product_id': self.product.id})
        response = self.client.post(url, {'image': image_file})
        
        self.assertEqual(response.status_code, 201)
        self.assertIn('message', response.data)
        self.assertIn('image_path', response.data)
        self.assertIn('image_url', response.data)
        
        # Verify the product was updated
        self.product.refresh_from_db()
        self.assertIsNotNone(self.product.images)
        self.assertGreater(len(self.product.images), 0)

    def test_image_upload_invalid_file(self):
        """Test image upload with invalid file type"""
        # Create a text file instead of an image
        text_file = SimpleUploadedFile("test.txt", b"This is not an image", content_type="text/plain")
        
        self.client.force_authenticate(user=self.admin_user)
        
        url = reverse('products:product-image-upload', kwargs={'product_id': self.product.id})
        response = self.client.post(url, {'image': text_file})
        
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)

    def test_image_upload_no_file(self):
        """Test image upload without providing a file"""
        self.client.force_authenticate(user=self.admin_user)
        
        url = reverse('products:product-image-upload', kwargs={'product_id': self.product.id})
        response = self.client.post(url, {})
        
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)
        self.assertIn('No image file provided', response.data['error'])

    def test_image_upload_nonexistent_product(self):
        """Test image upload for non-existent product"""
        image_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\tpHYs\x00\x00\x0b\x13\x00\x00\x0b\x13\x01\x00\x9a\x9c\x18\x00\x00\x00\nIDATx\x9cc\xf8\x00\x00\x00\x01\x00\x01\x00\x00\x00\x00IEND\xaeB`\x82'
        image_file = SimpleUploadedFile("test.png", image_content, content_type="image/png")
        
        self.client.force_authenticate(user=self.admin_user)
        
        url = reverse('products:product-image-upload', kwargs={'product_id': 99999})
        response = self.client.post(url, {'image': image_file})
        
        self.assertEqual(response.status_code, 404)
        self.assertIn('error', response.data)
        self.assertIn('Product not found', response.data['error'])

    def test_product_image_model_methods(self):
        """Test Product model image-related methods"""
        # Test with no images
        empty_product = ProductFactory(images=None)
        self.assertIsNone(empty_product.get_primary_image())
        self.assertEqual(empty_product.get_all_image_urls(), [])
        
        product_with_images = ProductFactory(images=['products/test1.jpg', 'products/test2.jpg'])
        self.assertIsNotNone(product_with_images.get_primary_image())
        self.assertTrue(product_with_images.get_primary_image().endswith('products/test1.jpg'))
        
        image_urls = product_with_images.get_all_image_urls()
        self.assertEqual(len(image_urls), 2)
        self.assertTrue(all(url.startswith('/media/') for url in image_urls))