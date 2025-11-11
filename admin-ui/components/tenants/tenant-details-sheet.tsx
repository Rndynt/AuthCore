'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import type { AdminTenant } from './types';

interface TenantMetrics {
  userCount: number;
  sessionCount: number;
  organizationCount: number;
}

interface TenantDetailsSheetProps {
  tenant: AdminTenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusVariant: Record<AdminTenant['status'], 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  suspended: 'secondary',
  deleted: 'outline',
  provisioning: 'secondary',
  failed: 'destructive',
};

export function TenantDetailsSheet({ tenant, open, onOpenChange }: TenantDetailsSheetProps) {
  const tenantId = tenant?.id;

  const metricsQuery = useQuery({
    queryKey: ['tenant-metrics', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const response = await apiClient.getTenantMetrics(tenantId);
      return response.metrics as TenantMetrics;
    },
    enabled: open && Boolean(tenantId),
    staleTime: 30_000,
  });

  const metrics = metricsQuery.data ?? null;

  const createdAt = useMemo(() => (tenant?.createdAt ? new Date(tenant.createdAt) : null), [tenant?.createdAt]);
  const updatedAt = useMemo(() => (tenant?.updatedAt ? new Date(tenant.updatedAt) : null), [tenant?.updatedAt]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Tenant details</SheetTitle>
          <SheetDescription>
            Operational insights and lifecycle metadata for <span className="font-semibold">{tenant?.name ?? '—'}</span>
          </SheetDescription>
        </SheetHeader>

        {!tenant ? (
          <div className="mt-10 text-sm text-muted-foreground">
            Select a tenant from the table to inspect its activity and configuration.
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <section className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Tenant ID</p>
                  <p className="font-mono text-sm mt-1 break-all">{tenant.id}</p>
                </div>
                <Badge variant={statusVariant[tenant.status] ?? 'outline'} className="capitalize">
                  {tenant.status}
                </Badge>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Slug</p>
                <p className="font-mono text-sm mt-1 break-all">{tenant.slug}</p>
              </div>
              {tenant.schemaName && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Database schema</p>
                  <p className="font-mono text-sm mt-1 break-all">{tenant.schemaName}</p>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-3">Usage metrics</h3>
              {metricsQuery.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {[0, 1, 2].map((item) => (
                    <Skeleton key={item} className="h-20" />
                  ))}
                </div>
              ) : metricsQuery.isError ? (
                <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  Unable to load metrics. Try again in a few moments.
                </div>
              ) : metrics ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Users</p>
                      <p className="text-2xl font-semibold mt-1">{metrics.userCount}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Active sessions</p>
                      <p className="text-2xl font-semibold mt-1">{metrics.sessionCount}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Organizations</p>
                      <p className="text-2xl font-semibold mt-1">{metrics.organizationCount}</p>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No usage metrics available.</p>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Lifecycle</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded border p-3 text-sm">
                  <p className="text-xs text-muted-foreground uppercase">Created</p>
                  <p className="mt-1 font-medium">
                    {createdAt ? createdAt.toLocaleString() : '—'}
                  </p>
                </div>
                <div className="rounded border p-3 text-sm">
                  <p className="text-xs text-muted-foreground uppercase">Last updated</p>
                  <p className="mt-1 font-medium">
                    {updatedAt ? updatedAt.toLocaleString() : '—'}
                  </p>
                </div>
              </div>
            </section>

            {tenant.metadata && Object.keys(tenant.metadata).length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Metadata</h3>
                </div>
                <Separator />
                <pre className="max-h-64 overflow-auto rounded border bg-muted p-3 text-xs">
                  {JSON.stringify(tenant.metadata, null, 2)}
                </pre>
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
