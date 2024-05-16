-- CreateFunction
CREATE FUNCTION generate_snowflake(seq text, OUT snowflake bigint) RETURNS bigint
    LANGUAGE plpgsql
AS
$$
DECLARE
    our_epoch  bigint := 1715299200000; -- 2024-05-10 00:00:00 UTC
    seq_id     bigint;
    now_millis bigint;
    -- the id of this DB shard, must be set for each schema shard you have
    shard_id   int    := 1;
BEGIN
    SELECT nextval(seq) % 1024 INTO seq_id;

    SELECT floor(extract(EPOCH FROM clock_timestamp()) * 1000) INTO now_millis;
    snowflake := (now_millis - our_epoch) << 23;
    snowflake := snowflake | (shard_id << 10);
    snowflake := snowflake | (seq_id);
END;
$$;

-- CreateTable
CREATE TABLE "skins" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('skin_urls_id_seq'::text),
    "original_image_sha256" BYTEA NOT NULL,

    CONSTRAINT "skins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skin_urls" (
    "url" TEXT NOT NULL,
    "original_image_sha256" BYTEA NOT NULL,
    "texture_value" TEXT,
    "texture_signature" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skin_urls_pkey" PRIMARY KEY ("url"),
    CHECK (("texture_value" IS NULL AND "texture_signature" IS NULL) OR ("texture_value" IS NOT NULL AND "texture_signature" IS NOT NULL))
);

-- CreateTable
CREATE TABLE "skin_images" (
    "original_image_sha256" BYTEA NOT NULL,
    "original_image" BYTEA NOT NULL,
    "normalized_image" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skin_images_pkey" PRIMARY KEY ("original_image_sha256"),
    CHECK (length("original_image_sha256") = 32)
);

-- AddForeignKey
ALTER TABLE "skins" ADD CONSTRAINT "skins_original_image_sha256_fkey" FOREIGN KEY ("original_image_sha256") REFERENCES "skin_images"("original_image_sha256") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skin_urls" ADD CONSTRAINT "skin_urls_original_image_sha256_fkey" FOREIGN KEY ("original_image_sha256") REFERENCES "skin_images"("original_image_sha256") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateSequence
CREATE SEQUENCE "skin_urls_id_seq";
ALTER SEQUENCE "skin_urls_id_seq" OWNED BY "skins"."id";
