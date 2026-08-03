import { Injectable, BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export interface ProcessedImage {
  fullUrl: string;
  mediumUrl: string;
  thumbnailUrl: string;
}

@Injectable()
export class ImageService {
  private readonly uploadDir = join(process.cwd(), 'uploads', 'products');
  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB
  private readonly allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

  // Image size configurations
  private readonly sizes = {
    full: 1440,
    medium: 768,
    thumbnail: 320,
  };

  constructor() {
    this.ensureUploadDir();
  }

  private async ensureUploadDir(): Promise<void> {
    if (!existsSync(this.uploadDir)) {
      await mkdir(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Process an uploaded image file into multiple sizes
   * @param file - The uploaded file from multer
   * @returns URLs for all generated image sizes
   */
  async processProductImage(file: Express.Multer.File): Promise<ProcessedImage> {
    // Validate file
    this.validateFile(file);

    // Generate unique filename
    const imageId = randomUUID();
    const ext = this.getExtension(file.mimetype);

    // Process image into multiple sizes
    const [fullUrl, mediumUrl, thumbnailUrl] = await Promise.all([
      this.resizeAndSave(file.buffer, imageId, 'full', ext, this.sizes.full),
      this.resizeAndSave(file.buffer, imageId, 'medium', ext, this.sizes.medium),
      this.resizeAndSave(file.buffer, imageId, 'thumbnail', ext, this.sizes.thumbnail),
    ]);

    return { fullUrl, mediumUrl, thumbnailUrl };
  }

  /**
   * Resize an image and save it to disk
   */
  private async resizeAndSave(
    buffer: Buffer,
    imageId: string,
    sizeLabel: string,
    ext: string,
    maxWidth: number,
  ): Promise<string> {
    const filename = `${imageId}-${sizeLabel}.${ext}`;
    const filepath = join(this.uploadDir, filename);

    // Resize image using Sharp
    const resizedBuffer = await sharp(buffer)
      .resize(maxWidth, null, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 }) // Convert to WebP for better compression
      .toBuffer();

    // Save to disk
    await writeFile(filepath, resizedBuffer);

    // Return public URL (adjust this based on your static file serving setup)
    return `/uploads/products/${imageId}-${sizeLabel}.webp`;
  }

  /**
   * Validate uploaded file
   */
  private validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (file.size > this.maxFileSize) {
      throw new BadRequestException(`File size exceeds ${this.maxFileSize / 1024 / 1024}MB limit`);
    }

    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${this.allowedMimeTypes.join(', ')}`,
      );
    }
  }

  /**
   * Get file extension from mime type
   */
  private getExtension(mimetype: string): string {
    // We always convert to WebP, but this could be made configurable
    return 'webp';
  }
}
