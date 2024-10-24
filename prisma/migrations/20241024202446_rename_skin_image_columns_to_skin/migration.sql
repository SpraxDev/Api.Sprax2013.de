-- AlterTable
ALTER TABLE skins RENAME COLUMN normalized_image_id TO normalized_skin_id;

-- AlterTable
ALTER TABLE skin_urls RENAME COLUMN image_id TO skin_id;

-- RenameForeignKey
ALTER TABLE "skin_urls" RENAME CONSTRAINT "skin_urls_image_id_fkey" TO "skin_urls_skin_id_fkey";

-- RenameForeignKey
ALTER TABLE "skins" RENAME CONSTRAINT "skins_normalized_image_id_fkey" TO "skins_normalized_skin_id_fkey";
