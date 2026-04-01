#!/bin/bash
# ============================================================
# PG-TMS 워크로드 반복 실행 스크립트
# pg_stat_statements에 통계 데이터를 축적합니다.
#
# 실행 방법:
#   chmod +x 03-run-workload.sh
#   ./03-run-workload.sh
#
# 환경 변수로 접속 정보 변경 가능:
#   PGHOST=mcseoper.iptime.org PGPORT=5444 ./03-run-workload.sh
# ============================================================

# 접속 정보 설정
PGHOST="${PGHOST:-mcseoper.iptime.org}"
PGPORT="${PGPORT:-5444}"
PGDATABASE="${PGDATABASE:-pgdb17}"
PGUSER="${PGUSER:-postgres}"

# PGPASSWORD는 환경변수로 설정하거나 .pgpass 파일 사용
# export PGPASSWORD="your_password"

PSQL="psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE -q"

echo "=========================================="
echo "  PG-TMS 워크로드 실행 스크립트"
echo "  대상: $PGHOST:$PGPORT/$PGDATABASE"
echo "=========================================="
echo ""

# 접속 확인
echo "[사전 확인] 데이터베이스 접속 테스트..."
if ! $PSQL -c "SELECT 1" > /dev/null 2>&1; then
    echo "❌ 데이터베이스 접속 실패!"
    echo "   PGPASSWORD 환경변수를 설정하거나 ~/.pgpass를 확인하세요."
    echo "   예: export PGPASSWORD='your_password'"
    exit 1
fi
echo "✅ 접속 성공"
echo ""

# 테이블 존재 확인
echo "[사전 확인] 테스트 테이블 확인..."
TABLE_COUNT=$($PSQL -t -c "SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'test_%' AND table_schema = 'public'")
TABLE_COUNT=$(echo $TABLE_COUNT | tr -d ' ')
if [ "$TABLE_COUNT" -lt 4 ]; then
    echo "❌ 테스트 테이블이 없습니다! 먼저 01-setup-test-schema.sql을 실행하세요."
    exit 1
fi
echo "✅ 테스트 테이블 $TABLE_COUNT개 확인"
echo ""

# pg_stat_statements 리셋
echo "[준비] pg_stat_statements 통계 리셋..."
$PSQL -c "SELECT pg_stat_statements_reset();" > /dev/null 2>&1
echo "✅ 리셋 완료"
echo ""

START_TIME=$(date +%s)

# ============================================================
# Q1: Full Table Scan (50회)
# ============================================================
echo "[Q1] Full Table Scan - status + order_date 필터 (50회)..."
for i in $(seq 1 50); do
    $PSQL -c "
        SELECT id, customer_id, amount, order_date
        FROM test_orders
        WHERE status = 'pending'
          AND order_date > NOW() - INTERVAL '30 days';
    " > /dev/null 2>&1
done
echo "  ✅ Q1 완료 (50회)"

# ============================================================
# Q2: Missing FK Index JOIN (50회)
# ============================================================
echo "[Q2] Missing FK Index JOIN (50회)..."
REGIONS=("서울" "부산" "대구" "인천" "광주")
for i in $(seq 1 50); do
    REGION=${REGIONS[$((i % 5))]}
    $PSQL -c "
        SELECT c.name, c.region, COUNT(o.id) AS order_count, SUM(o.amount) AS total_amount
        FROM test_customers c
        JOIN test_orders o ON o.customer_id = c.id
        WHERE c.region = '$REGION'
        GROUP BY c.name, c.region
        ORDER BY total_amount DESC
        LIMIT 20;
    " > /dev/null 2>&1
done
echo "  ✅ Q2 완료 (50회)"

# ============================================================
# Q3: N+1 패턴 (1000회) - 높은 calls 축적
# ============================================================
echo "[Q3] N+1 패턴 - 개별 상품 조회 (1000회)..."
for i in $(seq 1 1000); do
    PRODUCT_ID=$((($i % 1000) + 1))
    $PSQL -c "
        SELECT id, name, category, price, stock
        FROM test_products
        WHERE id = $PRODUCT_ID;
    " > /dev/null 2>&1
done
echo "  ✅ Q3 완료 (1000회)"

# ============================================================
# Q4: 4-Way Complex JOIN (30회)
# ============================================================
echo "[Q4] 4-Way Complex JOIN (30회)..."
for i in $(seq 1 30); do
    YEAR=$((2024 + ($i % 2)))
    MONTH=$(printf "%02d" $((($i % 6) + 1)))
    $PSQL -c "
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
        WHERE o.order_date BETWEEN '${YEAR}-${MONTH}-01' AND '${YEAR}-${MONTH}-28'
        ORDER BY o.amount DESC
        LIMIT 100;
    " > /dev/null 2>&1
done
echo "  ✅ Q4 완료 (30회)"

# ============================================================
# Q5: Subquery Anti-pattern (50회)
# ============================================================
echo "[Q5] Subquery Anti-pattern (50회)..."
STATUSES=("inactive" "suspended" "pending" "active")
for i in $(seq 1 50); do
    REGION=${REGIONS[$((i % 5))]}
    STATUS=${STATUSES[$((i % 4))]}
    $PSQL -c "
        SELECT id, customer_id, amount, order_date, status
        FROM test_orders
        WHERE customer_id IN (
            SELECT id FROM test_customers
            WHERE region = '$REGION' AND status = '$STATUS'
        );
    " > /dev/null 2>&1
done
echo "  ✅ Q5 완료 (50회)"

# ============================================================
# Q6: 대량 GROUP BY (30회)
# ============================================================
echo "[Q6] 대량 GROUP BY - 월별 집계 (30회)..."
for i in $(seq 1 30); do
    $PSQL -c "
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
    " > /dev/null 2>&1
done
echo "  ✅ Q6 완료 (30회)"

# ============================================================
# Q7: Correlated Subquery (10회만 - 매우 느림)
# ============================================================
echo "[Q7] Correlated Subquery (10회 - 느림 주의)..."
for i in $(seq 1 10); do
    REGION=${REGIONS[$((i % 5))]}
    $PSQL -c "
        SELECT c.id, c.name, c.region,
               (SELECT MAX(o.order_date) FROM test_orders o WHERE o.customer_id = c.id) AS last_order_date,
               (SELECT SUM(o.amount) FROM test_orders o WHERE o.customer_id = c.id) AS total_spent
        FROM test_customers c
        WHERE c.region = '$REGION'
          AND c.status = 'active'
        LIMIT 50;
    " > /dev/null 2>&1
done
echo "  ✅ Q7 완료 (10회)"

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "=========================================="
echo "  워크로드 실행 완료!"
echo "  소요 시간: ${ELAPSED}초"
echo "=========================================="
echo ""

# ============================================================
# 결과 확인: pg_stat_statements Top 10
# ============================================================
echo "[결과] pg_stat_statements Top 10 (total_exec_time 기준):"
echo ""
$PSQL -c "
SELECT
    queryid,
    LEFT(query, 60) AS query_preview,
    calls,
    ROUND(total_exec_time::NUMERIC, 2) AS total_time_ms,
    ROUND(mean_exec_time::NUMERIC, 2) AS avg_time_ms,
    rows,
    shared_blks_read,
    shared_blks_hit
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
  AND query NOT LIKE 'BEGIN%'
  AND query NOT LIKE 'COMMIT%'
  AND query NOT LIKE 'SET%'
  AND query NOT LIKE 'SHOW%'
  AND query LIKE '%test_%'
ORDER BY total_exec_time DESC
LIMIT 10;
"

echo ""
echo "=========================================="
echo "  다음 단계:"
echo "  1. PG-TMS에서 연결 등록 (mcseoper.iptime.org:5444/pgdb17)"
echo "  2. Top SQL 메뉴에서 queryid 확인"
echo "  3. AI 어드바이저에서 분석 실행"
echo "  → 상세 가이드: pg-tms-test-guide.md"
echo "=========================================="
