# Narae PG-TMS v1.0

**PostgreSQL SQL Tuning Management System** by 주식회사 나래정보기술

PostgreSQL 네이티브 모니터링 기반의 엔터프라이즈급 SQL 튜닝 관리 시스템입니다.
pg_stat_statements, pg_stat_activity, EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 등을 활용하여
실시간 성능 모니터링, AI 기반 자동 튜닝, 스냅샷 비교 분석을 제공합니다.

## 주요 기능

### 실시간 모니터링
- **대시보드** — Cache Hit Ratio, Active Sessions, Transactions, Deadlocks, DB Size
- **Top SQL** — pg_stat_statements 기반 (6가지 정렬: total_exec_time, calls, mean_exec_time 등)
- **활성 세션** — pg_stat_activity + Kill Session (pg_terminate_backend)
- **Wait Events** — wait_event_type별 집계
- **Locks** — pg_locks + Blocking PID 추적
- **실시간 모니터링** — 5초 자동 갱신
- **테이블/인덱스 통계** — Bloat%, Seq Scan vs Idx Scan, Unused Index 식별
- **Vacuum 모니터링** — Autovacuum 이력, Dead Tuples 경고

### 분석 도구
- **EXPLAIN 뷰어** — EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 재귀 트리 렌더러 + 핫스팟 강조
- **실행계획 비교** — Before/After SQL 동시 ANALYZE + 개선율 표시
- **SQL 상세** — queryid 기반 메트릭 카드 + 실행 이력
- **SQL 검색** — pg_stat_statements ILIKE 검색

### 스냅샷 시스템
- **스냅샷 생성** — 모든 수집기 실행 + 글로벌 통계 + SQL 통계 + Wait Events
- **스냅샷 비교** — 두 스냅샷 간 SQL 성능 델타 (악화/개선 쿼리 식별)
- **자동 스케줄러** — 5분 주기 수집, 90일 보관, 자동 정리

### AI 어드바이저 (8개 기능)
- **AI 챗봇** — LLM Tool Calling으로 실시간 PG 데이터 조회 + 대화형 튜닝 가이드
- **자동 튜닝** — Top-N SQL 분석 → 인덱스 DDL + SQL 재작성 + 파라미터 권고
- **인덱스 추천** — 테이블 통계 + Top SQL 분석 → 누락 인덱스 DDL + 미사용 인덱스 제거
- **이상 탐지** — Z-Score 기반 이상 감지 → AI 원인 분석 + 조치 권고
- **성능 예측** — 스냅샷 트렌드 분석 → 예측 + 용량 계획
- **SQL 분석** — SQL 메트릭 기반 성능 평가 + 이슈/권고/인덱스 제안
- **실행계획 분석** — EXPLAIN JSON 병목 노드 식별 + 개선 권고
- **AI 보고서 생성** — 글로벌 통계 + Top SQL 기반 한국어 성능 보고서

### 튜닝 관리
- **워크플로우** — IDENTIFIED → ASSIGNED → IN_PROGRESS → REVIEW → COMPLETED
- **Before/After 메트릭** — 개선율 자동 계산
- **이력 관리** — 상태 변경 + 댓글 추적

### RAG 지식 베이스
- **pgvector** 기반 벡터 유사도 검색
- PG 튜닝 기본 지식 시드 (인덱스, Vacuum, 안티패턴, 파라미터)
- 튜닝 이력 자동 임베딩

## 기술 스택

| 구분 | 기술 |
|------|------|
| Framework | Next.js 16 + React 19 + TypeScript |
| UI | Tailwind CSS 3.4 + Shadcn UI + Mantine v8 |
| Database | PostgreSQL 14+ (Drizzle ORM + pg driver) |
| Vector DB | pgvector (RAG 지식 베이스) |
| Auth | NextAuth v4 (JWT + bcrypt) |
| State | React Query 5 + Zustand 4 |
| AI/LLM | Ollama / OpenAI 호환 (Tool Calling 지원) |

## 요구사항

- **Node.js** 20+
- **PostgreSQL** 14+ (대상 DB 모니터링)
- **PostgreSQL** 17 (앱 DB — pgvector 확장 필요)
- **pg_stat_statements** 확장 (대상 DB에 설치 필요)
- **LLM 서버** — Ollama (qwen3:8b 권장) 또는 OpenAI 호환 API

## 빠른 시작

### 1. 클론 및 설치
```bash
cd pg_tms_app
npm install
```

### 2. 환경 설정
```bash
cp .env.example .env.local
# .env.local 편집: DATABASE_URL, NEXTAUTH_SECRET, ENCRYPTION_KEY, LLM 설정
```

### 3. 데이터베이스 초기화
```bash
# pgtms 데이터베이스 생성 (superuser로)
createdb -U postgres pgtms
psql -U postgres -d pgtms -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 스키마 적용 + 시드
npx drizzle-kit push --force
npx tsx src/db/seed.ts
```

### 4. 실행
```bash
npm run dev        # 개발 모드
npm run build      # 프로덕션 빌드
npm start          # 프로덕션 실행
```

### 5. 대상 DB의 pg_stat_statements 활성화
```sql
-- postgresql.conf
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all

-- 재시작 후
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

## Docker 배포

```bash
# .env 파일에 DB_PASSWORD, NEXTAUTH_SECRET, ENCRYPTION_KEY 설정
docker compose up -d
```

`pgvector/pgvector:pg17` 이미지를 사용하여 앱 DB에 vector 확장이 포함됩니다.

## 프로젝트 구조

```
src/
├── app/                        # Next.js App Router (66 routes)
│   ├── (dashboard)/            # 인증 필요 페이지
│   │   ├── dashboard/          # 메트릭 대시보드
│   │   ├── monitoring/         # 모니터링 (7 pages)
│   │   ├── analysis/           # 분석 (4 pages)
│   │   ├── snapshots/          # 스냅샷 (3 pages)
│   │   ├── ai-advisor/         # AI 어드바이저 (5 pages)
│   │   ├── tuning/             # 튜닝 관리 (3 pages)
│   │   └── connections/        # DB 연결 관리
│   └── api/                    # API Routes
├── components/                 # UI 컴포넌트 (39 Shadcn + custom)
├── db/schema/                  # Drizzle 스키마 (7 files, 29 tables)
├── lib/
│   ├── pg/                     # 대상 PG DB 연결 라이브러리
│   │   ├── client.ts           # 커넥션 풀 관리
│   │   ├── collectors/         # 7개 수집기 모듈
│   │   └── snapshot.ts         # 스냅샷 시스템
│   ├── ai/                     # AI/LLM 시스템
│   │   ├── client.ts           # LLM 클라이언트
│   │   ├── prompts/            # PG 전문가 프롬프트
│   │   ├── tools/              # 챗봇 Tool Calling
│   │   └── rag/                # RAG 파이프라인
│   └── scheduler/              # 자동 수집 스케줄러
└── hooks/                      # Custom React hooks
```

## 라이선스

Copyright 2025 주식회사 나래정보기술. All rights reserved.
