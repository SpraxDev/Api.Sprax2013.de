/*
  Warnings:

  - You are about to drop the column `image_sha256` on the `skins` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[pixel_data_hash]` on the table `skins` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `pixel_data_hash` to the `skins` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "skins_image_sha256_key";

-- AlterTable
ALTER TABLE "skins" DROP COLUMN "image_sha256",
ADD COLUMN     "pixel_data_hash" BYTEA NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "skins_pixel_data_hash_key" ON "skins"("pixel_data_hash");

-- AddComment
COMMENT ON COLUMN "skins"."pixel_data_hash" IS 'XXH128';
