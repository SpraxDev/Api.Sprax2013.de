-- CreateTable
CREATE TABLE "server_blocklist_host_hashes" (
    "sha1" BYTEA NOT NULL,
    "host" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_blocklist_host_hashes_pkey" PRIMARY KEY ("sha1"),
    CHECK ("host" = lower("host"))
);

-- CreateIndex
CREATE INDEX "server_blocklist_host_hashes_host_idx" ON "server_blocklist_host_hashes"("host");

-- AlterMaterializedView
DROP MATERIALIZED VIEW "server_blocklist";
CREATE MATERIALIZED VIEW "server_blocklist" AS
    SELECT
        x."sha1",
        "server_blocklist_host_hashes"."host"
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
    LEFT JOIN
        "server_blocklist_host_hashes"
            ON "server_blocklist_host_hashes"."sha1" = x."sha1"
    WHERE
        "change_is_add" = true;

CREATE UNIQUE INDEX "server_blocklist_sha1_idx" ON server_blocklist (sha1);
CREATE UNIQUE INDEX "server_blocklist_host_idx" ON server_blocklist (host);
