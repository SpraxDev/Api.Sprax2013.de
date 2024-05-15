-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "name_lowercase" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

CREATE VIEW "profile_cache" AS (
SELECT
    "id",
    "name_lowercase",
    "raw",
    extract(epoch from (CURRENT_TIMESTAMP - "updated_at")) AS "age_in_seconds"
FROM
    "profiles"
WHERE
    "deleted" = false
ORDER BY
    "updated_at"
);
