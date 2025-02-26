-- CreateIndex
CREATE INDEX "import_tasks_payload_idx" ON "import_tasks" USING HASH ("payload");

-- CreateIndex
CREATE INDEX "import_tasks_payload_type_idx" ON "import_tasks"("payload_type");
