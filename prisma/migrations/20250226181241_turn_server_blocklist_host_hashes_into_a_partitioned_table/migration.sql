-- Create partitioned table
CREATE TABLE "_tmp_server_blocklist_host_hashes_partitioned" (
                                                    "sha1"       bytea NOT NULL PRIMARY KEY,
                                                    "host"       text NOT NULL constraint "server_blocklist_host_hashes_new_host_check" CHECK ("host" = lower("host")),
                                                    "created_at" date NOT NULL DEFAULT CURRENT_TIMESTAMP
) PARTITION BY HASH ("sha1");

CREATE TABLE "server_blocklist_host_hashes_p0"
    PARTITION OF "_tmp_server_blocklist_host_hashes_partitioned"
        FOR VALUES WITH (MODULUS 8, REMAINDER 0);

CREATE TABLE "server_blocklist_host_hashes_p1"
    PARTITION OF "_tmp_server_blocklist_host_hashes_partitioned"
        FOR VALUES WITH (MODULUS 8, REMAINDER 1);

CREATE TABLE "server_blocklist_host_hashes_p2"
    PARTITION OF "_tmp_server_blocklist_host_hashes_partitioned"
        FOR VALUES WITH (MODULUS 8, REMAINDER 2);

CREATE TABLE "server_blocklist_host_hashes_p3"
    PARTITION OF "_tmp_server_blocklist_host_hashes_partitioned"
        FOR VALUES WITH (MODULUS 8, REMAINDER 3);

CREATE TABLE "server_blocklist_host_hashes_p4"
    PARTITION OF "_tmp_server_blocklist_host_hashes_partitioned"
        FOR VALUES WITH (MODULUS 8, REMAINDER 4);

CREATE TABLE "server_blocklist_host_hashes_p5"
    PARTITION OF "_tmp_server_blocklist_host_hashes_partitioned"
        FOR VALUES WITH (MODULUS 8, REMAINDER 5);

CREATE TABLE "server_blocklist_host_hashes_p6"
    PARTITION OF "_tmp_server_blocklist_host_hashes_partitioned"
        FOR VALUES WITH (MODULUS 8, REMAINDER 6);

CREATE TABLE "server_blocklist_host_hashes_p7"
    PARTITION OF "_tmp_server_blocklist_host_hashes_partitioned"
        FOR VALUES WITH (MODULUS 8, REMAINDER 7);

-- Migrate existing data
INSERT INTO "_tmp_server_blocklist_host_hashes_partitioned" ("sha1", "host", "created_at") SELECT "sha1", "host", "created_at" FROM "server_blocklist_host_hashes";

-- Create missing index on partitioned table, after data migration
CREATE INDEX "_tmp_server_blocklist_host_hashes_partitioned_host_idx" ON "_tmp_server_blocklist_host_hashes_partitioned"("host");

-- Create materialized view for partitioned table
CREATE MATERIALIZED VIEW "_tmp_server_blocklist_partitioned" AS
SELECT
    x."sha1",
    "_tmp_server_blocklist_host_hashes_partitioned"."host"
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
     "_tmp_server_blocklist_host_hashes_partitioned"
     ON "_tmp_server_blocklist_host_hashes_partitioned"."sha1" = x."sha1"
WHERE
    "change_is_add" = true;
CREATE UNIQUE INDEX "_tmp_server_blocklist_partitioned_sha1_idx" ON "_tmp_server_blocklist_partitioned" ("sha1");
CREATE UNIQUE INDEX "_tmp_server_blocklist_partitioned_host_idx" ON "_tmp_server_blocklist_partitioned" ("host");

-- Exchange partitioned table with original table
ALTER TABLE "server_blocklist_host_hashes" RENAME TO "_tmp_server_blocklist_host_original";
ALTER TABLE "_tmp_server_blocklist_host_hashes_partitioned" RENAME TO "server_blocklist_host_hashes";

-- Exchange materialized views for the tables
ALTER MATERIALIZED VIEW "server_blocklist" RENAME TO "_tmp_server_blocklist_original";
ALTER MATERIALIZED VIEW "_tmp_server_blocklist_partitioned" RENAME TO "server_blocklist";

-- Drop original table and materialized view
DROP MATERIALIZED VIEW "_tmp_server_blocklist_original";
DROP TABLE "_tmp_server_blocklist_host_original";

-- Rename constraint+index
ALTER TABLE "server_blocklist_host_hashes" RENAME CONSTRAINT "_tmp_server_blocklist_host_hashes_partitioned_pkey" TO "server_blocklist_host_hashes_pkey";
ALTER INDEX "_tmp_server_blocklist_host_hashes_partitioned_host_idx" RENAME TO "server_blocklist_host_hashes_host_idx";
ALTER INDEX "_tmp_server_blocklist_partitioned_sha1_idx" RENAME TO "server_blocklist_sha1_idx";
ALTER INDEX "_tmp_server_blocklist_partitioned_host_idx" RENAME TO "server_blocklist_host_idx";
