-- ============================================================
-- PG-TMS SaaS 마이그레이션 Step 5: pg_cron 자동화 설정
-- ============================================================
-- Supabase에서 실행: Dashboard > SQL Editor
-- pg_cron은 Supabase Pro 이상에서 사용 가능
-- ============================================================

-- ─── Materialized View 리프레시 크론 ────────────────────────

-- 5분 집계: 매 5분마다 리프레시
SELECT cron.schedule(
    'refresh_metrics_5min',
    '*/5 * * * *',
    $$REFRESH MATERIALIZED VIEW CONCURRENTLY metrics_5min$$
);

-- 1시간 집계: 매 시간 5분에 리프레시
SELECT cron.schedule(
    'refresh_metrics_1hr',
    '5 * * * *',
    $$REFRESH MATERIALIZED VIEW CONCURRENTLY metrics_1hr$$
);

-- 1일 집계: 매일 00:10에 리프레시
SELECT cron.schedule(
    'refresh_metrics_1day',
    '10 0 * * *',
    $$REFRESH MATERIALIZED VIEW CONCURRENTLY metrics_1day$$
);

-- ─── pg_partman 유지보수 크론 ───────────────────────────────

-- 매 시간 15분: 파티션 생성/삭제 유지보수
SELECT cron.schedule(
    'partman_maintenance',
    '15 * * * *',
    $$SELECT partman.run_maintenance()$$
);

-- ─── 알림 이력 정리 ─────────────────────────────────────────

-- 매일 02:00: 180일 이상된 알림 이력 삭제
SELECT cron.schedule(
    'cleanup_alert_history',
    '0 2 * * *',
    $$DELETE FROM alert_history WHERE triggered_at < now() - INTERVAL '180 days'$$
);

-- ─── 크론 작업 확인 ─────────────────────────────────────────

SELECT jobid, schedule, command, nodename, active
FROM cron.job
ORDER BY jobid;
