/**
 * 대시보드 쿼리 라우팅 유틸리티
 *
 * 시간 범위에 따라 최적의 메트릭 소스(테이블/뷰)를 자동 선택합니다.
 * pg_partman 파티셔닝 + Materialized View 롤업 구조와 연동.
 *
 * 롤업 체계:
 *   Raw (metrics_realtime)  → 보존 7일,  최근 1시간 이내 조회용
 *   5분 (metrics_5min MV)   → 보존 30일, 1일~7일 조회용
 *   1시간 (metrics_1hr MV)  → 보존 1년,  7일~90일 조회용
 *   1일 (metrics_1day MV)   → 보존 영구, 90일 이상 조회용
 */

export type MetricSource =
  | 'metrics_realtime'
  | 'metrics_5min'
  | 'metrics_1hr'
  | 'metrics_1day';

export type MetricGranularity = '5s' | '1min' | '5min' | '1hr' | '1day';

export interface TimeRange {
  from: Date;
  to: Date;
}

export interface QueryRouteResult {
  source: MetricSource;
  granularity: MetricGranularity;
  bucketSql: string;
  maxDataPoints: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * 시간 범위에 따라 최적의 메트릭 소스를 결정합니다.
 *
 * @example
 * // 최근 30분 → Raw 데이터
 * getMetricRoute({ from: subMinutes(now, 30), to: now })
 * // → { source: 'metrics_realtime', granularity: '5s', ... }
 *
 * // 최근 3일 → 5분 집계
 * getMetricRoute({ from: subDays(now, 3), to: now })
 * // → { source: 'metrics_5min', granularity: '5min', ... }
 */
export function getMetricRoute(timeRange: TimeRange): QueryRouteResult {
  const durationMs = timeRange.to.getTime() - timeRange.from.getTime();
  const durationHours = durationMs / HOUR_MS;

  // 최근 1시간 이내 → Raw 데이터 (5초 간격)
  if (durationHours <= 1) {
    return {
      source: 'metrics_realtime',
      granularity: '5s',
      bucketSql: `date_trunc('minute', collected_at)`,
      maxDataPoints: 720, // 1시간 / 5초
    };
  }

  // 1시간 ~ 7일 → 5분 집계
  if (durationHours <= 24 * 7) {
    return {
      source: 'metrics_5min',
      granularity: '5min',
      bucketSql: `bucket`,
      maxDataPoints: Math.ceil(durationMs / (5 * 60 * 1000)),
    };
  }

  // 7일 ~ 90일 → 1시간 집계
  if (durationHours <= 24 * 90) {
    return {
      source: 'metrics_1hr',
      granularity: '1hr',
      bucketSql: `bucket`,
      maxDataPoints: Math.ceil(durationMs / HOUR_MS),
    };
  }

  // 90일 이상 → 1일 집계
  return {
    source: 'metrics_1day',
    granularity: '1day',
    bucketSql: `bucket`,
    maxDataPoints: Math.ceil(durationMs / DAY_MS),
  };
}

/**
 * 커스텀 시간 버킷 SQL 생성 (5분, 15분 등)
 * pg_partman 환경에서 date_trunc 대신 사용
 *
 * TimescaleDB의 time_bucket() 대체:
 *   time_bucket('5 minutes', collected_at)
 *   → date_trunc('hour', collected_at) + INTERVAL '5 min' * FLOOR(...)
 */
export function timeBucketSql(intervalMinutes: number, column: string = 'collected_at'): string {
  if (intervalMinutes === 1) return `date_trunc('minute', ${column})`;
  if (intervalMinutes === 60) return `date_trunc('hour', ${column})`;
  if (intervalMinutes === 1440) return `date_trunc('day', ${column})`;

  // 커스텀 버킷: N분 단위로 내림
  return `date_trunc('hour', ${column}) + (FLOOR(EXTRACT(MINUTE FROM ${column}) / ${intervalMinutes}) * INTERVAL '${intervalMinutes} minutes')`;
}

/**
 * 메트릭 소스에 맞는 쿼리 WHERE 조건 생성
 *
 * Materialized View는 date_trunc된 bucket 컬럼으로 조회,
 * Raw 테이블은 collected_at 컬럼으로 조회
 */
export function buildTimeFilter(
  source: MetricSource,
  timeRange: TimeRange,
): { column: string; from: string; to: string } {
  const column = source === 'metrics_realtime' ? 'collected_at' : 'bucket';
  return {
    column,
    from: timeRange.from.toISOString(),
    to: timeRange.to.toISOString(),
  };
}

/**
 * 대시보드 차트에 적합한 최대 데이터 포인트 수로 그래뉼래리티 조정
 * 화면 너비 대비 과도한 데이터 포인트를 방지
 */
export function adjustGranularity(
  route: QueryRouteResult,
  maxDisplayPoints: number = 300,
): QueryRouteResult {
  if (route.maxDataPoints <= maxDisplayPoints) {
    return route;
  }

  // 데이터 포인트가 너무 많으면 상위 집계 레벨로 승격
  const ratio = route.maxDataPoints / maxDisplayPoints;

  if (route.source === 'metrics_realtime' && ratio > 2) {
    return {
      source: 'metrics_5min',
      granularity: '5min',
      bucketSql: 'bucket',
      maxDataPoints: Math.ceil(route.maxDataPoints / 60),
    };
  }

  if (route.source === 'metrics_5min' && ratio > 2) {
    return {
      source: 'metrics_1hr',
      granularity: '1hr',
      bucketSql: 'bucket',
      maxDataPoints: Math.ceil(route.maxDataPoints / 12),
    };
  }

  return route;
}
