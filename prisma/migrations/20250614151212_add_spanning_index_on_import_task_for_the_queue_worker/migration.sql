-- DropIndex
DROP INDEX "import_tasks_created_at_idx";

-- CreateIndex
CREATE INDEX "import_tasks_state_payload_type_created_at_idx" ON "import_tasks"("state", "payload_type", "created_at" ASC);
