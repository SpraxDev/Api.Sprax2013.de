-- CreateTable
CREATE TABLE "profile_seen_names" (
    "profile_id" UUID NOT NULL,
    "name_lowercase" TEXT NOT NULL CHECK ( "name_lowercase" = lower("name_lowercase") ),
    "first_seen" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_seen_names_pkey" PRIMARY KEY ("profile_id","name_lowercase")
);
