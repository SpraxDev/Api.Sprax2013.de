/*
  Warnings:

  - The primary key for the `skin_images` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `normalized_image` on the `skin_images` table. All the data in the column will be lost.
  - You are about to drop the column `original_image` on the `skin_images` table. All the data in the column will be lost.
  - You are about to drop the column `original_image_sha256` on the `skin_images` table. All the data in the column will be lost.
  - You are about to drop the column `original_image_sha256` on the `skin_urls` table. All the data in the column will be lost.
  - You are about to drop the column `original_image_sha256` on the `skins` table. All the data in the column will be lost.
  - Added the required column `image_bytes` to the `skin_images` table without a default value. This is not possible if the table is not empty.
  - Added the required column `image_sha256` to the `skin_images` table without a default value. This is not possible if the table is not empty.
  - Added the required column `image_sha256` to the `skin_urls` table without a default value. This is not possible if the table is not empty.
  - Added the required column `image_sha256` to the `skins` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "skin_urls" DROP CONSTRAINT "skin_urls_original_image_sha256_fkey";

-- DropForeignKey
ALTER TABLE "skins" DROP CONSTRAINT "skins_original_image_sha256_fkey";

-- AlterTable
ALTER TABLE "skin_images" DROP CONSTRAINT "skin_images_pkey",
DROP COLUMN "normalized_image",
DROP COLUMN "original_image",
DROP COLUMN "original_image_sha256",
ADD COLUMN     "image_bytes" BYTEA NOT NULL,
ADD COLUMN     "image_sha256" BYTEA NOT NULL,
ADD COLUMN     "normalized_image_sha256" BYTEA,
ADD CONSTRAINT "skin_images_pkey" PRIMARY KEY ("image_sha256");

-- AlterTable
ALTER TABLE "skin_urls" DROP COLUMN "original_image_sha256",
ADD COLUMN     "image_sha256" BYTEA NOT NULL;

-- AlterTable
ALTER TABLE "skins" DROP COLUMN "original_image_sha256",
ADD COLUMN     "image_sha256" BYTEA NOT NULL;

-- AddForeignKey
ALTER TABLE "skins" ADD CONSTRAINT "skins_image_sha256_fkey" FOREIGN KEY ("image_sha256") REFERENCES "skin_images"("image_sha256") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skin_urls" ADD CONSTRAINT "skin_urls_image_sha256_fkey" FOREIGN KEY ("image_sha256") REFERENCES "skin_images"("image_sha256") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skin_images" ADD CONSTRAINT "skin_images_normalized_image_sha256_fkey" FOREIGN KEY ("normalized_image_sha256") REFERENCES "skin_images"("image_sha256") ON DELETE SET NULL ON UPDATE CASCADE;
