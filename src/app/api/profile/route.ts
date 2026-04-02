import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-utils';
import { db } from '@/db';
import { users, userProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/profile
 * 현재 사용자 프로필 조회
 */
export async function GET() {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const result = await db
      .select({
        id: users.id,
        email: users.email,
        created_at: users.createdAt,
        updated_at: users.updatedAt,
        role_id: userProfiles.roleId,
        full_name: userProfiles.fullName,
        department: userProfiles.department,
        phone: userProfiles.phone,
        avatar_url: userProfiles.avatarUrl,
        preferences: userProfiles.preferences,
        last_login_at: userProfiles.lastLoginAt,
        is_active: userProfiles.isActive,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.id, users.id))
      .where(eq(users.email, session.user.email!))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error) {
    console.error('[ProfileGet]', error);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

/**
 * PATCH /api/profile
 * 사용자 프로필 수정 (이름만 변경 가능)
 */
export async function PATCH(request: NextRequest) {
  try {
    const { session, errorResponse } = await requireSession();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // 사용자 ID 조회
    const userResult = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, session.user.email!))
      .limit(1);

    if (userResult.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = userResult[0].id;

    // userProfiles에서 fullName 업데이트
    const updated = await db
      .update(userProfiles)
      .set({ fullName: name, updatedAt: new Date() })
      .where(eq(userProfiles.id, userId))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    // 업데이트된 프로필 전체 조회
    const result = await db
      .select({
        id: users.id,
        email: users.email,
        created_at: users.createdAt,
        updated_at: users.updatedAt,
        role_id: userProfiles.roleId,
        full_name: userProfiles.fullName,
        department: userProfiles.department,
        phone: userProfiles.phone,
        avatar_url: userProfiles.avatarUrl,
        preferences: userProfiles.preferences,
        last_login_at: userProfiles.lastLoginAt,
        is_active: userProfiles.isActive,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.id, users.id))
      .where(eq(users.email, session.user.email!))
      .limit(1);

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error) {
    console.error('[ProfileUpdate]', error);
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
