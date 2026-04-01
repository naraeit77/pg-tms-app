'use client';

import { useRouter } from 'next/navigation';
import { Settings, Database, Camera, Shield, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const settingsItems = [
  {
    title: 'DB 연결 관리',
    description: 'PostgreSQL 데이터베이스 연결 추가, 수정, 삭제',
    href: '/connections',
    icon: Database,
  },
  {
    title: '스냅샷 설정',
    description: '자동 스냅샷 수집 스케줄러 관리',
    href: '/snapshots/settings',
    icon: Camera,
  },
];

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" /> 환경설정
        </h1>
        <p className="text-muted-foreground">시스템 설정 및 관리</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {settingsItems.map((item) => (
          <Card
            key={item.href}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => router.push(item.href)}
          >
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <div className="p-2 rounded-md bg-muted">
                <item.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-base">{item.title}</CardTitle>
                <CardDescription className="text-sm">{item.description}</CardDescription>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" /> 시스템 정보
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">버전</span>
              <p className="font-mono font-medium">1.0.0</p>
            </div>
            <div>
              <span className="text-muted-foreground">프레임워크</span>
              <p className="font-mono font-medium">Next.js 16</p>
            </div>
            <div>
              <span className="text-muted-foreground">데이터베이스</span>
              <p className="font-mono font-medium">PostgreSQL 17</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
