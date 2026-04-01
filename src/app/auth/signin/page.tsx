'use client';

/**
 * Sign In Page
 * 로그인 페이지
 */

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Database, Loader2, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const error = searchParams.get('error');
  const registered = searchParams.get('registered');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // 회원가입 완료 후 리다이렉트된 경우 안내 메시지 표시
  useEffect(() => {
    if (registered === 'true') {
      setInfoMessage('회원가입이 완료되었습니다. 로그인해주세요.');
    }
  }, [registered]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    setInfoMessage('');

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setErrorMessage(result.error);
      } else if (result?.ok) {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (error) {
      setErrorMessage('로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const getErrorMessage = (error: string | null) => {
    if (!error) return null;

    const errors: Record<string, string> = {
      CredentialsSignin: '이메일 또는 비밀번호가 올바르지 않습니다.',
      Signin: '로그인에 실패했습니다. 다시 시도해주세요.',
      OAuthSignin: 'OAuth 로그인에 실패했습니다.',
      OAuthCallback: 'OAuth 콜백 처리에 실패했습니다.',
      OAuthCreateAccount: '계정 생성에 실패했습니다.',
      EmailCreateAccount: '이메일 계정 생성에 실패했습니다.',
      Callback: '콜백 처리 중 오류가 발생했습니다.',
      OAuthAccountNotLinked: '이미 다른 방법으로 가입된 이메일입니다.',
      EmailSignin: '이메일 로그인에 실패했습니다.',
      CredentialsSignup: '계정 생성에 실패했습니다.',
      SessionRequired: '로그인이 필요합니다.',
    };

    return errors[error] || '알 수 없는 오류가 발생했습니다.';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-slate-900 p-3 rounded-lg">
              <Database className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center">Narae PG-TMS v1.0</CardTitle>
          <CardDescription className="text-center">
            SQL Tuning Management System
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* 에러 메시지 */}
            {(error || errorMessage) && (
              <Alert variant="destructive">
                <AlertDescription>
                  {errorMessage || getErrorMessage(error)}
                </AlertDescription>
              </Alert>
            )}

            {/* 정보 메시지 */}
            {infoMessage && (
              <Alert className="border-blue-500 bg-blue-50">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-600">
                  {infoMessage}
                </AlertDescription>
              </Alert>
            )}

            {/* 이메일 */}
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            {/* 비밀번호 */}
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
                autoComplete="current-password"
              />
            </div>

            {/* 로그인 버튼 */}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  로그인 중...
                </>
              ) : (
                '로그인'
              )}
            </Button>
          </CardContent>
        </form>

        <CardFooter className="flex flex-col space-y-4">
          <div className="text-sm text-center text-muted-foreground">
            계정이 없으신가요?{' '}
            <Link href="/auth/signup" className="text-primary hover:underline">
              회원가입
            </Link>
          </div>

          <div className="text-xs text-center text-muted-foreground">
            &copy; {new Date().getFullYear()} 주식회사 나래정보기술
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-6 text-center">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
