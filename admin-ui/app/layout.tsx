import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/lib/query-provider';

export const metadata: Metadata = {
  title: 'Realmio Console',
  description: 'Multi-tenant authentication system admin panel',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
