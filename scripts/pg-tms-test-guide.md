# PG-TMS 통합 테스트 & AI 어드바이저 가이드

> **대상 서버**: mcseoper.iptime.org:5444 / pgdb17 / postgres
> **LLM 서버**: mcseoper.iptime.org:11434 (Ollama qwen3:8b)
> **PG-TMS 앱**: http://localhost:3001

---

## 목차

1. [사전 준비](#1-사전-준비)
2. [테스트 스키마 & 데이터 생성](#2-테스트-스키마--데이터-생성)
3. [워크로드 실행 (pg_stat_statements 축적)](#3-워크로드-실행)
4. [PG-TMS 연결 등록](#4-pg-tms-연결-등록)
5. [모니터링 기능 테스트](#5-모니터링-기능-테스트)
6. [분석 기능 테스트](#6-분석-기능-테스트)
7. [AI 어드바이저 - queryid 기반 테스트 (핵심)](#7-ai-어드바이저---queryid-기반-테스트)
8. [스냅샷 & 이상 탐지](#8-스냅샷--이상-탐지)
9. [튜닝 워크플로우](#9-튜닝-워크플로우)
10. [API 직접 테스트 (curl)](#10-api-직접-테스트-curl)
11. [정리](#11-정리)

---

## 1. 사전 준비

### 1.1 pg_stat_statements 확인

```sql
-- psql로 접속
psql -h mcseoper.iptime.org -p 5444 -U postgres -d pgdb17

-- 확장 설치 확인
SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements';

-- 데이터 존재 확인
SELECT count(*) FROM pg_stat_statements;
```

### 1.2 LLM 서버 확인

```bash
# Ollama 모델 확인
curl http://mcseoper.iptime.org:11434/api/tags

# qwen3:8b 모델이 목록에 있는지 확인
```

### 1.3 PG-TMS 앱 실행

```bash
cd /Users/nit/pg_tms/pg_tms_app
npm run dev
# http://localhost:3001 접속 확인
```

### 1.4 로그인 계정

- **이메일**: `admin@tms.com`
- **비밀번호**: `admin1234`
- (시드 데이터로 생성된 기본 관리자 계정)

---

## 2. 테스트 스키마 & 데이터 생성

### 실행

```bash
cd /Users/nit/pg_tms/pg_tms_app/scripts

# 비밀번호 입력 방식
psql -h mcseoper.iptime.org -p 5444 -U postgres -d pgdb17 -f 01-setup-test-schema.sql

# 또는 환경변수 사용
export PGPASSWORD="your_password"
psql -h mcseoper.iptime.org -p 5444 -U postgres -d pgdb17 -f 01-setup-test-schema.sql
```

### 생성되는 테이블

| 테이블 | 행 수 | 의도적 문제점 |
|--------|-------|-------------|
| `test_customers` | 100,000 | `region`, `status` 인덱스 없음 |
| `test_products` | 1,000 | 정상 (category 인덱스 있음) |
| `test_orders` | 500,000 | `customer_id`, `order_date`, `status` 인덱스 없음 |
| `test_order_items` | 1,000,000 | `order_id`, `product_id` FK 인덱스 없음 |

### 확인

```sql
SELECT relname, n_live_tup
FROM pg_stat_user_tables
WHERE relname LIKE 'test_%'
ORDER BY n_live_tup DESC;
```

---

## 3. 워크로드 실행

워크로드를 반복 실행하여 `pg_stat_statements`에 의미 있는 통계를 축적합니다.

### 실행

```bash
cd /Users/nit/pg_tms/pg_tms_app/scripts

# 실행 권한 부여
chmod +x 03-run-workload.sh

# 비밀번호 설정 후 실행
export PGPASSWORD="your_password"
./03-run-workload.sh
```

### 실행되는 쿼리 (7종)

| 번호 | 패턴 | 반복 횟수 | PG-TMS에서 보이는 특징 |
|------|------|----------|----------------------|
| Q1 | Full Table Scan | 50회 | 높은 `shared_blks_read`, Seq Scan |
| Q2 | Missing FK Index JOIN | 50회 | 높은 `total_exec_time` |
| Q3 | N+1 패턴 | 1,000회 | 매우 높은 `calls` |
| Q4 | 4-Way Complex JOIN | 30회 | 높은 `total_exec_time`, temp 사용 |
| Q5 | Subquery Anti-pattern | 50회 | SubPlan 노드 |
| Q6 | 대량 GROUP BY | 30회 | HashAggregate, 높은 블록 읽기 |
| Q7 | Correlated Subquery | 10회 | 극단적 높은 `mean_exec_time` |

### 실행 후 확인

```sql
-- Top 10 쿼리 확인 (total_exec_time 기준)
SELECT
    queryid,
    LEFT(query, 80) AS query_preview,
    calls,
    ROUND(total_exec_time::NUMERIC, 2) AS total_time_ms,
    ROUND(mean_exec_time::NUMERIC, 2) AS avg_time_ms,
    rows
FROM pg_stat_statements
WHERE query LIKE '%test_%'
  AND query NOT LIKE '%pg_stat_statements%'
ORDER BY total_exec_time DESC
LIMIT 10;
```

> **이 결과에서 보이는 `queryid`를 메모하세요!** 이후 AI 어드바이저 테스트에서 사용합니다.

---

## 4. PG-TMS 연결 등록

### UI 방법 (권장)

1. http://localhost:3001 접속 → 로그인
2. 좌측 메뉴 → **연결 관리** (`/connections`)
3. **"연결 추가"** 버튼 클릭
4. 아래 정보 입력:

| 항목 | 값 |
|------|-----|
| 연결 이름 | `테스트 서버` |
| 호스트 | `mcseoper.iptime.org` |
| 포트 | `5444` |
| 데이터베이스 | `pgdb17` |
| 사용자 | `postgres` |
| 비밀번호 | (입력) |
| SSL 모드 | `prefer` |

5. **"연결 테스트"** 클릭 → `pg_stat_statements 활성화: ✅` 확인
6. **저장**

### 연결 등록 후

- 상단 데이터베이스 선택기에서 **"테스트 서버"** 선택
- 이제 모든 모니터링/분석 기능이 이 서버를 대상으로 작동

---

## 5. 모니터링 기능 테스트

### 5.1 실시간 모니터링

**경로**: 좌측 메뉴 → 모니터링 → 실시간 (`/monitoring/realtime`)

**확인 포인트**:
- Cache Hit Ratio (보통 99%+)
- Active Backends 수
- 초당 트랜잭션 수 (TPS)
- Deadlock 발생 여부

### 5.2 Top SQL ⭐ (가장 중요)

**경로**: 모니터링 → Top SQL (`/monitoring/top-sql`)

**확인 포인트**:
1. **정렬 기준**: `total_exec_time` 선택
2. 워크로드에서 실행한 test 쿼리들이 상위에 표시
3. 각 쿼리의 **`queryid`** 확인 (숫자 형태, 예: `1234567890`)
4. `calls` 컬럼에서 Q3 (N+1 패턴)이 가장 높은 호출 수 확인
5. **가장 느린 쿼리의 queryid를 메모** → AI 어드바이저에서 사용

### 5.3 세션 모니터링

**경로**: 모니터링 → 세션 (`/monitoring/sessions`)

- 현재 활성 세션 목록
- 워크로드 실행 중이면 `active` 상태 세션 확인 가능

### 5.4 테이블 통계

**경로**: 모니터링 → 테이블 (`/monitoring/tables`)

**확인 포인트**:
- `test_orders`의 `seq_scan` 횟수가 매우 높은지 확인
- `test_order_items`의 `seq_scan` 확인
- `n_dead_tup` (dead tuple) 현황

### 5.5 Vacuum 상태

**경로**: 모니터링 → Vacuum (`/monitoring/vacuum`)

- 각 테이블의 마지막 VACUUM/ANALYZE 시간
- dead tuple 비율

---

## 6. 분석 기능 테스트

### 6.1 실행계획 분석 ⭐

**경로**: 분석 → 실행계획 (`/analysis/execution-plan`)

**테스트 방법**:
1. 아래 SQL 입력 (Q1 - Full Table Scan):
   ```sql
   SELECT id, customer_id, amount, order_date
   FROM test_orders
   WHERE status = 'pending'
     AND order_date > NOW() - INTERVAL '30 days';
   ```
2. **"Plan Only"** 클릭 → 실행계획 트리 확인
3. **"Analyze"** 클릭 → 실제 실행 + 실측치 비교

**예상 결과**:
- `Seq Scan on test_orders` 노드 (빨간색 하이라이트)
- `Filter` 조건에 `status = 'pending'` 표시
- `Rows Removed by Filter` 값이 매우 높음

### 6.2 복잡한 JOIN 실행계획

```sql
SELECT c.name, p.name, oi.quantity, o.order_date, o.amount
FROM test_order_items oi
JOIN test_orders o ON o.id = oi.order_id
JOIN test_customers c ON c.id = o.customer_id
JOIN test_products p ON p.id = oi.product_id
WHERE o.order_date BETWEEN '2025-01-01' AND '2025-06-30'
ORDER BY o.amount DESC
LIMIT 100;
```

**확인**: Hash Join, Nested Loop 노드, Sort 노드의 비용 확인

### 6.3 SQL 상세 (queryid로 접근)

**경로**: Top SQL에서 특정 쿼리 클릭 → SQL 상세 (`/analysis/sql/[queryid]`)

- 해당 queryid의 시계열 성능 추이
- 호출 횟수, 평균 실행 시간 변화

---

## 7. AI 어드바이저 - queryid 기반 테스트

> **핵심 워크플로우**: Top SQL에서 queryid 확인 → AI 어드바이저에서 분석

### 7.1 AI Chat (대화형 분석) ⭐

**경로**: AI 어드바이저 → AI Chat (`/ai-advisor/chat`)

**테스트 시나리오**:

#### 시나리오 A: 느린 쿼리 조회 요청
```
가장 느린 쿼리 5개를 보여주세요
```
→ AI가 `query_stats` 도구를 사용하여 pg_stat_statements 조회
→ Top 5 쿼리 목록 + queryid 반환

#### 시나리오 B: 특정 쿼리 EXPLAIN 분석
```
queryid XXXXXXXXX 쿼리의 실행계획을 분석해주세요
```
(XXXXXXXXX = Top SQL에서 확인한 실제 queryid)
→ AI가 `explain_query` 도구로 EXPLAIN 실행
→ 실행계획 해석 + 튜닝 권고

#### 시나리오 C: 테이블 인덱스 분석
```
test_orders 테이블의 구조와 인덱스를 분석하고, 필요한 인덱스를 추천해주세요
```
→ AI가 `table_info` + `index_info` 도구 사용
→ 누락된 인덱스 DDL 제공

#### 시나리오 D: 특정 SQL 최적화
```
아래 SQL을 최적화해주세요:
SELECT id, customer_id, amount
FROM test_orders
WHERE customer_id IN (
  SELECT id FROM test_customers WHERE region = '서울' AND status = 'inactive'
);
```
→ JOIN으로 재작성된 SQL + EXPLAIN 비교 제공

### 7.2 Auto-Tuning (자동 분석)

**경로**: AI 어드바이저 → Auto-Tuning (`/ai-advisor/auto-tuning`)

1. **Top-N 선택**: `5` (Top 5 쿼리)
2. **정렬 기준**: `total_exec_time`
3. **"분석 시작"** 클릭

**결과 확인**:
- 각 쿼리별 우선순위 (HIGH / MEDIUM / LOW)
- 문제점 요약
- 인덱스 DDL 제안
- SQL 재작성 제안
- 예상 개선율 (%)

### 7.3 Index Advisor (인덱스 추천)

**경로**: AI 어드바이저 → Index Advisor (`/ai-advisor/index-advisor`)

1. **"분석 시작"** 클릭

**예상 결과**:
- **추천 인덱스**:
  - `CREATE INDEX idx_orders_customer_id ON test_orders(customer_id);`
  - `CREATE INDEX idx_orders_status_date ON test_orders(status, order_date);`
  - `CREATE INDEX idx_customers_region ON test_customers(region);`
  - `CREATE INDEX idx_order_items_order_id ON test_order_items(order_id);`
- **미사용 인덱스**: (있다면 표시)

### 7.4 Tuning Guide (튜닝 가이드)

**경로**: AI 어드바이저 → Tuning Guide (`/ai-advisor/tuning-guide`)

1. **SQL 입력** (Q2 - Missing FK Index JOIN):
   ```sql
   SELECT c.name, c.region, COUNT(o.id), SUM(o.amount)
   FROM test_customers c
   JOIN test_orders o ON o.customer_id = c.id
   WHERE c.region = '서울'
   GROUP BY c.name, c.region
   ORDER BY SUM(o.amount) DESC
   LIMIT 20;
   ```
2. **컨텍스트 선택**: `tuning` (성능 분석)
3. **"분석"** 클릭 → 스트리밍 응답

**다른 컨텍스트로도 테스트**:
- `explain`: 실행계획 해석 요청
- `index`: 인덱스 설계 요청
- `rewrite`: SQL 재작성 요청

### 7.5 Query Artifacts (쿼리 아티팩트)

**경로**: AI 어드바이저 → Query Artifacts (`/ai-advisor/query-artifacts`)

1. SQL 입력 (Q4 - Complex JOIN):
   ```sql
   SELECT c.name, p.name, oi.quantity, o.order_date
   FROM test_order_items oi
   JOIN test_orders o ON o.id = oi.order_id
   JOIN test_customers c ON c.id = o.customer_id
   JOIN test_products p ON p.id = oi.product_id
   WHERE o.order_date BETWEEN '2025-01-01' AND '2025-06-30'
   ORDER BY o.amount DESC LIMIT 100;
   ```

**결과 확인**:
- 관련 테이블 목록 (스키마, 별칭, 컬럼 사용)
- JOIN 관계도 (유형, 카디널리티)
- 기존 인덱스 현황
- 누락 인덱스 추천
- 접근 경로 분석
- 쿼리 건강 점수 (0~100)

---

## 8. 스냅샷 & 이상 탐지

### 8.1 스냅샷 생성

**경로**: 스냅샷 (`/snapshots`)

1. **"스냅샷 생성"** 버튼을 **6회 이상** 클릭 (각 10초 간격)
2. 스냅샷 목록에서 생성된 스냅샷 확인
3. 각 스냅샷의 메트릭: Cache Hit Ratio, Active Sessions, TPS, Deadlocks

### 8.2 스냅샷 비교

**경로**: 스냅샷 → 비교 (`/snapshots/compare`)

- 두 스냅샷을 선택하여 메트릭 변화 비교
- 워크로드 실행 전/후 스냅샷 비교 시 의미 있는 변화 확인

### 8.3 이상 탐지 (Anomaly Detection)

**경로**: AI 어드바이저 → 이상 탐지 (`/ai-advisor/anomaly`)

**전제 조건**: 스냅샷 5개 이상 존재해야 함

1. **"분석 시작"** 클릭
2. Z-Score 기반 이상 탐지 수행
3. 감시 메트릭: `activeBackends`, `cacheHitRatio`, `deadlocks`, `txRolledBack`

**이상치 생성 팁** (더 명확한 결과를 위해):
```bash
# 스냅샷 5개 생성 후, 대량 워크로드 실행
./03-run-workload.sh

# 워크로드 중에 추가 스냅샷 생성 → 이상치 감지 가능
```

---

## 9. 튜닝 워크플로우

### 9.1 튜닝 태스크 등록

**경로**: 튜닝 → SQL 등록 (`/tuning/register`)

1. Top SQL에서 확인한 queryid 입력
2. 우선순위: `HIGH`
3. 개선 전 메트릭 자동 수집 (calls, total_exec_time, mean_exec_time)

### 9.2 인덱스 생성 (튜닝 적용)

AI 어드바이저가 추천한 인덱스를 실제로 생성:

```sql
-- psql에서 실행
psql -h mcseoper.iptime.org -p 5444 -U postgres -d pgdb17

-- AI가 추천한 인덱스들 생성
CREATE INDEX CONCURRENTLY idx_orders_customer_id ON test_orders(customer_id);
CREATE INDEX CONCURRENTLY idx_orders_status_date ON test_orders(status, order_date);
CREATE INDEX CONCURRENTLY idx_customers_region ON test_customers(region);
CREATE INDEX CONCURRENTLY idx_customers_status ON test_customers(status);
CREATE INDEX CONCURRENTLY idx_order_items_order_id ON test_order_items(order_id);
CREATE INDEX CONCURRENTLY idx_order_items_product_id ON test_order_items(product_id);

-- 통계 갱신
ANALYZE test_customers;
ANALYZE test_orders;
ANALYZE test_order_items;
```

### 9.3 개선 효과 확인

```bash
# pg_stat_statements 리셋
psql -h mcseoper.iptime.org -p 5444 -U postgres -d pgdb17 \
  -c "SELECT pg_stat_statements_reset();"

# 워크로드 재실행
./03-run-workload.sh

# 결과 비교: 인덱스 생성 전후 total_exec_time, mean_exec_time 변화
```

PG-TMS에서:
1. Top SQL 다시 확인 → 실행 시간 감소 확인
2. 실행계획 → Index Scan으로 변경 확인
3. 튜닝 태스크에서 **"완료"** 처리 + 개선율 기록

---

## 10. API 직접 테스트 (curl)

### 10.1 인증 토큰 획득

PG-TMS는 NextAuth 세션 쿠키 기반 인증을 사용합니다.

```bash
# 1단계: CSRF 토큰 획득
CSRF=$(curl -s http://localhost:3001/api/auth/csrf | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")

# 2단계: 로그인 + 세션 쿠키 저장
curl -s -c cookies.txt \
  -X POST http://localhost:3001/api/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=$CSRF&email=admin@tms.com&password=admin1234&json=true"

# 이후 모든 요청에 -b cookies.txt 사용
```

### 10.2 연결 테스트

```bash
curl -s -b cookies.txt \
  -X POST http://localhost:3001/api/pg/connections/test \
  -H "Content-Type: application/json" \
  -d '{
    "host": "mcseoper.iptime.org",
    "port": 5444,
    "database": "pgdb17",
    "username": "postgres",
    "password": "YOUR_PASSWORD"
  }' | python3 -m json.tool
```

### 10.3 Top SQL 조회

```bash
# CONNECTION_ID는 연결 등록 후 반환된 UUID
CONNECTION_ID="YOUR_CONNECTION_UUID"

curl -s -b cookies.txt \
  "http://localhost:3001/api/monitoring/sql-statistics?connection_id=$CONNECTION_ID&order_by=total_exec_time&limit=10" \
  | python3 -m json.tool
```

### 10.4 EXPLAIN 실행

```bash
curl -s -b cookies.txt \
  -X POST http://localhost:3001/api/pg/explain \
  -H "Content-Type: application/json" \
  -d '{
    "connection_id": "'$CONNECTION_ID'",
    "sql": "SELECT id, customer_id, amount FROM test_orders WHERE status = '\''pending'\'' AND order_date > NOW() - INTERVAL '\''30 days'\''",
    "analyze": false
  }' | python3 -m json.tool
```

### 10.5 AI 분석 (queryid 기반) ⭐

```bash
# QUERYID는 Top SQL에서 확인한 값
QUERYID="YOUR_QUERYID"

curl -s -b cookies.txt \
  -X POST http://localhost:3001/api/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "type": "sql",
    "connection_id": "'$CONNECTION_ID'",
    "metrics": {
      "queryid": '$QUERYID',
      "query": "SELECT id, customer_id, amount FROM test_orders WHERE status = '\''pending'\''",
      "calls": 50,
      "total_exec_time": 5000,
      "mean_exec_time": 100,
      "rows": 80000,
      "shared_blks_read": 10000,
      "shared_blks_hit": 500
    }
  }' | python3 -m json.tool
```

### 10.6 Auto-Tuning

```bash
curl -s -b cookies.txt \
  -X POST http://localhost:3001/api/ai/auto-tuning \
  -H "Content-Type: application/json" \
  -d '{
    "connection_id": "'$CONNECTION_ID'",
    "top_n": 5,
    "order_by": "total_exec_time"
  }' | python3 -m json.tool
```

### 10.7 AI Chat (대화형)

```bash
curl -s -b cookies.txt \
  -X POST http://localhost:3001/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "connection_id": "'$CONNECTION_ID'",
    "message": "test_orders 테이블에서 가장 느린 쿼리를 분석하고 인덱스를 추천해주세요"
  }' | python3 -m json.tool
```

### 10.8 Index Advisor

```bash
curl -s -b cookies.txt \
  -X POST http://localhost:3001/api/ai/index-advisor \
  -H "Content-Type: application/json" \
  -d '{
    "connection_id": "'$CONNECTION_ID'"
  }' | python3 -m json.tool
```

### 10.9 Tuning Guide (SSE 스트리밍)

```bash
# SSE 스트리밍 응답이므로 -N 옵션 사용
curl -s -N -b cookies.txt \
  -X POST http://localhost:3001/api/ai/tuning-guide \
  -H "Content-Type: application/json" \
  -d '{
    "connection_id": "'$CONNECTION_ID'",
    "sql_text": "SELECT c.name, COUNT(o.id), SUM(o.amount) FROM test_customers c JOIN test_orders o ON o.customer_id = c.id WHERE c.region = '\''서울'\'' GROUP BY c.name ORDER BY SUM(o.amount) DESC LIMIT 20",
    "context": "tuning"
  }'
```

### 10.10 Query Artifacts

```bash
# ⚠️ 주의: 이 API는 connectionId (camelCase) 사용
curl -s -b cookies.txt \
  -X POST http://localhost:3001/api/ai/query-artifacts \
  -H "Content-Type: application/json" \
  -d '{
    "connectionId": "'$CONNECTION_ID'",
    "sql": "SELECT c.name, p.name, oi.quantity, o.order_date FROM test_order_items oi JOIN test_orders o ON o.id = oi.order_id JOIN test_customers c ON c.id = o.customer_id JOIN test_products p ON p.id = oi.product_id WHERE o.order_date BETWEEN '\''2025-01-01'\'' AND '\''2025-06-30'\'' ORDER BY o.amount DESC LIMIT 100"
  }' | python3 -m json.tool
```

### 10.11 스냅샷 생성

```bash
# 5회 반복 생성 (이상 탐지를 위해)
for i in $(seq 1 6); do
  echo "스냅샷 $i/6 생성..."
  curl -s -b cookies.txt \
    -X POST http://localhost:3001/api/snapshots \
    -H "Content-Type: application/json" \
    -d '{"connection_id": "'$CONNECTION_ID'"}' > /dev/null
  sleep 10
done
echo "✅ 6개 스냅샷 생성 완료"
```

### 10.12 이상 탐지

```bash
curl -s -b cookies.txt \
  -X POST http://localhost:3001/api/ai/anomaly \
  -H "Content-Type: application/json" \
  -d '{
    "connection_id": "'$CONNECTION_ID'"
  }' | python3 -m json.tool
```

---

## 11. 정리

### 테스트 데이터 삭제

```bash
psql -h mcseoper.iptime.org -p 5444 -U postgres -d pgdb17 -f 04-cleanup.sql
```

### 인덱스만 삭제 (튜닝 전후 비교 시)

```sql
DROP INDEX IF EXISTS idx_orders_customer_id;
DROP INDEX IF EXISTS idx_orders_status_date;
DROP INDEX IF EXISTS idx_customers_region;
DROP INDEX IF EXISTS idx_customers_status;
DROP INDEX IF EXISTS idx_order_items_order_id;
DROP INDEX IF EXISTS idx_order_items_product_id;
```

---

## 주의사항

| 항목 | 내용 |
|------|------|
| API 파라미터 | `query-artifacts`만 `connectionId` (camelCase), 나머지는 `connection_id` (snake_case) |
| LLM 서버 | AI 기능은 Ollama 서버(mcseoper.iptime.org:11434) 가동 필수 |
| 이상 탐지 | 최소 5개 스냅샷 존재해야 분석 가능 |
| 워크로드 시간 | 전체 워크로드 실행에 약 10-30분 소요 (서버 성능에 따라 상이) |
| EXPLAIN ANALYZE | 실제 쿼리를 실행하므로 운영 환경에서는 주의 (PG-TMS는 read-only 트랜잭션 사용) |
| 인코딩 | 한국어 데이터 포함 → UTF-8 환경 필수 |

---

## 빠른 시작 요약

```bash
# 1. 스키마 + 데이터 생성 (1회)
export PGPASSWORD="your_password"
psql -h mcseoper.iptime.org -p 5444 -U postgres -d pgdb17 -f 01-setup-test-schema.sql

# 2. 워크로드 실행 (pg_stat_statements 축적)
chmod +x 03-run-workload.sh
./03-run-workload.sh

# 3. PG-TMS 접속 → 연결 등록 → Top SQL에서 queryid 확인

# 4. AI 어드바이저에서 queryid 기반 분석!
```
