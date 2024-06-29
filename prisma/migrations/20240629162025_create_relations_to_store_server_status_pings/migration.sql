-- CreateTable
CREATE TABLE "server_status_history" (
    "id" BIGSERIAL NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "rtt_in_ms" INTEGER NOT NULL,
    "resolved_ip" INET NOT NULL,
    "was_legacy_protocol" BOOLEAN NOT NULL,
    "protocol_version" INTEGER NOT NULL,
    "online_players" INTEGER NOT NULL,
    "favicon_sha256" BYTEA,
    "raw_status" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_status_favicon" (
    "sha256" BYTEA NOT NULL,
    "image" BYTEA NOT NULL,

    CONSTRAINT "server_status_favicon_pkey" PRIMARY KEY ("sha256")
);

-- CreateIndex
CREATE INDEX "server_status_history_host_port_idx" ON "server_status_history"("host", "port");

-- CreateIndex
CREATE INDEX "server_status_history_created_at_idx" ON "server_status_history"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "server_status_history" ADD CONSTRAINT "server_status_history_favicon_sha256_fkey" FOREIGN KEY ("favicon_sha256") REFERENCES "server_status_favicon"("sha256") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateView
CREATE VIEW "server_status_cache" AS (
SELECT
    "id",
    "host",
    "port" ,
    "rtt_in_ms",
    "resolved_ip",
    "was_legacy_protocol",
    "raw_status",
    extract(epoch from (CURRENT_TIMESTAMP - "created_at")) AS "age_in_seconds"
FROM
    "server_status_history"
ORDER BY
    "created_at" DESC
);
