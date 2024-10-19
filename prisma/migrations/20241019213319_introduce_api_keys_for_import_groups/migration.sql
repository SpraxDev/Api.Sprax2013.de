/*
  Warnings:

  - You are about to drop the column `owner_tmp` on the `import_groups` table. All the data in the column will be lost.
  - Added the required column `importing_api_key_id` to the `import_groups` table without a default value. This is not possible if the table is not empty.

*/
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- AlterTable
ALTER TABLE "import_groups" DROP COLUMN "owner_tmp",
ADD COLUMN     "importing_api_key_id" BIGINT NOT NULL;

-- CreateTable
CREATE TABLE "api_keys" (
    "id" BIGSERIAL NOT NULL,
    "key" BYTEA NOT NULL DEFAULT gen_random_bytes(32),
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_key" ON "api_keys"("key");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_groups" ADD CONSTRAINT "import_groups_importing_api_key_id_fkey" FOREIGN KEY ("importing_api_key_id") REFERENCES "api_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
