-- ============================================================
-- PG-TMS SaaS 마이그레이션 Step 1: 필수 확장 활성화
-- ============================================================
-- Supabase에서 실행: SQL Editor에서 직접 실행
-- 로컬에서 실행: psql -d pgtms -f scripts/saas/01-enable-extensions.sql
-- ============================================================

-- pg_partman: 자동 파티션 관리
CREATE EXTENSION IF NOT EXISTS pg_partman;

-- pg_cron: 데이터베이스 내부 크론 작업 (Supabase Pro에서 사용 가능)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 확인
SELECT extname, extversion FROM pg_extension
WHERE extname IN ('pg_partman', 'pg_cron')
ORDER BY extname;
