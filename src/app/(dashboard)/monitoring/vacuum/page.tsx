'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 기존 /monitoring/vacuum → /analysis/vacuum 리다이렉트 */
export default function VacuumRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/analysis/vacuum'); }, [router]);
  return null;
}
