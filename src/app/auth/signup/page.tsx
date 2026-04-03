'use client';

/**
 * Sign Up Page
 * 회원가입 페이지
 */

export const dynamic = 'force-dynamic';

import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Database, Loader2, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

function SignUpContent() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    // 비밀번호 확인
    if (formData.password !== formData.confirmPassword) {
      setErrorMessage('비밀번호가 일치하지 않습니다.');
      setIsLoading(false);
      return;
    }

    // 비밀번호 길이 체크
    if (formData.password.length < 8) {
      setErrorMessage('비밀번호는 최소 8자 이상이어야 합니다.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '회원가입에 실패했습니다.');
      }

      setSuccessMessage('회원가입이 완료되었습니다. 로그인 페이지로 이동합니다...');

      // 3초 후 로그인 페이지로 이동
      setTimeout(() => {
        router.push('/auth/signin?registered=true');
      }, 3000);

    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '회원가입 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.id]: e.target.value,
    });
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
          <CardTitle className="text-2xl text-center">회원가입</CardTitle>
          <CardDescription className="text-center">
            Narae PG-TMS v2.0 계정을 생성합니다
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* 에러 메시지 */}
            {errorMessage && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            {/* 성공 메시지 */}
            {successMessage && (
              <Alert className="border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-600">
                  {successMessage}
                </AlertDescription>
              </Alert>
            )}

            {/* 이름 */}
            <div className="space-y-2">
              <Label htmlFor="fullName">이름</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="홍길동"
                value={formData.fullName}
                onChange={handleChange}
                disabled={isLoading}
                required
                autoComplete="name"
                autoFocus
              />
            </div>

            {/* 이메일 */}
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={formData.email}
                onChange={handleChange}
                disabled={isLoading}
                required
                autoComplete="email"
              />
            </div>

            {/* 비밀번호 */}
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                placeholder="최소 8자 이상"
                value={formData.password}
                onChange={handleChange}
                disabled={isLoading}
                required
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                영문, 숫자, 특수문자를 포함하여 8자 이상 입력해주세요.
              </p>
            </div>

            {/* 비밀번호 확인 */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">비밀번호 확인</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="비밀번호를 다시 입력하세요"
                value={formData.confirmPassword}
                onChange={handleChange}
                disabled={isLoading}
                required
                autoComplete="new-password"
              />
            </div>

            {/* 회원가입 버튼 */}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !!successMessage}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  가입 중...
                </>
              ) : (
                '회원가입'
              )}
            </Button>
          </CardContent>
        </form>

        <CardFooter className="flex flex-col space-y-4">
          <div className="text-sm text-center text-muted-foreground">
            이미 계정이 있으신가요?{' '}
            <Link href="/auth/signin" className="text-primary hover:underline">
              로그인
            </Link>
          </div>

          <div className="text-xs text-center text-muted-foreground">
            회원가입 시{' '}
            <Link href="/terms" className="text-primary hover:underline">
              이용약관
            </Link>
            {' 및 '}
            <Link href="/privacy" className="text-primary hover:underline">
              개인정보처리방침
            </Link>
            에 동의하게 됩니다.
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function SignUpPage() {
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
      <SignUpContent />
    </Suspense>
  );
}
