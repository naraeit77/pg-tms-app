/**
 * API 인가 미들웨어 헬퍼
 */

import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { NextResponse } from 'next/server';

/**
 * 세션 확인 + 역할 기반 인가
 */
export async function requireAuth(requiredRole?: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { authorized: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null };
  }

  if (requiredRole && session.user.role !== requiredRole && session.user.role !== 'admin') {
    return { authorized: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), session: null };
  }

  return { authorized: true, response: null, session };
}

/**
 * 관리자 전용 인가
 */
export async function requireAdmin() {
  return requireAuth('admin');
}
