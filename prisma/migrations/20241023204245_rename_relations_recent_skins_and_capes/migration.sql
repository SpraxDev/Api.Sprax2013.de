-- AlterTable
ALTER TABLE profile_recent_capes RENAME TO profile_seen_capes;

-- AlterTable
ALTER TABLE profile_recent_skins RENAME TO profile_seen_skins;

-- AlterTable
ALTER TABLE "profile_seen_capes" RENAME CONSTRAINT "profile_recent_capes_pkey" TO "profile_seen_capes_pkey";

-- AlterTable
ALTER TABLE "profile_seen_skins" RENAME CONSTRAINT "profile_recent_skins_pkey" TO "profile_seen_skins_pkey";

-- RenameForeignKey
ALTER TABLE "profile_seen_capes" RENAME CONSTRAINT "profile_recent_capes_cape_id_fkey" TO "profile_seen_capes_cape_id_fkey";

-- RenameForeignKey
ALTER TABLE "profile_seen_capes" RENAME CONSTRAINT "profile_recent_capes_profile_id_fkey" TO "profile_seen_capes_profile_id_fkey";

-- RenameForeignKey
ALTER TABLE "profile_seen_skins" RENAME CONSTRAINT "profile_recent_skins_profile_id_fkey" TO "profile_seen_skins_profile_id_fkey";

-- RenameForeignKey
ALTER TABLE "profile_seen_skins" RENAME CONSTRAINT "profile_recent_skins_skin_id_fkey" TO "profile_seen_skins_skin_id_fkey";
