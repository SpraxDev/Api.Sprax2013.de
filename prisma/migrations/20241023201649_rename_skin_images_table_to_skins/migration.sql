-- AlterTable
ALTER TABLE skin_images RENAME TO skins;

-- AlterTable
ALTER TABLE "skins" RENAME CONSTRAINT "skin_images_pkey" TO "skins_pkey";

-- AlterTable
ALTER TABLE profile_recent_skins RENAME COLUMN skin_image_id TO skin_id;

-- RenameForeignKey
ALTER TABLE "profile_recent_skins" RENAME CONSTRAINT "profile_recent_skins_skin_image_id_fkey" TO "profile_recent_skins_skin_id_fkey";

-- RenameForeignKey
ALTER TABLE "skins" RENAME CONSTRAINT "skin_images_normalized_image_id_fkey" TO "skins_normalized_image_id_fkey";

-- RenameIndex
ALTER INDEX "skin_images_image_sha256_key" RENAME TO "skins_image_sha256_key";
