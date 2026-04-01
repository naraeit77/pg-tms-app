'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 기존 /monitoring/locks → /analysis/locks 리다이렉트 */
export default function LocksRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/analysis/locks'); }, [router]);
  return null;
}
