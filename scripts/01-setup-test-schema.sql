-- ============================================================
-- PG-TMS 테스트 스키마 & 데이터 생성 스크립트
-- 대상: mcseoper.iptime.org:5444 / pgdb17 / postgres
--
-- 실행 방법:
--   psql -h mcseoper.iptime.org -p 5444 -U postgres -d pgdb17 -f 01-setup-test-schema.sql
-- ============================================================

\echo '=========================================='
\echo '  PG-TMS 테스트 환경 구성 시작'
\echo '=========================================='

-- ============================================================
-- 0. pg_stat_statements 확인 및 리셋
-- ============================================================
\echo '[0/6] pg_stat_statements 확인...'

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
    CREATE EXTENSION pg_stat_statements;
    RAISE NOTICE 'pg_stat_statements 확장 설치 완료';
  ELSE
    RAISE NOTICE 'pg_stat_statements 이미 설치됨';
  END IF;
END $$;

-- 기존 통계 리셋 (깨끗한 테스트 시작)
SELECT pg_stat_statements_reset();
\echo '  → pg_stat_statements 리셋 완료'

-- ============================================================
-- 1. 기존 테스트 테이블 삭제 (재실행 가능)
-- ============================================================
\echo '[1/6] 기존 테스트 테이블 삭제...'

DROP TABLE IF EXISTS test_order_items CASCADE;
DROP TABLE IF EXISTS test_orders CASCADE;
DROP TABLE IF EXISTS test_products CASCADE;
DROP TABLE IF EXISTS test_customers CASCADE;

-- ============================================================
-- 2. 테이블 생성
-- ============================================================
\echo '[2/6] 테이블 생성...'

-- 고객 테이블 (100K rows)
-- ⚠️ 의도적으로 region, status에 인덱스 없음 → Index Advisor가 감지
CREATE TABLE test_customers (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL,
    email       VARCHAR(100) NOT NULL UNIQUE,
    phone       VARCHAR(20),
    region      VARCHAR(20) NOT NULL,       -- 인덱스 없음 (의도적)
    status      VARCHAR(20) NOT NULL,       -- 인덱스 없음 (의도적)
    grade       VARCHAR(10) DEFAULT 'NORMAL',
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

-- 상품 테이블 (1K rows) - 잘 설계된 예시
CREATE TABLE test_products (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    category    VARCHAR(30) NOT NULL,
    price       NUMERIC(12,2) NOT NULL,
    stock       INT DEFAULT 0,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_products_category ON test_products(category);

-- 주문 테이블 (500K rows)
-- ⚠️ 의도적으로 customer_id, order_date, status에 인덱스 없음
CREATE TABLE test_orders (
    id            SERIAL PRIMARY KEY,
    customer_id   INT NOT NULL REFERENCES test_customers(id),  -- FK 인덱스 없음 (의도적)
    product_id    INT NOT NULL REFERENCES test_products(id),
    order_date    TIMESTAMP NOT NULL,       -- 인덱스 없음 (의도적)
    amount        NUMERIC(12,2) NOT NULL,
    status        VARCHAR(20) NOT NULL,     -- 인덱스 없음 (의도적)
    payment_type  VARCHAR(20) DEFAULT 'CARD',
    memo          TEXT,
    created_at    TIMESTAMP DEFAULT NOW()
);

-- 주문 상세 테이블 (1M rows)
-- ⚠️ 의도적으로 order_id, product_id에 인덱스 없음 (FK 인덱스 누락 안티패턴)
CREATE TABLE test_order_items (
    id            SERIAL PRIMARY KEY,
    order_id      INT NOT NULL REFERENCES test_orders(id),     -- FK 인덱스 없음 (의도적)
    product_id    INT NOT NULL REFERENCES test_products(id),   -- FK 인덱스 없음 (의도적)
    quantity      INT NOT NULL DEFAULT 1,
    unit_price    NUMERIC(12,2) NOT NULL,
    discount_rate NUMERIC(5,2) DEFAULT 0,
    created_at    TIMESTAMP DEFAULT NOW()
);

\echo '  → 4개 테이블 생성 완료'

-- ============================================================
-- 3. 상품 데이터 생성 (1,000건)
-- ============================================================
\echo '[3/6] 상품 데이터 생성 (1,000건)...'

INSERT INTO test_products (name, category, price, stock, is_active)
SELECT
    '상품_' || i::TEXT,
    (ARRAY['전자제품', '의류', '식품', '도서', '스포츠',
           '가구', '뷰티', '자동차용품', '완구', '문구'])[1 + (i % 10)],
    ROUND((random() * 500000 + 1000)::NUMERIC, 2),
    (random() * 1000)::INT,
    random() > 0.1
FROM generate_series(1, 1000) AS i;

\echo '  → 상품 1,000건 생성 완료'

-- ============================================================
-- 4. 고객 데이터 생성 (100,000건)
-- ============================================================
\echo '[4/6] 고객 데이터 생성 (100,000건)...'

INSERT INTO test_customers (name, email, phone, region, status, grade, created_at)
SELECT
    '고객_' || i::TEXT,
    'customer' || i || '@test.com',
    '010-' || LPAD((random() * 9999)::INT::TEXT, 4, '0') || '-' || LPAD((random() * 9999)::INT::TEXT, 4, '0'),
    (ARRAY['서울', '부산', '대구', '인천', '광주',
           '대전', '울산', '세종', '경기', '강원'])[1 + (i % 10)],
    (ARRAY['active', 'inactive', 'suspended', 'pending'])[1 + (i % 4)],
    (ARRAY['VIP', 'GOLD', 'SILVER', 'NORMAL'])[1 + (i % 4)],
    NOW() - (random() * INTERVAL '730 days')
FROM generate_series(1, 100000) AS i;

\echo '  → 고객 100,000건 생성 완료'

-- ============================================================
-- 5. 주문 데이터 생성 (500,000건)
-- ============================================================
\echo '[5/6] 주문 데이터 생성 (500,000건)... (약 1-2분 소요)'

INSERT INTO test_orders (customer_id, product_id, order_date, amount, status, payment_type, memo)
SELECT
    1 + (random() * 99999)::INT,
    1 + (random() * 999)::INT,
    NOW() - (random() * INTERVAL '730 days'),
    ROUND((random() * 1000000 + 100)::NUMERIC, 2),
    (ARRAY['pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refunded'])[1 + (i % 6)],
    (ARRAY['CARD', 'BANK', 'CASH', 'POINT'])[1 + (i % 4)],
    CASE WHEN random() > 0.7 THEN '비고_' || i::TEXT ELSE NULL END
FROM generate_series(1, 500000) AS i;

\echo '  → 주문 500,000건 생성 완료'

-- ============================================================
-- 6. 주문 상세 데이터 생성 (1,000,000건)
-- ============================================================
\echo '[6/6] 주문 상세 데이터 생성 (1,000,000건)... (약 2-3분 소요)'

INSERT INTO test_order_items (order_id, product_id, quantity, unit_price, discount_rate)
SELECT
    1 + (random() * 499999)::INT,
    1 + (random() * 999)::INT,
    1 + (random() * 10)::INT,
    ROUND((random() * 500000 + 500)::NUMERIC, 2),
    ROUND((random() * 30)::NUMERIC, 2)
FROM generate_series(1, 1000000) AS i;

\echo '  → 주문 상세 1,000,000건 생성 완료'

-- ============================================================
-- 7. 통계 정보 갱신
-- ============================================================
\echo '통계 정보 갱신 (ANALYZE)...'

ANALYZE test_customers;
ANALYZE test_products;
ANALYZE test_orders;
ANALYZE test_order_items;

\echo '  → ANALYZE 완료'

-- ============================================================
-- 8. 생성 결과 확인
-- ============================================================
\echo ''
\echo '=========================================='
\echo '  생성 결과 확인'
\echo '=========================================='

SELECT
    schemaname,
    relname AS table_name,
    n_live_tup AS row_count,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE relname LIKE 'test_%'
ORDER BY n_live_tup DESC;

\echo ''
\echo '인덱스 현황:'
SELECT
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) AS index_size
FROM pg_indexes
WHERE tablename LIKE 'test_%'
ORDER BY tablename, indexname;

\echo ''
\echo '=========================================='
\echo '  테스트 환경 구성 완료!'
\echo '  다음 단계: 02-problem-workload.sql 확인'
\echo '           03-run-workload.sh 실행'
\echo '=========================================='
