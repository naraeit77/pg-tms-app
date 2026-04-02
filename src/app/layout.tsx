import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

// Mantine CSS - must be imported before Tailwind/globals.css
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/nprogress/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/code-highlight/styles.css';

// Tailwind and custom styles
import './globals.css';

import Providers from './providers';
import { AuthProvider } from '@/components/auth/auth-provider';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { ChunkErrorHandler } from './chunk-error-handler';

export const dynamic = 'force-dynamic';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Narae PG-TMS v1.0 - PostgreSQL SQL Tuning Management System',
  description: 'Narae PG-TMS - 주식회사 나래정보기술의 엔터프라이즈급 PostgreSQL SQL 튜닝 관리 시스템',
};

import { ColorSchemeScript } from '@mantine/core';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <ChunkErrorHandler />
        <Providers>
          <AuthProvider>
            {children}
            <Toaster />
            <SonnerToaster />
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
