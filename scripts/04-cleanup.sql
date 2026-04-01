-- ============================================================
-- PG-TMS 테스트 데이터 정리
--
-- 실행 방법:
--   psql -h mcseoper.iptime.org -p 5444 -U postgres -d pgdb17 -f 04-cleanup.sql
-- ============================================================

\echo '테스트 테이블 삭제 중...'

DROP TABLE IF EXISTS test_order_items CASCADE;
DROP TABLE IF EXISTS test_orders CASCADE;
DROP TABLE IF EXISTS test_products CASCADE;
DROP TABLE IF EXISTS test_customers CASCADE;

\echo '✅ 테스트 테이블 삭제 완료'

-- pg_stat_statements에서 테스트 쿼리 통계도 리셋
SELECT pg_stat_statements_reset();
\echo '✅ pg_stat_statements 리셋 완료'
