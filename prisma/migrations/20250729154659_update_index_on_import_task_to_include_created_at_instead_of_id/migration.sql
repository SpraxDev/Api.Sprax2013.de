-- DropIndex
DROP INDEX "import_tasks_payload_type_state_id_idx";

-- CreateIndex
CREATE INDEX "import_tasks_payload_type_state_created_at_idx" ON "import_tasks"("payload_type", "state", "created_at" ASC);
