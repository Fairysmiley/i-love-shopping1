from django.core.management.base import BaseCommand
from django.core.files.uploadedfile import SimpleUploadedFile
from apps.products.models import Product
import os


class Command(BaseCommand):
    help = 'Upload image(s) to a product'

    def add_arguments(self, parser):
        parser.add_argument(
            '--product-id',
            type=int,
            help='Product ID to upload image to',
        )
        parser.add_argument(
            '--image',
            type=str,
            help='Path to image file',
        )
        parser.add_argument(
            '--list',
            action='store_true',
            help='List all products',
        )

    def handle(self, *args, **options):
        if options['list']:
            self.list_products()
            return
            
        product_id = options['product_id']
        image_path = options['image']
        
        if not product_id or not image_path:
            self.stdout.write(self.style.ERROR('Both --product-id and --image are required'))
            self.stdout.write('Usage: python manage.py upload_product_image --product-id 1 --image path/to/image.jpg')
            self.stdout.write('       python manage.py upload_product_image --list')
            return
        
        try:
            product = Product.objects.get(id=product_id, is_active=True)
        except Product.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'Product {product_id} not found'))
            return
            
        if not os.path.exists(image_path):
            self.stdout.write(self.style.ERROR(f'File not found: {image_path}'))
            return
            
        ext = os.path.splitext(image_path)[1].lower()
        if ext not in ['.jpg', '.jpeg', '.png', '.webp']:
            self.stdout.write(self.style.ERROR(f'Invalid format: {ext}. Use JPG, PNG, or WebP'))
            return
        
        try:
            with open(image_path, 'rb') as f:
                content = f.read()
                
            content_types = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.webp': 'image/webp'
            }
            
            uploaded_file = SimpleUploadedFile(
                name=os.path.basename(image_path),
                content=content,
                content_type=content_types.get(ext, 'image/jpeg')
            )
            
            before_count = len(product.images) if product.images else 0
            uploaded_path = product.add_image(uploaded_file)
            
            product.refresh_from_db()
            after_count = len(product.images) if product.images else 0
            
            self.stdout.write(self.style.SUCCESS(f'Image uploaded to {product.name}'))
            self.stdout.write(f'Path: {uploaded_path}')
            self.stdout.write(f'Total images: {before_count} -> {after_count}')
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Upload failed: {str(e)}'))

    def list_products(self):
        products = Product.objects.filter(is_active=True).order_by('id')[:20]
        
        if not products:
            self.stdout.write(self.style.WARNING('No products found'))
            return
            
        self.stdout.write(f'{"ID":<6} {"Name":<40} {"Images"}')
        self.stdout.write('-' * 60)
        
        for p in products:
            img_count = len(p.images) if p.images else 0
            self.stdout.write(f'{p.id:<6} {p.name[:40]:<40} {img_count}')
