-- CreateTable
CREATE TABLE "profile_recent_skins" (
    "profile_id" UUID NOT NULL,
    "skin_image_id" BIGINT NOT NULL,
    "first_seen_using" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_using" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_recent_skins_pkey" PRIMARY KEY ("profile_id","skin_image_id")
);

-- AddForeignKey
ALTER TABLE "profile_recent_skins" ADD CONSTRAINT "profile_recent_skins_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_recent_skins" ADD CONSTRAINT "profile_recent_skins_skin_image_id_fkey" FOREIGN KEY ("skin_image_id") REFERENCES "skin_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
