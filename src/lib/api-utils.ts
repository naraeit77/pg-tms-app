/**
 * API 라우트 표준 유틸리티
 * - 인증 세션 확인
 * - 연결 소유권 검증 (단일 테넌트)
 * - 표준 응답/에러 포맷
 * - 연결 에러 분류
 */

import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from './auth';
import { db } from '@/db';
import { pgConnections } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

// ─── 타입 ───

export interface AuthSession {
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    role: string;
    roleId: string | null;
    permissions: Record<string, boolean>;
  };
}

type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONNECTION_ERROR'
  | 'QUERY_ERROR'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

interface ApiErrorResponse {
  error: string;
  code: ApiErrorCode;
}

// ─── 인증 ───

/**
 * 인증된 세션 반환. 미인증 시 null.
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return session as AuthSession;
}

/**
 * 인증 필수 API에서 세션 확인 + 401 응답 반환.
 * 사용법:
 *   const { session, errorResponse } = await requireSession();
 *   if (errorResponse) return errorResponse;
 *   // session은 non-null 보장
 */
export async function requireSession(): Promise<
  { session: AuthSession; errorResponse: null } | { session: null; errorResponse: NextResponse<ApiErrorResponse> }
> {
  const session = await getAuthSession();
  if (!session) {
    return {
      session: null,
      errorResponse: apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401),
    };
  }
  return { session, errorResponse: null };
}

// ─── 연결 소유권 검증 (단일 테넌트 핵심) ───

/**
 * connectionId가 현재 사용자 소유인지 검증.
 * 성공 시 연결 정보 반환, 실패 시 에러 응답.
 */
export async function verifyConnectionOwnership(
  connectionId: string,
  userId: string
): Promise<
  | { connection: { id: string; name: string; isActive: boolean }; errorResponse: null }
  | { connection: null; errorResponse: NextResponse<ApiErrorResponse> }
> {
  if (!connectionId) {
    return {
      connection: null,
      errorResponse: apiError('connection_id가 필요합니다.', 'BAD_REQUEST', 400),
    };
  }

  const [conn] = await db
    .select({
      id: pgConnections.id,
      name: pgConnections.name,
      isActive: pgConnections.isActive,
      userId: pgConnections.userId,
    })
    .from(pgConnections)
    .where(and(eq(pgConnections.id, connectionId), eq(pgConnections.userId, userId)))
    .limit(1);

  if (!conn) {
    return {
      connection: null,
      errorResponse: apiError('연결을 찾을 수 없습니다.', 'NOT_FOUND', 404),
    };
  }

  if (!conn.isActive) {
    return {
      connection: null,
      errorResponse: apiError('비활성 상태의 연결입니다.', 'BAD_REQUEST', 400),
    };
  }

  return { connection: conn, errorResponse: null };
}

// ─── 표준 응답 ───

/**
 * 성공 응답
 */
export function apiSuccess<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * 에러 응답
 */
export function apiError(
  message: string,
  code: ApiErrorCode = 'INTERNAL_ERROR',
  status: number = 500
): NextResponse<ApiErrorResponse> {
  return NextResponse.json({ error: message, code }, { status });
}

// ─── 에러 분류 ───

const CONNECTION_ERROR_PATTERNS = [
  'Connection not found',
  'inactive',
  'ECONNREFUSED',
  'timeout',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'connection terminated',
  'Client has encountered a connection error',
  '복호화',
  'SSL',
  'password authentication failed',
  'no pg_hba.conf entry',
] as const;

/**
 * PG 관련 에러를 분류하여 적절한 응답 생성.
 * 내부 에러 메시지가 클라이언트에 노출되지 않도록 안전한 메시지로 변환.
 */
export function handlePgError(error: unknown, context: string): NextResponse<ApiErrorResponse> {
  const message = error instanceof Error ? error.message : String(error);

  // 운영 로그에는 전체 에러 기록
  console.error(`[${context}]`, message);

  const isConnectionError = CONNECTION_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern)
  );

  if (isConnectionError) {
    return apiError(
      '데이터베이스 연결에 실패했습니다. 연결 설정을 확인해주세요.',
      'CONNECTION_ERROR',
      503
    );
  }

  // pg_stat_statements 미설치 등 쿼리 에러
  if (message.includes('relation') && message.includes('does not exist')) {
    return apiError(
      '필요한 확장 또는 테이블이 설치되지 않았습니다.',
      'QUERY_ERROR',
      400
    );
  }

  // 권한 에러
  if (message.includes('permission denied')) {
    return apiError(
      '데이터베이스 접근 권한이 부족합니다.',
      'QUERY_ERROR',
      403
    );
  }

  return apiError('요청 처리 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
}

// ─── 요청 파싱 헬퍼 ───

/**
 * SearchParams에서 connection_id 추출
 */
export function getConnectionIdParam(request: Request): string | null {
  const url = new URL(request.url);
  return url.searchParams.get('connection_id');
}

/**
 * 필수 필드 검증
 */
export function validateRequired(
  body: Record<string, unknown>,
  fields: string[]
): string | null {
  const missing = fields.filter((f) => !body[f] && body[f] !== 0 && body[f] !== false);
  if (missing.length > 0) {
    return `필수 필드가 누락되었습니다: ${missing.join(', ')}`;
  }
  return null;
}
