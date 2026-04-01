# PG-TMS SaaS 마이그레이션 스크립트

PG-TMS v1.0 → SaaS 아키텍처 마이그레이션을 위한 SQL 스크립트입니다.

## 실행 순서

```bash
# 1. 확장 활성화 (pg_partman, pg_cron)
psql -d pgtms -f scripts/saas/01-enable-extensions.sql

# 2. 멀티테넌트 조직 테이블 생성
psql -d pgtms -f scripts/saas/02-create-org-tables.sql

# 3. 메트릭 파티션 테이블 생성
psql -d pgtms -f scripts/saas/03-create-metric-tables.sql

# 4. 집계 Materialized Views 생성
psql -d pgtms -f scripts/saas/04-create-materialized-views.sql

# 5. pg_cron 자동화 설정
psql -d pgtms -f scripts/saas/05-setup-pg-cron.sql

# 6. 알림 시스템 테이블 생성
psql -d pgtms -f scripts/saas/06-create-alert-tables.sql
```

## Supabase에서 실행

Supabase Dashboard > SQL Editor에서 각 파일 내용을 순서대로 실행합니다.

**주의**: `pg_cron`은 Supabase Pro 플랜 이상에서 사용 가능합니다.

## 기존 데이터 마이그레이션

Step 2 실행 후, 기존 사용자를 기본 조직으로 마이그레이션하려면:

```sql
SELECT migrate_users_to_default_org();
```

## 파티션 관리

pg_partman은 `partman.run_maintenance()`를 주기적으로 실행하여:
- 미래 파티션을 미리 생성
- 보존 기간이 지난 파티션을 자동 삭제

pg_cron이 매 시간 자동 실행합니다 (Step 5).
