import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  generateBuildId: async () => {
    return `pg-tms-${process.env.npm_package_version || '1.0.0'}`;
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },

  images: {
    remotePatterns: [
      {
        hostname: '**',
      },
    ],
  },

  ...(process.env.BUILD_STANDALONE === 'true' ? { output: 'standalone' as const } : {}),

  turbopack: {
    resolveAlias: {},
  },

  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      '@radix-ui/react-dialog',
      '@radix-ui/react-select',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-tabs',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-label',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-switch',
      '@radix-ui/react-toast',
      '@tanstack/react-query',
      'sonner',
      'recharts',
      'date-fns',
      '@mantine/core',
      '@mantine/hooks',
      '@mantine/dates',
      '@mantine/notifications',
      '@mantine/charts',
      '@mantine/code-highlight',
      '@mantine/nprogress',
    ],
  },

  skipProxyUrlNormalize: false,
  skipTrailingSlashRedirect: false,
};

export default nextConfig;
