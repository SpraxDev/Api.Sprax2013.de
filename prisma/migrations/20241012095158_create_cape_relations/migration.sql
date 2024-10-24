-- CreateEnum
CREATE TYPE "CapeType" AS ENUM ('MOJANG', 'OPTIFINE', 'LABYMOD');

-- CreateTable
CREATE TABLE "profile_recent_capes" (
    "profile_id" UUID NOT NULL,
    "cape_id" BIGINT NOT NULL,
    "first_seen_using" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_using" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_recent_capes_pkey" PRIMARY KEY ("profile_id","cape_id")
);

-- CreateTable
CREATE TABLE "capes" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('capes_id_seq'::text),
    "type" "CapeType" NOT NULL,
    "image_sha256" BYTEA NOT NULL,
    "mime_type" TEXT NOT NULL,
    "image_bytes" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cape_urls" (
    "url" TEXT NOT NULL CHECK (starts_with("url", 'https://') AND (strpos("url", '.minecraft.net/') > 0 OR strpos("url", '.mojang.com/') > 0)),
    "cape_id" BIGINT NOT NULL,

    CONSTRAINT "cape_urls_pkey" PRIMARY KEY ("url")
);

-- CreateIndex
CREATE UNIQUE INDEX "capes_type_image_sha256_key" ON "capes"("type", "image_sha256");

-- AddForeignKey
ALTER TABLE "profile_recent_capes" ADD CONSTRAINT "profile_recent_capes_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_recent_capes" ADD CONSTRAINT "profile_recent_capes_cape_id_fkey" FOREIGN KEY ("cape_id") REFERENCES "capes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cape_urls" ADD CONSTRAINT "cape_urls_cape_id_fkey" FOREIGN KEY ("cape_id") REFERENCES "capes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateSequence
CREATE SEQUENCE "capes_id_seq";
ALTER SEQUENCE "capes_id_seq" OWNED BY "capes"."id";
