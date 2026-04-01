#!/bin/bash
# ====================================
# PG-TMS v1.0 배포 스크립트
# ====================================

set -e

echo "=========================================="
echo "  Narae PG-TMS v1.0 Installation"
echo "=========================================="

# 1. Node.js 확인
echo "[1/6] 시스템 요구사항 확인..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js 20+ 가 필요합니다."
    exit 1
fi
echo "  Node.js: $(node -v)"

# 2. 의존성 설치
echo "[2/6] 의존성 설치..."
npm ci --production=false

# 3. 환경 변수 확인
echo "[3/6] 환경 변수 확인..."
if [ ! -f ".env.local" ]; then
    cp .env.example .env.local
    echo "  .env.local을 수정한 후 다시 실행하세요."
    exit 1
fi
echo "  .env.local OK"

# 4. 데이터베이스 스키마
echo "[4/6] 데이터베이스 스키마 적용..."
npx drizzle-kit push --force
echo "  스키마 적용 완료"

# 5. 시드 데이터
echo "[5/6] 시드 데이터..."
npx tsx src/db/seed.ts 2>/dev/null || true

# 6. 빌드
echo "[6/6] 프로덕션 빌드..."
npm run build

echo ""
echo "=========================================="
echo "  PG-TMS v1.0 설치 완료!"
echo "=========================================="
echo "  npm start               # 서버 시작"
echo "  docker compose up -d    # Docker 시작"
echo "=========================================="
