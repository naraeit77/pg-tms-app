'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ChevronRight, Home } from 'lucide-react';

const pathLabels: Record<string, string> = {
  dashboard: '대시보드',
  map: '인스턴스 맵',
  instance: '인스턴스 모니터링',
  multi: '멀티 인스턴스 모니터링',
  'slow-query': '슬로우 쿼리',
  analysis: '분석',
  'count-trend': 'Count Trend 비교',
  locks: '락 트리',
  'session-history': '세션 히스토리',
  'wait-events': 'Wait 분석',
  vacuum: 'Vacuum 분석',
  'top-objects': 'Top 오브젝트',
  compare: 'Top SQL 비교',
  parameters: 'DB 파라미터',
  'execution-plan': 'EXPLAIN 뷰어',
  search: 'SQL 검색',
  statistics: '통계/보고서',
  'top-sql': 'Top SQL',
  'sql-stats': 'SQL 통계',
  'db-size': 'DB 사이즈',
  reports: '보고서',
  'ai-advisor': 'AI 어드바이저',
  chat: 'AI 챗봇',
  'auto-tuning': '자동 튜닝',
  'index-advisor': '인덱스 추천',
  anomaly: '이상 탐지',
  prediction: '성능 예측',
  snapshots: '스냅샷',
  settings: '스냅샷 설정',
  tuning: '튜닝 관리',
  register: 'SQL 등록',
  history: '튜닝 이력',
  connections: 'DB 연결 관리',
  monitoring: '모니터링',
};

interface BreadcrumbNavProps {
  className?: string;
}

export function BreadcrumbNav({ className }: BreadcrumbNavProps) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    const label = pathLabels[segment] || segment;
    const isLast = index === segments.length - 1;
    return { href, label, isLast };
  });

  return (
    <nav className={cn('flex items-center gap-1 text-xs text-muted-foreground', className)}>
      <Link
        href="/dashboard"
        className="hover:text-foreground transition-colors flex items-center gap-1"
      >
        <Home className="h-3 w-3" />
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          {crumb.isLast ? (
            <span className="text-foreground font-medium">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
