'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 기존 /monitoring/wait-events → /analysis/wait-events 리다이렉트 */
export default function WaitEventsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/analysis/wait-events'); }, [router]);
  return null;
}
