'use client';

/**
 * Landing Page
 * PG-TMS v2.0 랜딩 페이지
 */

export const dynamic = 'force-dynamic';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react';
import { Database, Activity, Zap, Shield, ArrowRight, Code2, BarChart3, Lock, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin h-16 w-16 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <Database className="h-8 w-8 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-muted-foreground font-medium">Loading PG-TMS...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 dark:from-slate-950 dark:via-blue-950 dark:to-slate-950">
      <div className="fixed inset-0 tech-grid opacity-30 pointer-events-none" />

      {/* 헤더 */}
      <header className="relative backdrop-blur-md bg-white/70 dark:bg-slate-900/70 border-b border-slate-200/50 dark:border-slate-800/50 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="text-3xl">🐘</span>
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text">Narae PG-TMS v2.0</h1>
              <p className="text-xs text-muted-foreground">PostgreSQL SQL Tuning Management System</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" className="hover:bg-primary/10">
              <Link href="/auth/signin">로그인</Link>
            </Button>
            <Button asChild className="group">
              <Link href="/auth/signup">
                회원가입
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* 히어로 섹션 */}
      <section className="relative container mx-auto px-6 py-24 lg:py-32">
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border-primary/20 mb-8 shadow-lg">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-sm font-medium text-primary">PostgreSQL Native SQL Management</span>
          </div>

          <h2 className="text-5xl lg:text-7xl font-bold mb-8 leading-tight">
            <span className="gradient-text">PostgreSQL</span>
            <br />
            <span className="text-foreground">성능 최적화 플랫폼</span>
          </h2>

          <p className="text-lg lg:text-xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
            pg_stat_statements, EXPLAIN JSON 기반 실시간 모니터링부터
            AI 기반 자동 튜닝까지, PostgreSQL 네이티브 성능 관리 솔루션
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-12 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20">
              <Activity className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">실시간 모니터링</span>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20">
              <Bot className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">AI 챗봇 튜닝 가이드</span>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20">
              <Shield className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">스냅샷 & 비교 분석</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg" className="text-base px-8 py-6 h-auto group glow shadow-lg">
              <Link href="/auth/signup">
                무료로 시작하기
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-base px-8 py-6 h-auto glass">
              <Link href="/auth/signin">로그인</Link>
            </Button>
          </div>

          {/* Trust Indicators */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto mt-16">
            <div className="text-center p-4 rounded-xl glass">
              <div className="text-3xl font-bold gradient-text mb-1">PG 14+</div>
              <div className="text-xs text-muted-foreground">PostgreSQL 지원</div>
            </div>
            <div className="text-center p-4 rounded-xl glass">
              <div className="text-3xl font-bold gradient-text mb-1">12+</div>
              <div className="text-xs text-muted-foreground">AI 분석 기능</div>
            </div>
            <div className="text-center p-4 rounded-xl glass">
              <div className="text-3xl font-bold gradient-text mb-1">24/7</div>
              <div className="text-xs text-muted-foreground">실시간 모니터링</div>
            </div>
            <div className="text-center p-4 rounded-xl glass">
              <div className="text-3xl font-bold gradient-text mb-1">RAG</div>
              <div className="text-xs text-muted-foreground">지식 베이스</div>
            </div>
          </div>
        </div>
      </section>

      {/* 기능 카드 */}
      <section className="relative container mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h3 className="text-4xl lg:text-5xl font-bold mb-4">
            <span className="gradient-text">PostgreSQL 네이티브</span> 성능 관리
          </h3>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            pg_stat_statements, EXPLAIN JSON, pg_stat_activity 기반의 완벽한 PostgreSQL 성능 관리
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <Card className="card-hover glass border-2 border-transparent hover:border-blue-500/30 relative overflow-hidden group">
            <CardHeader className="relative">
              <div className="p-3 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-2xl w-fit mb-4 shadow-lg">
                <Activity className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle className="text-2xl font-bold mb-2">실시간 모니터링</CardTitle>
              <CardDescription className="text-base leading-relaxed">
                pg_stat_statements, pg_stat_activity 기반 실시간 성능 모니터링
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <BarChart3 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span>Top SQL (calls, total_exec_time, shared_blks)</span>
                </li>
                <li className="flex items-start gap-3">
                  <Activity className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span>Wait Events / Active Sessions 추적</span>
                </li>
                <li className="flex items-start gap-3">
                  <Database className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span>Vacuum / Bloat / 인덱스 사용률</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="card-hover glass border-2 border-transparent hover:border-purple-500/30 relative overflow-hidden group">
            <CardHeader className="relative">
              <div className="p-3 bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-2xl w-fit mb-4 shadow-lg">
                <Bot className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              </div>
              <CardTitle className="text-2xl font-bold mb-2">AI 튜닝 어드바이저</CardTitle>
              <CardDescription className="text-base leading-relaxed">
                LLM 기반 대화형 챗봇, 자동 튜닝, 인덱스 추천
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <Bot className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span>Tool-Use 기반 AI 챗봇 (실시간 DB 조회)</span>
                </li>
                <li className="flex items-start gap-3">
                  <Zap className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span>자동 튜닝: Top-N 분석 + DDL 생성</span>
                </li>
                <li className="flex items-start gap-3">
                  <Code2 className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span>RAG 지식 베이스 (pgvector)</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="card-hover glass border-2 border-transparent hover:border-green-500/30 relative overflow-hidden group md:col-span-2 lg:col-span-1">
            <CardHeader className="relative">
              <div className="p-3 bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-2xl w-fit mb-4 shadow-lg">
                <Shield className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-2xl font-bold mb-2">스냅샷 & 분석</CardTitle>
              <CardDescription className="text-base leading-relaxed">
                AWR 대안 스냅샷 시스템과 EXPLAIN JSON 실행계획 분석
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <Shield className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>주기적 스냅샷 + 델타 비교</span>
                </li>
                <li className="flex items-start gap-3">
                  <Lock className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)</span>
                </li>
                <li className="flex items-start gap-3">
                  <Database className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>이상 탐지 + 성능 예측</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 푸터 */}
      <footer className="relative glass border-t border-primary/10 mt-20">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground text-center md:text-left">
              <p>&copy; {new Date().getFullYear()} 주식회사 나래정보기술. All rights reserved.</p>
              <p className="mt-1 text-xs">PostgreSQL SQL Tuning Management System</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Database className="h-4 w-4 text-blue-500" />
                <span>PG 14+ 지원</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="h-4 w-4 text-green-500" />
                <span>실시간 모니터링</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
