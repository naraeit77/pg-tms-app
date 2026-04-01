-- ============================================================
-- PG-TMS SaaS 마이그레이션 Step 4: 집계 Materialized Views
-- ============================================================
-- TimescaleDB Continuous Aggregate 대체
-- pg_cron으로 주기적 CONCURRENT 리프레시
-- ============================================================

-- ─── 5분 집계 ───────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_5min AS
SELECT
    tenant_id,
    connection_id,
    metric_type,
    -- 커스텀 5분 버킷: date_trunc + floor
    date_trunc('hour', collected_at)
        + (FLOOR(EXTRACT(MINUTE FROM collected_at) / 5) * INTERVAL '5 minutes')
        AS bucket,
    COUNT(*) AS sample_count,
    -- Global stats 집계 (JSONB에서 추출)
    AVG((data->>'active_sessions')::numeric) AS avg_active_sessions,
    MAX((data->>'active_sessions')::numeric) AS max_active_sessions,
    AVG((data->>'tps')::numeric) AS avg_tps,
    MAX((data->>'tps')::numeric) AS max_tps,
    AVG((data->>'cache_hit_ratio')::numeric) AS avg_cache_hit_ratio,
    MIN((data->>'cache_hit_ratio')::numeric) AS min_cache_hit_ratio,
    AVG((data->>'total_connections')::numeric) AS avg_total_connections,
    MAX((data->>'total_connections')::numeric) AS max_total_connections,
    SUM((data->>'deadlocks')::numeric) AS sum_deadlocks,
    AVG((data->>'db_size')::numeric) AS avg_db_size
FROM metrics_realtime
WHERE collected_at >= now() - INTERVAL '30 days'
  AND metric_type = 'global'
GROUP BY tenant_id, connection_id, metric_type, bucket
WITH NO DATA;

-- CONCURRENT 리프레시를 위한 UNIQUE 인덱스 (필수)
CREATE UNIQUE INDEX IF NOT EXISTS idx_metrics_5min_unique
    ON metrics_5min (tenant_id, connection_id, metric_type, bucket);

CREATE INDEX IF NOT EXISTS idx_metrics_5min_bucket
    ON metrics_5min (bucket);

CREATE INDEX IF NOT EXISTS idx_metrics_5min_tenant
    ON metrics_5min (tenant_id, connection_id);

-- ─── 1시간 집계 ─────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1hr AS
SELECT
    tenant_id,
    connection_id,
    metric_type,
    date_trunc('hour', bucket) AS bucket,
    SUM(sample_count) AS sample_count,
    AVG(avg_active_sessions) AS avg_active_sessions,
    MAX(max_active_sessions) AS max_active_sessions,
    AVG(avg_tps) AS avg_tps,
    MAX(max_tps) AS max_tps,
    AVG(avg_cache_hit_ratio) AS avg_cache_hit_ratio,
    MIN(min_cache_hit_ratio) AS min_cache_hit_ratio,
    AVG(avg_total_connections) AS avg_total_connections,
    MAX(max_total_connections) AS max_total_connections,
    SUM(sum_deadlocks) AS sum_deadlocks,
    AVG(avg_db_size) AS avg_db_size
FROM metrics_5min
GROUP BY tenant_id, connection_id, metric_type, date_trunc('hour', bucket)
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_metrics_1hr_unique
    ON metrics_1hr (tenant_id, connection_id, metric_type, bucket);

CREATE INDEX IF NOT EXISTS idx_metrics_1hr_bucket
    ON metrics_1hr (bucket);

-- ─── 1일 집계 ───────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1day AS
SELECT
    tenant_id,
    connection_id,
    metric_type,
    date_trunc('day', bucket) AS bucket,
    SUM(sample_count) AS sample_count,
    AVG(avg_active_sessions) AS avg_active_sessions,
    MAX(max_active_sessions) AS max_active_sessions,
    AVG(avg_tps) AS avg_tps,
    MAX(max_tps) AS max_tps,
    AVG(avg_cache_hit_ratio) AS avg_cache_hit_ratio,
    MIN(min_cache_hit_ratio) AS min_cache_hit_ratio,
    AVG(avg_total_connections) AS avg_total_connections,
    MAX(max_total_connections) AS max_total_connections,
    SUM(sum_deadlocks) AS sum_deadlocks,
    AVG(avg_db_size) AS avg_db_size
FROM metrics_1hr
GROUP BY tenant_id, connection_id, metric_type, date_trunc('day', bucket)
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_metrics_1day_unique
    ON metrics_1day (tenant_id, connection_id, metric_type, bucket);

CREATE INDEX IF NOT EXISTS idx_metrics_1day_bucket
    ON metrics_1day (bucket);

-- ─── 초기 데이터 로드 (첫 실행 시) ─────────────────────────

-- 첫 실행 시에는 CONCURRENTLY 없이 리프레시
REFRESH MATERIALIZED VIEW metrics_5min;
REFRESH MATERIALIZED VIEW metrics_1hr;
REFRESH MATERIALIZED VIEW metrics_1day;
