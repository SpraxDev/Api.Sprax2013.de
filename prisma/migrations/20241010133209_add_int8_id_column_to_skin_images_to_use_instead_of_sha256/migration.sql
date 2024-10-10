/*
  Warnings:

  - The primary key for the `skin_images` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `normalized_image_sha256` on the `skin_images` table. All the data in the column will be lost.
  - You are about to drop the column `skinId` on the `skin_images` table. All the data in the column will be lost.
  - You are about to drop the column `image_sha256` on the `skin_urls` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[image_sha256]` on the table `skin_images` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `image_id` to the `skin_urls` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "skin_images" DROP CONSTRAINT "skin_images_normalized_image_sha256_fkey";

-- DropForeignKey
ALTER TABLE "skin_urls" DROP CONSTRAINT "skin_urls_image_sha256_fkey";

-- AlterSequence
ALTER SEQUENCE "skin_images_id_seq" OWNED BY NONE;

-- DropIndex
DROP INDEX "skin_images_skinId_key";

-- AlterTable
ALTER TABLE "skin_images" DROP CONSTRAINT "skin_images_pkey",
DROP COLUMN "normalized_image_sha256",
DROP COLUMN "skinId",
ADD COLUMN     "id" BIGINT NOT NULL DEFAULT generate_snowflake('skin_images_id_seq'::text),
ADD COLUMN     "normalized_image_id" BIGINT,
ADD CONSTRAINT "skin_images_pkey" PRIMARY KEY ("id");

-- AlterSequence
ALTER SEQUENCE "skin_images_id_seq" OWNED BY "skin_images"."id";

-- AlterTable
ALTER TABLE "skin_urls" DROP COLUMN "image_sha256",
ADD COLUMN     "image_id" BIGINT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "skin_images_image_sha256_key" ON "skin_images"("image_sha256");

-- AddForeignKey
ALTER TABLE "skin_urls" ADD CONSTRAINT "skin_urls_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "skin_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skin_images" ADD CONSTRAINT "skin_images_normalized_image_id_fkey" FOREIGN KEY ("normalized_image_id") REFERENCES "skin_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
