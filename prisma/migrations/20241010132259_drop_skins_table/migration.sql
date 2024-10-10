/*
  Warnings:

  - You are about to drop the `skins` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[skinId]` on the table `skin_images` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "skins" DROP CONSTRAINT "skins_image_sha256_fkey";

-- AlterTable
ALTER TABLE "skin_images" ADD COLUMN     "skinId" BIGINT NOT NULL DEFAULT generate_snowflake('skin_image_id_seq'::text);

-- DropTable
DROP TABLE "skins";

-- CreateIndex
CREATE UNIQUE INDEX "skin_images_skinId_key" ON "skin_images"("skinId");

-- CreateSequence
CREATE SEQUENCE "skin_images_id_seq";
ALTER SEQUENCE "skin_images_id_seq" OWNED BY "skin_images"."skinId";
