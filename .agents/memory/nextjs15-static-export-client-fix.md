---
name: Next.js 15 static export client component bundling fix
description: How to fix TypeError: Cannot read properties of null (reading 'useState') during _not-found prerender in Next.js 15 output:'export'
---

# Problem
Next.js 15.5 with `output: 'export'` bundles actual client component implementations (not just stubs) into server-side chunks. When `_not-found` is prerendered, any client component that uses `useState` (e.g. QueryClientProvider) gets executed server-side, causing `TypeError: Cannot read properties of null (reading 'useState')`.

# Fix
Use `next/dynamic` with `ssr: false` to load the client component lazily, preventing it from being executed during SSR/SSG prerender:

```tsx
// app/providers.tsx
'use client';
import dynamic from 'next/dynamic';

const QueryProvider = dynamic(
  () => import('@/lib/query-provider').then((m) => m.QueryProvider),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
```

**Why:** Adding `Suspense` or moving to a separate wrapper component doesn't help — Next.js 15 still bundles the real implementation into server chunks and tries to execute it. Only `ssr: false` prevents execution during prerender.

**How to apply:** Any client component using hooks (useState, etc.) that is imported by the root layout or any server component will hit this issue in Next.js 15 + `output: 'export'`. Wrap it in `next/dynamic` with `ssr: false`.
