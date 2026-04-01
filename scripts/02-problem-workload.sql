-- ============================================================
-- PG-TMS 문제성 워크로드 쿼리 모음
-- pg_stat_statements에 축적되어 AI 어드바이저가 분석할 쿼리들
--
-- 이 파일은 직접 실행하지 않고, 03-run-workload.sh에서
-- 반복 실행하여 pg_stat_statements에 통계를 축적합니다.
-- ============================================================

-- ============================================================
-- 쿼리 1: Full Table Scan (인덱스 없는 WHERE 필터)
-- 문제점: test_orders의 status, order_date에 인덱스 없음
-- 예상 진단: Seq Scan on test_orders (500K rows)
-- AI 권고: CREATE INDEX idx_orders_status_date ON test_orders(status, order_date)
-- ============================================================
-- [Q1] Full Table Scan - status + order_date 필터
SELECT id, customer_id, amount, order_date
FROM test_orders
WHERE status = 'pending'
  AND order_date > NOW() - INTERVAL '30 days';


-- ============================================================
-- 쿼리 2: Missing FK Index JOIN
-- 문제점: test_orders.customer_id, test_customers.region에 인덱스 없음
-- 예상 진단: Hash Join 또는 Nested Loop (비효율적)
-- AI 권고: CREATE INDEX idx_orders_customer_id ON test_orders(customer_id)
--          CREATE INDEX idx_customers_region ON test_customers(region)
-- ============================================================
-- [Q2] Missing FK Index - 대량 JOIN + GROUP BY
SELECT c.name, c.region, COUNT(o.id) AS order_count, SUM(o.amount) AS total_amount
FROM test_customers c
JOIN test_orders o ON o.customer_id = c.id
WHERE c.region = '서울'
GROUP BY c.name, c.region
ORDER BY total_amount DESC
LIMIT 20;


-- ============================================================
-- 쿼리 3: N+1 패턴 (높은 calls, 개별 조회 반복)
-- 문제점: 루프에서 반복 호출되는 단일 조회
-- 예상 진단: calls 매우 높음, 개별 쿼리는 빠르지만 총 시간 큼
-- AI 권고: 배치 처리 또는 JOIN으로 변환
-- ============================================================
-- [Q3] N+1 패턴 - 개별 상품 조회 (run-workload.sh에서 1000회 반복)
SELECT id, name, category, price, stock
FROM test_products
WHERE id = 1;  -- id는 03-run-workload.sh에서 동적으로 변경


-- ============================================================
-- 쿼리 4: 4-Way Complex JOIN (대량 정렬 + temp 파일)
-- 문제점: 4개 테이블 JOIN, FK 인덱스 없음, 대량 정렬
-- 예상 진단: Sort + Hash Join 다수, temp file 사용
-- AI 권고: FK 인덱스 추가, LIMIT 추가, 필요 컬럼만 SELECT
-- ============================================================
-- [Q4] Complex JOIN - 4개 테이블 + 정렬
SELECT c.name AS customer_name,
       p.name AS product_name,
       p.category,
       oi.quantity,
       oi.unit_price,
       o.order_date,
       o.amount
FROM test_order_items oi
JOIN test_orders o ON o.id = oi.order_id
JOIN test_customers c ON c.id = o.customer_id
JOIN test_products p ON p.id = oi.product_id
WHERE o.order_date BETWEEN '2025-01-01' AND '2025-06-30'
ORDER BY o.amount DESC
LIMIT 100;


-- ============================================================
-- 쿼리 5: Subquery Anti-pattern (IN 서브쿼리)
-- 문제점: IN 서브쿼리로 비효율적 실행계획 가능
-- 예상 진단: SubPlan / Hashed SubPlan
-- AI 권고: EXISTS 또는 JOIN으로 재작성
-- ============================================================
-- [Q5] Subquery Anti-pattern - IN 서브쿼리
SELECT id, customer_id, amount, order_date, status
FROM test_orders
WHERE customer_id IN (
    SELECT id FROM test_customers
    WHERE region = '부산' AND status = 'inactive'
);


-- ============================================================
-- 쿼리 6: 대량 GROUP BY (인덱스 없는 집계)
-- 문제점: 500K 행 전체 스캔 후 GROUP BY
-- 예상 진단: Seq Scan + HashAggregate, 높은 shared_blks_read
-- AI 권고: 파티셔닝 또는 집계 인덱스 고려
-- ============================================================
-- [Q6] 대량 GROUP BY - 월별/상태별 집계
SELECT DATE_TRUNC('month', order_date) AS month,
       status,
       payment_type,
       COUNT(*) AS cnt,
       SUM(amount) AS total_amount,
       AVG(amount) AS avg_amount,
       MAX(amount) AS max_amount
FROM test_orders
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 4 DESC;


-- ============================================================
-- 쿼리 7: (보너스) Correlated Subquery - 매우 느림
-- 문제점: 상관 서브쿼리로 행마다 서브쿼리 실행
-- 예상 진단: 극도로 높은 실행 시간
-- AI 권고: 윈도우 함수 또는 JOIN으로 재작성
-- ============================================================
-- [Q7] Correlated Subquery - 고객별 최근 주문 (주의: 매우 느림, 소량만 실행)
SELECT c.id, c.name, c.region,
       (SELECT MAX(o.order_date) FROM test_orders o WHERE o.customer_id = c.id) AS last_order_date,
       (SELECT SUM(o.amount) FROM test_orders o WHERE o.customer_id = c.id) AS total_spent
FROM test_customers c
WHERE c.region = '대구'
  AND c.status = 'active'
LIMIT 50;
