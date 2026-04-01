-- ============================================================
-- PG-TMS SaaS 마이그레이션 Step 3: 메트릭 파티션 테이블
-- ============================================================
-- pg_partman을 사용한 자동 파티셔닝 + 보존 정책
-- ============================================================

-- ─── 실시간 메트릭 (일별 파티션, 7일 보존) ────────────────

CREATE TABLE IF NOT EXISTS metrics_realtime (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    tenant_id UUID NOT NULL,
    connection_id UUID NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metric_type VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,
    PRIMARY KEY (collected_at, id)
) PARTITION BY RANGE (collected_at);

CREATE INDEX IF NOT EXISTS idx_metrics_rt_tenant_conn_time
    ON metrics_realtime (tenant_id, connection_id, collected_at);
CREATE INDEX IF NOT EXISTS idx_metrics_rt_type
    ON metrics_realtime (metric_type);

-- pg_partman 설정: 일별 파티션, 7일 미리 생성
SELECT partman.create_parent(
    p_parent_table := 'public.metrics_realtime',
    p_control := 'collected_at',
    p_interval := '1 day',
    p_premake := 7
);

-- 보존 정책: 7일 후 자동 삭제
UPDATE partman.part_config
SET retention = '7 days',
    retention_keep_table = false,
    retention_keep_index = false
WHERE parent_table = 'public.metrics_realtime';

-- ─── SQL 스냅샷 메트릭 (월별 파티션, 90일 보존) ─────────

CREATE TABLE IF NOT EXISTS metrics_snapshot (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    tenant_id UUID NOT NULL,
    connection_id UUID NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    snapshot_number INT,
    queryid BIGINT,
    query_text TEXT,
    username VARCHAR(100),
    calls BIGINT DEFAULT 0,
    total_exec_time DOUBLE PRECISION DEFAULT 0,
    mean_exec_time DOUBLE PRECISION DEFAULT 0,
    rows BIGINT DEFAULT 0,
    shared_blks_hit BIGINT DEFAULT 0,
    shared_blks_read BIGINT DEFAULT 0,
    temp_blks_read BIGINT DEFAULT 0,
    temp_blks_written BIGINT DEFAULT 0,
    blk_read_time DOUBLE PRECISION DEFAULT 0,
    blk_write_time DOUBLE PRECISION DEFAULT 0,
    delta_calls BIGINT,
    delta_total_exec_time DOUBLE PRECISION,
    delta_rows BIGINT,
    delta_shared_blks_read BIGINT,
    PRIMARY KEY (collected_at, id)
) PARTITION BY RANGE (collected_at);

CREATE INDEX IF NOT EXISTS idx_metrics_snap_tenant_conn_time
    ON metrics_snapshot (tenant_id, connection_id, collected_at);
CREATE INDEX IF NOT EXISTS idx_metrics_snap_queryid
    ON metrics_snapshot (queryid);
CREATE INDEX IF NOT EXISTS idx_metrics_snap_number
    ON metrics_snapshot (connection_id, snapshot_number);

SELECT partman.create_parent(
    p_parent_table := 'public.metrics_snapshot',
    p_control := 'collected_at',
    p_interval := '1 month',
    p_premake := 3
);

UPDATE partman.part_config
SET retention = '90 days',
    retention_keep_table = false,
    retention_keep_index = false
WHERE parent_table = 'public.metrics_snapshot';

-- ─── 스냅샷 메타 (월별 파티션) ──────────────────────────

CREATE TABLE IF NOT EXISTS metrics_snapshot_meta (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    tenant_id UUID NOT NULL,
    connection_id UUID NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    snapshot_number INT NOT NULL,
    status VARCHAR(20) DEFAULT 'COMPLETED',
    tps DOUBLE PRECISION,
    active_backends INT,
    idle_backends INT,
    total_connections INT,
    cache_hit_ratio DOUBLE PRECISION,
    tx_committed BIGINT,
    tx_rolled_back BIGINT,
    deadlocks BIGINT,
    db_size_bytes BIGINT,
    duration_ms INT,
    sql_count INT,
    error_message TEXT,
    PRIMARY KEY (collected_at, id)
) PARTITION BY RANGE (collected_at);

CREATE INDEX IF NOT EXISTS idx_snap_meta_tenant_conn_time
    ON metrics_snapshot_meta (tenant_id, connection_id, collected_at);
CREATE INDEX IF NOT EXISTS idx_snap_meta_conn_number
    ON metrics_snapshot_meta (connection_id, snapshot_number);

SELECT partman.create_parent(
    p_parent_table := 'public.metrics_snapshot_meta',
    p_control := 'collected_at',
    p_interval := '1 month',
    p_premake := 3
);

UPDATE partman.part_config
SET retention = '90 days',
    retention_keep_table = false,
    retention_keep_index = false
WHERE parent_table = 'public.metrics_snapshot_meta';
