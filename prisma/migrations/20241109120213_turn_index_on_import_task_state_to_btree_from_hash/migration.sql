-- DropIndex
DROP INDEX "import_tasks_state_idx";

-- CreateIndex
CREATE INDEX "import_tasks_state_idx" ON "import_tasks"("state");
