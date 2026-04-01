'use client';

/**
 * Dashboard Sidebar - WhaTap Style Navigation
 * 대시보드(5) + 분석(10) + 통계(4) + AI(5) + 스냅샷(3) + 튜닝(3) + 하단(2)
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Search,
  BarChart3,
  Brain,
  Camera,
  Wrench,
  Database,
  Settings,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSidebarStore } from '@/lib/stores/sidebar-store';

interface NavItem {
  name: string;
  href: string;
  badge?: string;
  badgeColor?: string;
}

interface NavSection {
  title: string;
  icon: LucideIcon;
  color: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    title: '대시보드',
    icon: LayoutDashboard,
    color: '#3b82f6',
    items: [
      { name: '인스턴스 목록', href: '/dashboard' },
      { name: '인스턴스 맵', href: '/dashboard/map' },
      {
        name: '인스턴스 모니터링',
        href: '/dashboard/instance',
        badge: 'LIVE',
        badgeColor: 'bg-emerald-500',
      },
      {
        name: '멀티 인스턴스 모니터링',
        href: '/dashboard/multi',
        badge: 'LIVE',
        badgeColor: 'bg-emerald-500',
      },
      { name: '슬로우 쿼리', href: '/dashboard/slow-query' },
    ],
  },
  {
    title: '분석',
    icon: Search,
    color: '#f59e0b',
    items: [
      { name: 'Count Trend 비교', href: '/analysis/count-trend' },
      { name: '락 트리', href: '/analysis/locks' },
      { name: '세션 히스토리', href: '/analysis/session-history' },
      { name: 'Wait 분석', href: '/analysis/wait-events' },
      { name: 'Vacuum 분석', href: '/analysis/vacuum' },
      { name: 'Top 오브젝트', href: '/analysis/top-objects' },
      { name: 'Top SQL 비교', href: '/analysis/compare' },
      { name: 'DB 파라미터', href: '/analysis/parameters' },
      { name: 'EXPLAIN 뷰어', href: '/analysis/execution-plan' },
      { name: 'SQL 검색', href: '/analysis/search' },
    ],
  },
  {
    title: '통계/보고서',
    icon: BarChart3,
    color: '#10b981',
    items: [
      { name: 'Top SQL', href: '/statistics/top-sql' },
      { name: 'SQL 통계', href: '/statistics/sql-stats' },
      { name: 'DB 사이즈', href: '/statistics/db-size' },
      { name: '보고서', href: '/statistics/reports' },
    ],
  },
  {
    title: 'AI 어드바이저',
    icon: Brain,
    color: '#a855f7',
    items: [
      { name: 'AI 챗봇', href: '/ai-advisor/chat', badge: 'AI', badgeColor: 'bg-purple-500' },
      { name: 'AI 튜닝 가이드', href: '/ai-advisor/tuning-guide', badge: 'NEW', badgeColor: 'bg-indigo-500' },
      { name: 'Query Artifacts', href: '/ai-advisor/query-artifacts', badge: 'NEW', badgeColor: 'bg-indigo-500' },
      { name: '자동 튜닝', href: '/ai-advisor/auto-tuning' },
      { name: '인덱스 추천', href: '/ai-advisor/index-advisor' },
      { name: '이상 탐지', href: '/ai-advisor/anomaly' },
      { name: '성능 예측', href: '/ai-advisor/prediction' },
    ],
  },
  {
    title: '스냅샷',
    icon: Camera,
    color: '#06b6d4',
    items: [
      { name: '스냅샷 목록', href: '/snapshots' },
      { name: '스냅샷 비교', href: '/snapshots/compare' },
      { name: '스냅샷 설정', href: '/snapshots/settings' },
    ],
  },
  {
    title: '튜닝 관리',
    icon: Wrench,
    color: '#f97316',
    items: [
      { name: '튜닝 대시보드', href: '/tuning' },
      { name: 'SQL 등록', href: '/tuning/register' },
      { name: '튜닝 이력', href: '/tuning/history' },
    ],
  },
];

const bottomNav: { name: string; href: string; icon: LucideIcon }[] = [
  { name: 'DB 연결 관리', href: '/connections', icon: Database },
  { name: '환경설정', href: '/settings', icon: Settings },
];

export default function DashboardSidebar() {
  const pathname = usePathname();
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const { isOpen, isCollapsed, setOpen, toggleCollapse } = useSidebarStore();

  // Auto-open section containing active page
  useEffect(() => {
    for (const section of sections) {
      if (
        section.items.some(
          (item) => pathname === item.href || pathname.startsWith(item.href + '/')
        )
      ) {
        setOpenSections((prev) => new Set([...prev, section.title]));
      }
    }
  }, [pathname]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  // 모바일: 링크 클릭 시 사이드바 닫기
  const handleLinkClick = () => {
    if (window.innerWidth < 1024) setOpen(false);
  };

  const sidebarContent = (
    <>
      {/* Collapse toggle (desktop) */}
      <div className="hidden lg:flex items-center justify-end px-2 pt-2">
        <button
          onClick={toggleCollapse}
          className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-colors"
          title={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>
      {/* Mobile close */}
      <div className="flex lg:hidden items-center justify-between px-3 pt-3">
        <span className="text-sm font-bold text-white">메뉴</span>
        <button onClick={() => setOpen(false)} className="p-1 rounded-md text-slate-400 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      <aside className={cn(
        'bg-[#0B1120] flex flex-col flex-shrink-0 overflow-y-auto scrollbar-thin transition-all duration-200',
        // 모바일: 오버레이 사이드바
        isOpen ? 'fixed inset-y-0 left-0 z-50 w-[260px] lg:relative lg:z-auto' : 'hidden lg:flex',
        // 데스크톱: 접기 모드
        isCollapsed ? 'lg:w-[56px]' : 'lg:w-[220px]',
      )}>
        {sidebarContent}
        {/* Sections */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
        {sections.map((section) => {
          const sectionOpen = openSections.has(section.title);
          const sectionActive = section.items.some(
            (i) => pathname === i.href || pathname.startsWith(i.href + '/')
          );

          return (
            <div key={section.title}>
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.title)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors',
                  sectionActive
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                )}
              >
                <section.icon
                  className="h-4 w-4 flex-shrink-0"
                  style={{ color: section.color }}
                />
                {!isCollapsed && (
                  <>
                    <span className="flex-1 text-left truncate">{section.title}</span>
                    {sectionOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                    )}
                  </>
                )}
              </button>

              {/* Section Items */}
              {sectionOpen && !isCollapsed && (
                <div className="ml-[18px] mt-0.5 space-y-px border-l border-slate-800 pl-2.5">
                  {section.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={handleLinkClick}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-[6px] rounded-md text-[12px] transition-colors no-underline',
                          active
                            ? 'bg-blue-500/15 text-blue-400 font-medium border-l-2 border-blue-400 -ml-[11px] pl-[19px]'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
                        )}
                      >
                        <span className="truncate">{item.name}</span>
                        {item.badge && (
                          <span
                            className={cn(
                              'text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none',
                              item.badgeColor || 'bg-slate-600'
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-2 py-3 border-t border-slate-800/50 space-y-0.5">
        {bottomNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors no-underline',
              isActive(item.href)
                ? 'bg-blue-500/15 text-blue-400 font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
            )}
          >
            <item.icon className="h-4 w-4 flex-shrink-0 text-slate-500" />
            {!isCollapsed && <span className="truncate">{item.name}</span>}
          </Link>
        ))}
      </div>
    </aside>
    </>
  );
}
