-- CreateEnum
CREATE TYPE "ImportPayloadType" AS ENUM ('UUID', 'USERNAME', 'PROFILE_TEXTURE_VALUE', 'SKIN_IMAGE', 'SERVER_PING');

-- CreateEnum
CREATE TYPE "ImportTaskState" AS ENUM ('QUEUED', 'DONE', 'DUPLICATE', 'ERROR');

-- CreateTable
CREATE TABLE "import_tasks" (
    "id" BIGSERIAL NOT NULL,
    "payload" BYTEA NOT NULL,
    "payloadType" "ImportPayloadType" NOT NULL,
    "state" "ImportTaskState" NOT NULL DEFAULT 'QUEUED',
    "stateUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "import_tasks_payloadType_payload_key" ON "import_tasks"("payloadType", "payload");
