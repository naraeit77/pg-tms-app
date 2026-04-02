import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, userProfiles, userRoles } from "@/db/schema";
import { eq } from "drizzle-orm";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "user@example.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("이메일과 비밀번호를 입력해주세요.");
        }

        // PostgreSQL에서 사용자 조회
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, credentials.email))
          .limit(1);

        if (!user) {
          throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        // bcrypt 비밀번호 검증
        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        // 사용자 프로필 + 역할 조회
        const [profile] = await db
          .select({
            id: userProfiles.id,
            email: userProfiles.email,
            fullName: userProfiles.fullName,
            roleId: userProfiles.roleId,
            isActive: userProfiles.isActive,
            roleName: userRoles.name,
            roleDisplayName: userRoles.displayName,
            permissions: userRoles.permissions,
          })
          .from(userProfiles)
          .leftJoin(userRoles, eq(userProfiles.roleId, userRoles.id))
          .where(eq(userProfiles.id, user.id))
          .limit(1);

        if (!profile) {
          // 프로필이 없으면 기본 프로필 생성
          const [viewerRole] = await db
            .select({ id: userRoles.id })
            .from(userRoles)
            .where(eq(userRoles.name, "viewer"))
            .limit(1);

          await db.insert(userProfiles).values({
            id: user.id,
            email: user.email,
            roleId: viewerRole?.id || null,
            preferences: {},
            isActive: true,
          });

          return {
            id: user.id,
            email: user.email,
            name: user.email,
            role: "viewer",
            roleId: viewerRole?.id || null,
            permissions: {},
          };
        }

        if (!profile.isActive) {
          throw new Error("비활성화된 계정입니다. 관리자에게 문의하세요.");
        }

        // 마지막 로그인 시간 업데이트
        await db
          .update(userProfiles)
          .set({ lastLoginAt: new Date() })
          .where(eq(userProfiles.id, user.id));

        return {
          id: user.id,
          email: profile.email,
          name: profile.fullName || profile.email,
          role: profile.roleName || "viewer",
          roleId: profile.roleId,
          permissions: profile.permissions || {},
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
        token.roleId = user.roleId;
        token.permissions = user.permissions;
      }
      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.id ?? '';
        session.user.email = token.email ?? '';
        session.user.name = token.name ?? '';
        session.user.role = token.role ?? 'viewer';
        session.user.roleId = token.roleId ?? null;
        session.user.permissions = token.permissions ?? {};
      }
      return session;
    },
  },

  pages: {
    signIn: "/auth/signin",
    signOut: "/auth/signout",
    error: "/auth/error",
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  secret: process.env.NEXTAUTH_SECRET,

  debug: process.env.NEXTAUTH_DEBUG === 'true',
};

// ─── NextAuth 타입 확장 (단일 테넌트) ───

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      roleId: string | null;
      permissions: Record<string, boolean>;
    };
  }

  interface User {
    role?: string;
    roleId?: string | null;
    permissions?: Record<string, boolean>;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    roleId?: string | null;
    permissions?: Record<string, boolean>;
  }
}
