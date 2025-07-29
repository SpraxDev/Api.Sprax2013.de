-- DropIndex
DROP INDEX "import_tasks_state_payload_type_created_at_idx";

-- CreateIndex
CREATE INDEX "import_tasks_payload_type_state_id_idx" ON "import_tasks"("payload_type", "state", "id" ASC);
