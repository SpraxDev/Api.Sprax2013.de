/*
  Warnings:

  - The primary key for the `server_status_favicon` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `sha256` on the `server_status_favicon` table. All the data in the column will be lost.
  - You are about to drop the column `favicon_sha256` on the `server_status_history` table. All the data in the column will be lost.
  - Added the required column `pixel_data_hash` to the `server_status_favicon` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "server_status_history" DROP CONSTRAINT "server_status_history_favicon_sha256_fkey";

-- AlterTable
ALTER TABLE "server_status_favicon" DROP CONSTRAINT "server_status_favicon_pkey",
DROP COLUMN "sha256",
ADD COLUMN     "pixel_data_hash" BYTEA NOT NULL,
ADD CONSTRAINT "server_status_favicon_pkey" PRIMARY KEY ("pixel_data_hash");

-- AddComment
COMMENT ON COLUMN "server_status_favicon"."pixel_data_hash" IS 'XXH128';

-- AlterTable
ALTER TABLE "server_status_history" DROP COLUMN "favicon_sha256",
ADD COLUMN     "favicon_pixel_data_hash" BYTEA;

-- AddForeignKey
ALTER TABLE "server_status_history" ADD CONSTRAINT "server_status_history_favicon_pixel_data_hash_fkey" FOREIGN KEY ("favicon_pixel_data_hash") REFERENCES "server_status_favicon"("pixel_data_hash") ON DELETE SET NULL ON UPDATE CASCADE;
