'use client';

/**
 * Dashboard Header Component
 * PG-TMS 대시보드 헤더 - 반응형 풀스크린
 */

import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, User, Settings, ChevronDown, Menu } from 'lucide-react';
import { DatabaseSelector } from '@/components/database/database-selector';
import { useSidebarStore } from '@/lib/stores/sidebar-store';

interface DashboardHeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string;
  };
}

export default function DashboardHeader({ user }: DashboardHeaderProps) {
  const router = useRouter();

  const initials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : user.email?.[0].toUpperCase() || 'U';

  const roleLabel =
    user.role === 'admin' ? '관리자' : user.role === 'tuner' ? '튜너' : '뷰어';

  return (
    <header className="bg-[#070d1a] text-white shadow-lg sticky top-0 z-50 border-b border-border">
      <div className="flex items-center justify-between px-4 py-2 gap-2">
        {/* Left: Mobile menu + Logo + Title */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <MobileMenuButton />
          <span className="text-xl leading-none">🐘</span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold leading-tight whitespace-nowrap">
              Narae PG-TMS
            </h1>
            <p className="text-[10px] text-muted-foreground leading-tight hidden lg:block">
              PostgreSQL SQL Tuning Management System
            </p>
          </div>
        </div>

        {/* Center: DB Selector - grows to fill space */}
        <div className="flex items-center gap-2 flex-1 justify-center min-w-0 max-w-xl">
          <span className="text-xs font-medium text-muted-foreground hidden sm:inline flex-shrink-0">
            DB선택
          </span>
          <DatabaseSelector />
        </div>

        {/* Right: User Info */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/10 transition-colors">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-slate-700 text-white text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left hidden md:block">
                  <div className="text-xs font-medium leading-tight truncate max-w-[100px]">
                    {user.name || user.email}
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-tight">
                    {roleLabel}
                  </div>
                </div>
                <ChevronDown className="h-3 w-3 text-muted-foreground hidden md:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48" align="end">
              {/* Mobile: show user info in menu */}
              <div className="md:hidden px-2 py-1.5">
                <div className="text-sm font-medium">
                  {user.name || user.email}
                </div>
                <div className="text-xs text-muted-foreground">{roleLabel}</div>
              </div>
              <DropdownMenuSeparator className="md:hidden" />
              <DropdownMenuLabel className="hidden md:block">
                내 계정
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="hidden md:block" />
              <DropdownMenuItem onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>설정</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                className="text-red-600"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>로그아웃</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

function MobileMenuButton() {
  const { toggle } = useSidebarStore();
  return (
    <button
      onClick={toggle}
      className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
      aria-label="메뉴 열기"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
