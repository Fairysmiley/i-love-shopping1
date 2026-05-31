from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from apps.products.models import Product, Category, Brand, Review
import json
import random
import requests
import io
from decimal import Decimal
import sys

User = get_user_model()


class Command(BaseCommand):
    help = 'Loads sample electronic products into the database for Dot-Com Retail'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Delete all existing products, categories and brands before loading sample data',
        )
        parser.add_argument(
            '--limit',
            type=int,
            help='Limit the number of products to create (for testing)',
            default=None
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Skip products with missing brands instead of failing',
        )
        parser.add_argument(
            '--with-sample-uploads',
            action='store_true',
            help='Download and upload actual sample images for some products (demonstrates upload functionality)',
        )

    def handle(self, *args, **options):
        start_time = timezone.now()
        
        if options['clear']:
            self.stdout.write(self.style.WARNING('Clearing existing product data...'))
            Product.objects.all().delete()
            Category.objects.all().delete()
            Brand.objects.all().delete()
            self.stdout.write(self.style.SUCCESS('Data cleared successfully'))

        self.stdout.write(self.style.NOTICE('Loading Electronics & Technology sample data...'))
        
        if options.get('with_sample_uploads'):
            self.stdout.write(self.style.NOTICE('Sample image upload feature enabled - will download and upload actual images for first 5 products'))
            self.stdout.write(self.style.WARNING('Note: This requires internet connection and may take longer'))
        
        with transaction.atomic():
            # Create categories
            categories = self.create_categories()
            self.stdout.write(self.style.SUCCESS(f'Created {len(categories)} categories'))
            
            # Create brands
            brands = self.create_brands()
            self.stdout.write(self.style.SUCCESS(f'Created {len(brands)} brands'))
            
            # Validate all required brands exist before creating products
            required_brands = self.get_required_brands()
            missing_brands = [brand for brand in required_brands if brand not in brands]
            
            if missing_brands and not options['force']:
                self.stdout.write(self.style.ERROR(f'ERROR: Missing brands: {", ".join(missing_brands)}'))
                self.stdout.write(self.style.ERROR('Please add these brands to create_brands() or use --force to skip products with missing brands'))
                sys.exit(1)
                
            # Create products
            product_count = self.create_products(categories, brands, limit=options['limit'], force=options['force'], options=options)
            
            # Create sample users and reviews
            review_count = self.create_sample_reviews()
            
            # Display summary
            total_brands = Brand.objects.count()
            total_categories = Category.objects.count()
            total_products = Product.objects.count()
            
            # Calculate price ranges
            if total_products > 0:
                min_price = Product.objects.order_by('price').first().price
                max_price = Product.objects.order_by('-price').first().price
                avg_price = sum(p.price for p in Product.objects.all()) / total_products
            else:
                min_price = max_price = avg_price = 0
                
            # Count by category
            category_counts = {}
            for cat_name, cat_obj in categories.items():
                category_counts[cat_name] = Product.objects.filter(category=cat_obj).count()
            
            # Count in stock vs out of stock
            in_stock = Product.objects.filter(stock_quantity__gt=0).count()
            out_of_stock = Product.objects.filter(stock_quantity=0).count()
            
        elapsed_time = timezone.now() - start_time
            
        # Print detailed summary
        total_reviews = Review.objects.count()
        self.stdout.write('\n' + self.style.SUCCESS(f'Success! Database now has:'))
        self.stdout.write(f'   {total_brands} brands')
        self.stdout.write(f'   {total_categories} categories')
        self.stdout.write(f'   {total_products} products ({product_count} newly created)')
        self.stdout.write(f'   {total_reviews} reviews ({review_count} newly created)')
        self.stdout.write(f'   Price range: ${min_price:.2f} - ${max_price:.2f} (avg: ${avg_price:.2f})')
        self.stdout.write(f'   Stock: {in_stock} in stock, {out_of_stock} out of stock')
        
        self.stdout.write('\n' + self.style.NOTICE('Category breakdown:'))
        for cat_name, count in sorted(category_counts.items(), key=lambda x: x[1], reverse=True):
            self.stdout.write(f'   {cat_name}: {count} products')
            
        if options.get('with_sample_uploads'):
            self.stdout.write('\n' + self.style.SUCCESS('Image Upload Feature Demonstration:'))
            self.stdout.write('   First 5 products have actual uploaded images (not just placeholder URLs)')
            self.stdout.write('   You can test the image upload API at: POST /products/{id}/upload-image/')
            self.stdout.write('   Admin access required - use the superuser account you created')
            
        self.stdout.write(f'\nCompleted in {elapsed_time.total_seconds():.2f} seconds')

    def get_required_brands(self):
        """Get a list of all unique brands used by the product data"""
        products_data = self.get_products_data()
        return set(product['brand'] for product in products_data)

    def create_categories(self):
        """Create electronics product categories"""
        categories_data = [
            {
                'name': 'Smartphones',
                'description': 'Mobile phones with advanced features including apps, internet access and touchscreens',
                'icon': 'smartphone'
            },
            {
                'name': 'Laptops & Tablets',
                'description': 'Portable computers, tablets and 2-in-1 devices for work, education and entertainment',
                'icon': 'laptop'
            },
            {
                'name': 'Audio',
                'description': 'Headphones, earbuds, speakers and other audio equipment',
                'icon': 'headphones'
            },
            {
                'name': 'Gaming',
                'description': 'Consoles, accessories and gaming peripherals',
                'icon': 'gamepad'
            },
            {
                'name': 'Smart Home',
                'description': 'Connected devices for home automation and monitoring',
                'icon': 'home'
            },
            {
                'name': 'Wearables',
                'description': 'Smartwatches, fitness trackers and other wearable technology',
                'icon': 'watch'
            },
            {
                'name': 'Cameras & Drones',
                'description': 'Digital cameras, action cameras, drones and photography equipment',
                'icon': 'camera'
            },
            {
                'name': 'Accessories',
                'description': 'Cables, chargers, cases and other electronic accessories',
                'icon': 'package'
            },
        ]
        
        category_objects = {}
        for cat_data in categories_data:
            category, created = Category.objects.get_or_create(
                name=cat_data['name'],
                defaults={
                    'description': cat_data['description'],
                    'icon': cat_data.get('icon', 'package')  # Default to 'package' icon
                }
            )
            category_objects[cat_data['name']] = category
            if created:
                self.stdout.write(f"Created category: {category.name}")
            
        return category_objects

    def create_brands(self):
        """Create popular electronics brands"""
        brands_data = [
            {'name': 'Apple', 'description': 'American technology company known for iPhones, Macs and iPads'},
            {'name': 'Samsung', 'description': 'South Korean electronics giant making smartphones, TVs and appliances'},
            {'name': 'Sony', 'description': 'Japanese multinational known for PlayStation, cameras and audio equipment'},
            {'name': 'Google', 'description': 'Technology company offering Pixel phones, Nest devices and online services'},
            {'name': 'Microsoft', 'description': 'American tech company known for Windows, Surface devices and Xbox'},
            {'name': 'Dell', 'description': 'American computer technology company'},
            {'name': 'HP', 'description': 'Information technology company producing computers, printers and related supplies'},
            {'name': 'Logitech', 'description': 'Swiss manufacturer of computer peripherals and software'},
            {'name': 'Bose', 'description': 'American audio equipment company'},
            {'name': 'Canon', 'description': 'Japanese multinational specializing in optical and imaging products'},
            {'name': 'Nikon', 'description': 'Japanese multinational specializing in optics and imaging products'},
            {'name': 'LG', 'description': 'South Korean electronics company'},
            {'name': 'Lenovo', 'description': 'Chinese multinational technology company'},
            {'name': 'ASUS', 'description': 'Taiwanese multinational computer and phone hardware company'},
            {'name': 'Razer', 'description': 'Global gaming hardware manufacturing company'},
            {'name': 'JBL', 'description': 'American audio electronics company'},
            {'name': 'Nintendo', 'description': 'Japanese multinational video game company'},
            {'name': 'Amazon', 'description': 'American tech company known for Echo and Kindle devices'},
            {'name': 'Fitbit', 'description': 'American consumer electronics company'},
            {'name': 'Garmin', 'description': 'American GPS and wearable technology company'},
            {'name': 'GoPro', 'description': 'American action camera and mobile app company'},
            {'name': 'Xiaomi', 'description': 'Chinese electronics company'},
            {'name': 'OnePlus', 'description': 'Chinese smartphone manufacturer'},
            {'name': 'Sennheiser', 'description': 'German audio company specializing in headphones and microphones'},
            {'name': 'Audio-Technica', 'description': 'Japanese audio equipment manufacturing company'},
            {'name': 'Anker', 'description': 'Chinese electronics company focusing on charging technology and accessories'},
            {'name': 'Belkin', 'description': 'American manufacturer of consumer electronics and accessories'},
            {'name': 'Western Digital', 'description': 'American computer hard disk drive manufacturer'},
            {'name': 'SteelSeries', 'description': 'Danish manufacturer of gaming peripherals'},
            {'name': 'HyperX', 'description': 'Gaming division of Kingston Technology Company'},
            # Adding missing brands that are referenced in products
            {'name': 'Philips', 'description': 'Dutch technology company focusing on healthcare, lighting and consumer electronics'},
            {'name': 'Oura', 'description': 'Finnish health technology company specializing in smart rings'},
            {'name': 'DJI', 'description': 'Chinese technology company manufacturing drones and camera equipment'},
            {'name': 'Corsair', 'description': 'American computer peripherals and hardware company'},
            {'name': 'Jabra', 'description': 'Danish company specializing in audio equipment and video conferencing systems'}
        ]
        
        brand_objects = {}
        for brand_data in brands_data:
            brand, created = Brand.objects.get_or_create(
                name=brand_data['name'], 
                defaults={
                    'description': brand_data['description']
                }
            )
            brand_objects[brand_data['name']] = brand
            if created:
                self.stdout.write(f"Created brand: {brand.name}")
            
        return brand_objects

    def generate_placeholder_images(self, product_name, category_name, count=3):
        """
        Generate realistic placeholder image URLs based on product name
        Uses product name as seed for consistent images across runs
        """
        # Use product name as seed for consistent image generation
        seed = abs(hash(product_name)) % 10000
        
        # Generate image URLs using seed for consistency
        images = []
        for i in range(count):
            # Use Lorem Picsum with seed for consistent image generation
            img_seed = seed + i
            images.append(f"https://picsum.photos/seed/{img_seed}/800/600")
            
        return images

    def download_and_upload_sample_images(self, product, count=2):
        """
        Download sample images and upload them using the upload functionality.
        This demonstrates the image upload feature.
        """
        try:
            # Use product name as seed for consistent image generation
            seed = abs(hash(product.name)) % 10000
            uploaded_paths = []
            
            for i in range(count):
                try:
                    # Generate a Lorem Picsum URL with seed for consistency
                    img_seed = seed + i
                    img_url = f"https://picsum.photos/seed/{img_seed}/800/600.jpg"
                    
                    # Download the image
                    response = requests.get(img_url, timeout=10)
                    if response.status_code == 200:
                        # Create a file-like object from the downloaded content
                        image_file = SimpleUploadedFile(
                            name=f"{product.name.lower().replace(' ', '_')}_sample_{i+1}.jpg",
                            content=response.content,
                            content_type='image/jpeg'
                        )
                        
                        # Use the product's add_image method (tests the actual upload functionality)
                        image_path = product.add_image(image_file)
                        uploaded_paths.append(image_path)
                        
                except Exception as e:
                    self.stdout.write(
                        self.style.WARNING(f'   Failed to download/upload image {i+1} for {product.name}: {str(e)}')
                    )
                    continue
            
            if uploaded_paths:
                self.stdout.write(
                    self.style.SUCCESS(f'   Uploaded {len(uploaded_paths)} sample images for {product.name}')
                )
            
            return uploaded_paths
            
        except Exception as e:
            self.stdout.write(
                self.style.WARNING(f'   Failed to upload sample images for {product.name}: {str(e)}')
            )
            return []

    def parse_dimensions(self, dimensions_str):
        """
        Convert dimensions string to JSON format with both metric and imperial units
        Format: "15.6 x 8.2 x 1.2" (length x width x height in cm)
        """
        try:
            # Format: "15.6 x 8.2 x 1.2"
            dims = dimensions_str.split('x')
            if len(dims) == 3:
                # Convert to float and round to 2 decimal places
                length_cm = round(float(dims[0].strip()), 2)
                width_cm = round(float(dims[1].strip()), 2)
                height_cm = round(float(dims[2].strip()), 2)
                
                # Calculate imperial (inches) - 1 cm = 0.3937 inches
                length_in = round(length_cm * 0.3937, 2)
                width_in = round(width_cm * 0.3937, 2)
                height_in = round(height_cm * 0.3937, 2)
                
                return {
                    # Metric units
                    'length_cm': length_cm,
                    'width_cm': width_cm,
                    'height_cm': height_cm,
                    'unit_metric': 'cm',
                    
                    # Imperial units
                    'length_in': length_in,
                    'width_in': width_in,
                    'height_in': height_in,
                    'unit_imperial': 'in',
                    
                    # Original dimensions string
                    'dimensions_text': dimensions_str
                }
            return None
        except (ValueError, IndexError) as e:
            self.stdout.write(self.style.WARNING(f"Error parsing dimensions '{dimensions_str}': {str(e)}"))
            return None

    def get_products_data(self):
        """Returns the complete product data array - separated to make validation easier"""
        return [
            # Smartphones
            {
                'name': 'iPhone 15 Pro Max',
                'brand': 'Apple',
                'category': 'Smartphones',
                'description': 'The most advanced iPhone ever with A17 Pro chip, titanium design, and 48MP camera system with 5x optical zoom.',
                'price': 1199.99,
                'stock_quantity': 50,
                'weight_kg': 0.221,
                'dimensions_cm': '15.9 x 7.7 x 0.8',
                'is_active': True
            },
            {
                'name': 'Samsung Galaxy S24 Ultra',
                'brand': 'Samsung',
                'category': 'Smartphones',
                'description': 'Premium Android flagship with 6.8" Dynamic AMOLED display, S Pen support, 200MP camera, and powerful Snapdragon processor.',
                'price': 1299.99,
                'stock_quantity': 45,
                'weight_kg': 0.232,
                'dimensions_cm': '16.2 x 7.9 x 0.9',
                'is_active': True
            },
            {
                'name': 'Google Pixel 8',
                'brand': 'Google',
                'category': 'Smartphones',
                'description': 'Experience the best of Google with cutting-edge AI features, exceptional camera quality, and clean Android experience.',
                'price': 799.99,
                'stock_quantity': 30,
                'weight_kg': 0.187,
                'dimensions_cm': '15.0 x 7.1 x 0.9',
                'is_active': True
            },
            {
                'name': 'OnePlus 12',
                'brand': 'OnePlus',
                'category': 'Smartphones',
                'description': 'Flagship killer with Snapdragon 8 Gen 3, 50MP Hasselblad camera system, and 100W fast charging.',
                'price': 899.99,
                'stock_quantity': 25,
                'weight_kg': 0.198,
                'dimensions_cm': '16.3 x 7.5 x 0.9',
                'is_active': True
            },
            {
                'name': 'Xiaomi 14 Pro',
                'brand': 'Xiaomi',
                'category': 'Smartphones',
                'description': 'Premium smartphone with Leica optics, vibrant AMOLED display, and powerful performance.',
                'price': 949.99,
                'stock_quantity': 20,
                'weight_kg': 0.209,
                'dimensions_cm': '15.5 x 7.4 x 0.8',
                'is_active': True
            },
            
            # Laptops & Tablets
            {
                'name': 'MacBook Air M3 15-inch',
                'brand': 'Apple',
                'category': 'Laptops & Tablets',
                'description': 'Ultra-thin laptop with the powerful M3 chip, 15-inch Retina display, and all-day battery life.',
                'price': 1299.99,
                'stock_quantity': 30,
                'weight_kg': 1.51,
                'dimensions_cm': '34.0 x 23.7 x 1.1',
                'is_active': True
            },
            {
                'name': 'Dell XPS 13 Plus',
                'brand': 'Dell',
                'category': 'Laptops & Tablets',
                'description': 'Premium Windows laptop with InfinityEdge display, 13th Gen Intel processors, and sleek design.',
                'price': 1399.99,
                'stock_quantity': 20,
                'weight_kg': 1.24,
                'dimensions_cm': '29.5 x 19.9 x 1.5',
                'is_active': True
            },
            {
                'name': 'HP Spectre x360 14',
                'brand': 'HP',
                'category': 'Laptops & Tablets',
                'description': 'Convertible 2-in-1 laptop with OLED display, Intel Evo platform, and stylus support.',
                'price': 1449.99,
                'stock_quantity': 15,
                'weight_kg': 1.34,
                'dimensions_cm': '29.8 x 22.0 x 1.7',
                'is_active': True
            },
            {
                'name': 'ASUS ROG Zephyrus G16',
                'brand': 'ASUS',
                'category': 'Laptops & Tablets',
                'description': 'Gaming laptop with RTX 4070 graphics, Intel Core Ultra processor, and 240Hz display.',
                'price': 1899.99,
                'stock_quantity': 10,
                'weight_kg': 1.99,
                'dimensions_cm': '35.4 x 24.6 x 1.9',
                'is_active': True
            },
            {
                'name': 'Lenovo ThinkPad X1 Carbon Gen 11',
                'brand': 'Lenovo',
                'category': 'Laptops & Tablets',
                'description': 'Business laptop with lightweight design, Intel vPro, and enhanced security features.',
                'price': 1649.99,
                'stock_quantity': 18,
                'weight_kg': 1.12,
                'dimensions_cm': '31.5 x 22.2 x 1.5',
                'is_active': True
            },
            
            # Audio
            {
                'name': 'Sony WH-1000XM5',
                'brand': 'Sony',
                'category': 'Audio',
                'description': 'Industry-leading noise cancelling wireless headphones with exceptional sound quality and 30-hour battery life.',
                'price': 399.99,
                'stock_quantity': 40,
                'weight_kg': 0.25,
                'dimensions_cm': '19.3 x 16.5 x 8.5',
                'is_active': True
            },
            {
                'name': 'Bose QuietComfort Ultra',
                'brand': 'Bose',
                'category': 'Audio',
                'description': 'Premium wireless headphones with spatial audio and adjustable noise cancellation.',
                'price': 429.99,
                'stock_quantity': 25,
                'weight_kg': 0.27,
                'dimensions_cm': '18.5 x 15.9 x 7.9',
                'is_active': True
            },
            {
                'name': 'Audio-Technica ATH-M50xBT2',
                'brand': 'Audio-Technica',
                'category': 'Audio',
                'description': 'Wireless over-ear headphones with studio-quality sound and exceptional clarity.',
                'price': 199.99,
                'stock_quantity': 30,
                'weight_kg': 0.31,
                'dimensions_cm': '20.1 x 17.8 x 9.0',
                'is_active': True
            },
            {
                'name': 'JBL Charge 5',
                'brand': 'JBL',
                'category': 'Audio',
                'description': 'Portable Bluetooth speaker with powerful sound, waterproof design, and 20 hours of playtime.',
                'price': 179.99,
                'stock_quantity': 35,
                'weight_kg': 0.96,
                'dimensions_cm': '22.3 x 9.7 x 9.4',
                'is_active': True
            },
            {
                'name': 'Sennheiser HD 660S2',
                'brand': 'Sennheiser',
                'category': 'Audio',
                'description': 'Open-back audiophile headphones with exceptional detail and improved bass response.',
                'price': 599.99,
                'stock_quantity': 12,
                'weight_kg': 0.26,
                'dimensions_cm': '18.4 x 15.6 x 10.2',
                'is_active': True
            },
            {
                'name': 'Jabra Elite 10',
                'brand': 'Jabra',
                'category': 'Audio',
                'description': 'Premium true wireless earbuds with Dolby Atmos, adaptive ANC, and comfortable fit.',
                'price': 249.99,
                'stock_quantity': 22,
                'weight_kg': 0.006,
                'dimensions_cm': '2.1 x 1.9 x 2.3',
                'is_active': True
            },
            
            # Gaming
            {
                'name': 'PlayStation 5',
                'brand': 'Sony',
                'category': 'Gaming',
                'description': 'Next-generation gaming console with lightning-fast loading, haptic feedback controller, and immersive 3D audio.',
                'price': 499.99,
                'stock_quantity': 0,  # Out of stock
                'weight_kg': 3.9,
                'dimensions_cm': '39.0 x 10.4 x 26.0',
                'is_active': True
            },
            {
                'name': 'Xbox Series X',
                'brand': 'Microsoft',
                'category': 'Gaming',
                'description': 'Microsoft\'s most powerful console with 12 teraflops of processing power, 4K gaming at up to 120 FPS, and Quick Resume.',
                'price': 499.99,
                'stock_quantity': 5,
                'weight_kg': 4.45,
                'dimensions_cm': '30.1 x 15.1 x 15.1',
                'is_active': True
            },
            {
                'name': 'Nintendo Switch OLED',
                'brand': 'Nintendo',
                'category': 'Gaming',
                'description': 'Enhanced version of the popular Nintendo Switch with a vibrant 7-inch OLED screen and improved audio.',
                'price': 349.99,
                'stock_quantity': 15,
                'weight_kg': 0.42,
                'dimensions_cm': '24.2 x 10.2 x 1.4',
                'is_active': True
            },
            {
                'name': 'Logitech G Pro X Superlight 2',
                'brand': 'Logitech',
                'category': 'Gaming',
                'description': 'Ultra-lightweight wireless gaming mouse with HERO 2 sensor, delivering precise performance for competitive gaming.',
                'price': 159.99,
                'stock_quantity': 20,
                'weight_kg': 0.06,
                'dimensions_cm': '12.5 x 6.3 x 4.0',
                'is_active': True
            },
            {
                'name': 'Razer BlackWidow V4 Pro',
                'brand': 'Razer',
                'category': 'Gaming',
                'description': 'Premium mechanical gaming keyboard with customizable multi-function dial and 8 dedicated macro keys.',
                'price': 229.99,
                'stock_quantity': 15,
                'weight_kg': 1.2,
                'dimensions_cm': '44.7 x 15.4 x 3.5',
                'is_active': True
            },
            {
                'name': 'Corsair K70 RGB Pro',
                'brand': 'Corsair',
                'category': 'Gaming',
                'description': 'Tournament-grade gaming keyboard with Cherry MX switches, durable aluminum frame, and per-key RGB lighting.',
                'price': 169.99,
                'stock_quantity': 25,
                'weight_kg': 1.15,
                'dimensions_cm': '44.2 x 16.5 x 4.0',
                'is_active': True
            },
            
            # Smart Home
            {
                'name': 'Google Nest Hub Max',
                'brand': 'Google',
                'category': 'Smart Home',
                'description': 'Smart display with 10-inch HD screen, built-in Google Assistant, and Nest Cam for video calls and home monitoring.',
                'price': 229.99,
                'stock_quantity': 25,
                'weight_kg': 1.32,
                'dimensions_cm': '25.0 x 18.2 x 10.1',
                'is_active': True
            },
            {
                'name': 'Amazon Echo Show 10',
                'brand': 'Amazon',
                'category': 'Smart Home',
                'description': 'Smart display with 10.1-inch HD screen that moves with you, featuring Alexa and a 13MP camera.',
                'price': 249.99,
                'stock_quantity': 20,
                'weight_kg': 2.56,
                'dimensions_cm': '25.1 x 23.0 x 17.2',
                'is_active': True
            },
            {
                'name': 'Philips Hue Starter Kit',
                'brand': 'Philips',
                'category': 'Smart Home',
                'description': 'Smart lighting system with bridge and four color bulbs, controllable via app or voice assistants.',
                'price': 199.99,
                'stock_quantity': 30,
                'weight_kg': 0.69,
                'dimensions_cm': '11.5 x 8.8 x 5.4',
                'is_active': True
            },
            {
                'name': 'Ring Video Doorbell 4',
                'brand': 'Amazon',
                'category': 'Smart Home',
                'description': 'Smart doorbell with 1080p HD video, improved motion detection, and quick-release battery.',
                'price': 199.99,
                'stock_quantity': 35,
                'weight_kg': 0.24,
                'dimensions_cm': '12.8 x 6.2 x 2.8',
                'is_active': True
            },
            {
                'name': 'Nest Learning Thermostat',
                'brand': 'Google',
                'category': 'Smart Home',
                'description': 'Smart thermostat that learns your schedule and preferences to help save energy.',
                'price': 249.99,
                'stock_quantity': 18,
                'weight_kg': 0.22,
                'dimensions_cm': '8.4 x 8.4 x 3.2',
                'is_active': True
            },
            
            # Wearables
            {
                'name': 'Apple Watch Series 9',
                'brand': 'Apple',
                'category': 'Wearables',
                'description': 'Advanced health features, larger always-on Retina display, and new S9 chip for faster performance.',
                'price': 399.99,
                'stock_quantity': 40,
                'weight_kg': 0.042,
                'dimensions_cm': '4.5 x 3.8 x 1.1',
                'is_active': True
            },
            {
                'name': 'Samsung Galaxy Watch 6',
                'brand': 'Samsung',
                'category': 'Wearables',
                'description': 'Comprehensive health tracking, sleep coaching, and seamless integration with Galaxy smartphones.',
                'price': 299.99,
                'stock_quantity': 35,
                'weight_kg': 0.048,
                'dimensions_cm': '4.3 x 4.3 x 1.0',
                'is_active': True
            },
            {
                'name': 'Fitbit Sense 2',
                'brand': 'Fitbit',
                'category': 'Wearables',
                'description': 'Advanced health smartwatch with ECG app, EDA sensor for stress management, and 6+ day battery life.',
                'price': 299.99,
                'stock_quantity': 20,
                'weight_kg': 0.037,
                'dimensions_cm': '4.0 x 4.0 x 1.1',
                'is_active': True
            },
            {
                'name': 'Garmin Fenix 7',
                'brand': 'Garmin',
                'category': 'Wearables',
                'description': 'Premium multisport GPS watch with advanced training features, maps, and exceptional battery life.',
                'price': 699.99,
                'stock_quantity': 15,
                'weight_kg': 0.079,
                'dimensions_cm': '4.7 x 4.7 x 1.4',
                'is_active': True
            },
            {
                'name': 'Oura Ring Gen 3',
                'brand': 'Oura',
                'category': 'Wearables',
                'description': 'Sleek ring that tracks sleep, activity, and readiness with precise sensors and up to 7-day battery life.',
                'price': 299.99,
                'stock_quantity': 10,
                'weight_kg': 0.004,
                'dimensions_cm': '0.8 x 0.8 x 0.3',
                'is_active': True
            },
            
            # Cameras & Drones
            {
                'name': 'Sony Alpha a7 IV',
                'brand': 'Sony',
                'category': 'Cameras & Drones',
                'description': 'Full-frame mirrorless camera with 33MP sensor, 4K 60p video, and advanced autofocus system.',
                'price': 2499.99,
                'stock_quantity': 12,
                'weight_kg': 0.658,
                'dimensions_cm': '13.1 x 9.9 x 8.0',
                'is_active': True
            },
            {
                'name': 'Canon EOS R6 Mark II',
                'brand': 'Canon',
                'category': 'Cameras & Drones',
                'description': 'Versatile full-frame mirrorless with 24MP sensor, 6K RAW video, and in-body stabilization.',
                'price': 2499.99,
                'stock_quantity': 10,
                'weight_kg': 0.67,
                'dimensions_cm': '13.8 x 9.8 x 8.8',
                'is_active': True
            },
            {
                'name': 'GoPro HERO12 Black',
                'brand': 'GoPro',
                'category': 'Cameras & Drones',
                'description': 'Flagship action camera with 5.3K video, HyperSmooth 6.0 stabilization, and improved battery life.',
                'price': 399.99,
                'stock_quantity': 25,
                'weight_kg': 0.154,
                'dimensions_cm': '7.1 x 5.0 x 3.3',
                'is_active': True
            },
            {
                'name': 'Nikon Z8',
                'brand': 'Nikon',
                'category': 'Cameras & Drones',
                'description': 'Professional mirrorless camera with 45.7MP sensor, 8K video, and advanced AF system.',
                'price': 3999.99,
                'stock_quantity': 8,
                'weight_kg': 0.91,
                'dimensions_cm': '14.4 x 10.1 x 8.7',
                'is_active': True
            },
            {
                'name': 'DJI Mini 3 Pro',
                'brand': 'DJI',
                'category': 'Cameras & Drones',
                'description': 'Lightweight drone with 4K/60fps video, 48MP photos, and obstacle avoidance in a sub-249g package.',
                'price': 759.99,
                'stock_quantity': 15,
                'weight_kg': 0.249,
                'dimensions_cm': '14.5 x 9.0 x 6.2',
                'is_active': True
            },
            
            # Accessories
            {
                'name': 'Anker 736 Charger',
                'brand': 'Anker',
                'category': 'Accessories',
                'description': '100W GaN charger with 2 USB-C and 1 USB-A ports for fast charging multiple devices simultaneously.',
                'price': 79.99,
                'stock_quantity': 50,
                'weight_kg': 0.225,
                'dimensions_cm': '6.4 x 6.0 x 3.0',
                'is_active': True
            },
            {
                'name': 'Apple AirTag',
                'brand': 'Apple',
                'category': 'Accessories',
                'description': 'Precision tracking device that helps you find your belongings using the Find My app.',
                'price': 29.99,
                'stock_quantity': 60,
                'weight_kg': 0.011,
                'dimensions_cm': '3.2 x 3.2 x 0.8',
                'is_active': True
            },
            {
                'name': 'Samsung T7 Shield 2TB',
                'brand': 'Samsung',
                'category': 'Accessories',
                'description': 'Rugged portable SSD with 2TB capacity, fast transfer speeds, and durable design.',
                'price': 199.99,
                'stock_quantity': 30,
                'weight_kg': 0.098,
                'dimensions_cm': '8.8 x 5.9 x 1.3',
                'is_active': True
            },
            {
                'name': 'Belkin BoostCharge Pro',
                'brand': 'Belkin',
                'category': 'Accessories',
                'description': '3-in-1 wireless charging stand for iPhone, Apple Watch, and AirPods with fast charging.',
                'price': 149.99,
                'stock_quantity': 25,
                'weight_kg': 0.45,
                'dimensions_cm': '13.5 x 8.5 x 7.5',
                'is_active': True
            },
            {
                'name': 'USB-C to Lightning Cable',
                'brand': 'Apple',
                'category': 'Accessories',
                'description': 'Official 2m USB-C to Lightning cable for fast charging compatible iPhones and iPads.',
                'price': 19.99,
                'stock_quantity': 75,
                'weight_kg': 0.03,
                'dimensions_cm': '200.0 x 0.5 x 0.5',
                'is_active': True
            },
            
            # Laptops & Tablets
            {
                'name': 'iPad Pro 12.9-inch M2',
                'brand': 'Apple',
                'category': 'Laptops & Tablets',
                'description': 'Powerful tablet with M2 chip, Liquid Retina XDR display, and Apple Pencil hover support.',
                'price': 1099.99,
                'stock_quantity': 22,
                'weight_kg': 0.682,
                'dimensions_cm': '28.1 x 21.5 x 0.6',
                'is_active': True
            },
            {
                'name': 'Samsung Galaxy Tab S9 Ultra',
                'brand': 'Samsung',
                'category': 'Laptops & Tablets',
                'description': 'Premium Android tablet with 14.6" AMOLED display, S Pen included, and Snapdragon 8 Gen 2 processor.',
                'price': 1199.99,
                'stock_quantity': 18,
                'weight_kg': 0.732,
                'dimensions_cm': '32.6 x 20.8 x 0.5',
                'is_active': True
            },
            {
                'name': 'Microsoft Surface Pro 9',
                'brand': 'Microsoft',
                'category': 'Laptops & Tablets',
                'description': 'Versatile 2-in-1 with Windows 11, 13" PixelSense display, and all-day battery life.',
                'price': 999.99,
                'stock_quantity': 15,
                'weight_kg': 0.879,
                'dimensions_cm': '28.7 x 20.8 x 0.9',
                'is_active': True
            }
        ]

    def create_products(self, categories, brands, limit=None, force=False, options=None):
        """Create a variety of electronics products"""
        products_data = self.get_products_data()
        
        if limit:
            products_data = products_data[:limit]
            
        created_count = 0
        skipped_count = 0
        
        for idx, product_data in enumerate(products_data):
            try:
                # Get category - this should always exist
                category_name = product_data.pop('category')
                if category_name not in categories:
                    if force:
                        self.stdout.write(self.style.WARNING(f"Skipping product '{product_data['name']}' - category '{category_name}' not found"))
                        skipped_count += 1
                        continue
                    else:
                        raise KeyError(f"Category '{category_name}' not found")
                
                category = categories[category_name]
                
                # Get brand - might not exist if --force is used
                brand_name = product_data.pop('brand')
                if brand_name not in brands:
                    if force:
                        self.stdout.write(self.style.WARNING(f"Skipping product '{product_data['name']}' - brand '{brand_name}' not found"))
                        skipped_count += 1
                        continue
                    else:
                        raise KeyError(f"Brand '{brand_name}' not found")
                
                brand = brands[brand_name]
                
                # Process dimensions
                dimensions_str = product_data.pop('dimensions_cm')
                dimensions = self.parse_dimensions(dimensions_str)
                
                # Only generate placeholder images if NOT using sample uploads
                # This keeps products clean for image upload demonstration
                if not options.get('with_sample_uploads'):
                    images = []  # No images by default
                else:
                    # Generate placeholder images only when sample uploads are requested
                    images = self.generate_placeholder_images(
                        product_data['name'], 
                        category_name, 
                        count=random.randint(3, 5)
                    )
                
                # Calculate weight in pounds but add it to dimensions JSON instead of as a separate field
                weight_kg = product_data['weight_kg']
                weight_lb = round(Decimal(weight_kg * 2.20462), 2)
                
                if dimensions:
                    dimensions['weight_lb'] = float(weight_lb)
                
                # Round weight and price to 2 decimal places to avoid validation errors
                # BUT ensure weight is never rounded to zero (minimum 0.01)
                rounded_weight = round(Decimal(weight_kg), 2)
                product_data['weight_kg'] = max(rounded_weight, Decimal('0.01'))
                product_data['price'] = round(Decimal(product_data['price']), 2)
                
                # Remove weight_lb as it's not a field in the Product model
                if 'weight_lb' in product_data:
                    product_data.pop('weight_lb')
                
                # Create or update product
                product, created = Product.objects.get_or_create(
                    name=product_data['name'],
                    defaults={
                        **product_data,
                        'category': category,
                        'brand': brand,
                        'images': images,
                        'dimensions': dimensions
                    }
                )
                
                if created:
                    self.stdout.write(f"Created product: {product.name}")
                    created_count += 1
                    
                    # For the first 5 products, demonstrate actual image upload functionality
                    if options.get('with_sample_uploads') and created_count <= 5:
                        self.stdout.write(f"Uploading sample images for {product.name}...")
                        uploaded_images = self.download_and_upload_sample_images(product, count=2)
                        if uploaded_images:
                            # The add_image method already updated the product's images JSONField
                            pass
                
                # Show progress for large datasets
                if (idx + 1) % 10 == 0 and idx > 0:
                    self.stdout.write(f"Progress: {idx + 1}/{len(products_data)} products processed")
                
            except Exception as e:
                if force:
                    self.stdout.write(self.style.WARNING(f"Error creating product '{product_data.get('name', 'unknown')}': {str(e)}"))
                    skipped_count += 1
                else:
                    raise
                
        if skipped_count:
            self.stdout.write(self.style.WARNING(f"Skipped {skipped_count} products due to errors"))
            
        return created_count

    def create_sample_reviews(self):
        """Create sample users and reviews for products"""
        # Create some sample users for reviews
        sample_users = [
            {'username': 'reviewer1', 'email': 'reviewer1@example.com'},
            {'username': 'reviewer2', 'email': 'reviewer2@example.com'},
            {'username': 'reviewer3', 'email': 'reviewer3@example.com'},
            {'username': 'reviewer4', 'email': 'reviewer4@example.com'},
            {'username': 'reviewer5', 'email': 'reviewer5@example.com'},
        ]
        
        users = []
        for user_data in sample_users:
            user, created = User.objects.get_or_create(
                username=user_data['username'],
                defaults={'email': user_data['email']}
            )
            users.append(user)
        
        # Create reviews for random products
        products = list(Product.objects.all())
        review_count = 0
        
        for product in products:
            # Each product gets 0-4 reviews randomly
            num_reviews = random.randint(0, 4)
            selected_users = random.sample(users, min(num_reviews, len(users)))
            
            for user in selected_users:
                # Generate random rating (weighted toward higher ratings)
                rating_weights = [1, 2, 3, 5, 4]  # 4 and 5 stars more common
                rating = random.choices(range(1, 6), weights=rating_weights)[0]
                
                review, created = Review.objects.get_or_create(
                    user=user,
                    product=product,
                    defaults={'rating': rating}
                )
                if created:
                    review_count += 1
        
        return review_count