-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN "thumbnailUrl" TEXT;
ALTER TABLE "ProductImage" ADD COLUMN "mediumUrl" TEXT;

-- Update comment on url column to clarify it's the full size
COMMENT ON COLUMN "ProductImage"."url" IS 'Original/full size (1440px)';
