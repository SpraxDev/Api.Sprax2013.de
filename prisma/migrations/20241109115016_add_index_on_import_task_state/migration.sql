-- CreateIndex
CREATE INDEX "import_tasks_state_idx" ON "import_tasks" USING HASH ("state");
