'use client';

import dynamic from 'next/dynamic';

const QueryProvider = dynamic(
  () => import('@/lib/query-provider').then((m) => m.QueryProvider),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
