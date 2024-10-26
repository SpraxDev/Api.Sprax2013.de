/*
  Warnings:

  - You are about to drop the column `image_sha256` on the `capes` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[type,pixel_data_hash]` on the table `capes` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `pixel_data_hash` to the `capes` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "capes_type_image_sha256_key";

-- AlterTable
ALTER TABLE "capes" DROP COLUMN "image_sha256",
ADD COLUMN     "pixel_data_hash" BYTEA NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "capes_type_pixel_data_hash_key" ON "capes"("type", "pixel_data_hash");

-- AddComment
COMMENT ON COLUMN "capes"."pixel_data_hash" IS 'XXH128';
