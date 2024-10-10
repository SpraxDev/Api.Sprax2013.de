-- CreateEnum
CREATE TYPE "ImportPayloadType" AS ENUM ('UUID', 'USERNAME', 'PROFILE_TEXTURE_VALUE', 'SKIN_IMAGE');

-- CreateEnum
CREATE TYPE "ImportTaskState" AS ENUM ('QUEUED', 'IMPORTED', 'NO_CHANGES', 'ERROR');

-- CreateTable
CREATE TABLE "import_tasks" (
    "id" BIGSERIAL NOT NULL,
    "payload" BYTEA NOT NULL,
    "payload_type" "ImportPayloadType" NOT NULL,
    "state" "ImportTaskState" NOT NULL DEFAULT 'QUEUED',
    "state_updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "import_tasks_payload_type_payload_key" ON "import_tasks"("payload_type", "payload");
