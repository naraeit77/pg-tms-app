'use client';

import {
  isServer,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { ThemeProvider, useTheme } from 'next-themes';
import { MantineProvider, createTheme, MantineColorsTuple } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { NavigationProgress } from '@mantine/nprogress';
import { useEffect } from 'react';
import { useMantineColorScheme } from '@mantine/core';

// 브랜드 컬러 (프로젝트 primary 컬러에 맞게 조정)
const brand: MantineColorsTuple = [
  '#e5f4ff',
  '#cde2ff',
  '#9bc2ff',
  '#64a0ff',
  '#3984fe',
  '#1d72fe',
  '#0969ff',
  '#0058e4',
  '#004ecc',
  '#0043b5',
];

const mantineTheme = createTheme({
  primaryColor: 'brand',
  colors: {
    brand,
  },
  fontFamily: '"Pretendard Variable", var(--font-inter), -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif',
  fontFamilyMonospace: 'var(--font-mono), "JetBrains Mono", ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, monospace',
  defaultRadius: 'md',
  cursorType: 'pointer',
  components: {
    Button: {
      defaultProps: {
        size: 'sm',
      },
    },
    TextInput: {
      defaultProps: {
        size: 'sm',
      },
    },
    Select: {
      defaultProps: {
        size: 'sm',
      },
    },
    Table: {
      defaultProps: {
        striped: true,
        highlightOnHover: true,
        withTableBorder: true,
        withColumnBorders: false,
      },
    },
  },
});

// Mantine 컬러 스킴을 next-themes와 동기화
function MantineColorSchemeSync() {
  const { resolvedTheme } = useTheme();
  const { setColorScheme } = useMantineColorScheme();

  useEffect(() => {
    if (resolvedTheme === 'dark' || resolvedTheme === 'light') {
      setColorScheme(resolvedTheme);
    }
  }, [resolvedTheme, setColorScheme]);

  return null;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 0,
        refetchOnWindowFocus: false,
        refetchOnMount: 'always',
        refetchOnReconnect: false,
        throwOnError: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  } else {
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <MantineProvider theme={mantineTheme} defaultColorScheme="auto">
        <NavigationProgress />
        <Notifications position="top-right" zIndex={9999} />
        <ModalsProvider>
          <MantineColorSchemeSync />
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </ModalsProvider>
      </MantineProvider>
    </ThemeProvider>
  );
}
