'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 기존 /monitoring/top-sql → /statistics/top-sql 리다이렉트 */
export default function TopSqlRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/statistics/top-sql'); }, [router]);
  return null;
}
