-- CreateTable
CREATE TABLE "server_blocklist_changes" (
    "sha1" BYTEA NOT NULL,
    "change_is_add" BOOLEAN NOT NULL,
    "change_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_blocklist_changes_pkey" PRIMARY KEY ("sha1","change_seen_at")
);

-- CreateIndex
CREATE INDEX "server_blocklist_changes_sha1_change_seen_at_idx" ON "server_blocklist_changes"("sha1", "change_seen_at" DESC);

-- CreateView
CREATE MATERIALIZED VIEW "server_blocklist" AS
    SELECT
        x."sha1"
    FROM (
        SELECT DISTINCT ON ("sha1")
            "sha1",
            "change_is_add"
        FROM
            "server_blocklist_changes"
        ORDER BY
            "sha1",
            "change_seen_at" DESC
    ) as x
    WHERE
        "change_is_add" = true;
