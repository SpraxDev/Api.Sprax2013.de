-- AlterTable
ALTER TABLE "import_tasks" ADD COLUMN     "import_group_id" BIGINT;

-- CreateTable
CREATE TABLE "import_groups" (
    "id" BIGINT NOT NULL DEFAULT generate_snowflake('import_groups_id_seq'::text),
    "owner_tmp" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "last_error_message" TEXT,
    "total_parsed_payloads" INTEGER NOT NULL DEFAULT 0,
    "succeeded_imports" INTEGER NOT NULL DEFAULT 0,
    "errored_imports" INTEGER NOT NULL DEFAULT 0,
    "duplicate_imports" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "import_groups_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "import_tasks" ADD CONSTRAINT "import_tasks_import_group_id_fkey" FOREIGN KEY ("import_group_id") REFERENCES "import_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateSequence
CREATE SEQUENCE "import_groups_id_seq";
ALTER SEQUENCE "import_groups_id_seq" OWNED BY "import_groups"."id";
