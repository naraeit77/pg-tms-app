'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AIAdvisorPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/ai-advisor/chat');
  }, [router]);

  return null;
}
