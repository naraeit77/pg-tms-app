/**
 * Dashboard Layout
 * 대시보드 공통 레이아웃 (헤더, 사이드바, 메인 컨텐츠)
 */

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import DashboardHeader from '@/components/dashboard/header';
import DashboardSidebar from '@/components/dashboard/sidebar';
import { DashboardClientWrapper } from '@/components/dashboard/dashboard-client-wrapper';
import { BreadcrumbNav } from '@/components/shared/breadcrumb-nav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/auth/signin');
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <DashboardHeader user={session.user} />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto min-w-0 min-h-0">
          <DashboardClientWrapper>
            <div className="px-4 py-3 min-w-0">
              <BreadcrumbNav className="mb-3" />
              {children}
            </div>
          </DashboardClientWrapper>
        </main>
      </div>
    </div>
  );
}
