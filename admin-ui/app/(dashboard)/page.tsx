'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Building2, Activity, Clock, PlugZap, ShieldAlert, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [pruneFeedback, setPruneFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const { data: overviewData, isLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: () => apiClient.getOverview(),
  });

  const overview = overviewData?.overview;
  const metrics = overview?.metrics;
  const connections = metrics?.connections;
  const authCache = overview?.authCache;
  const waitingCount = connections?.poolStats.waitingCount ?? 0;
  const hasWaiting = waitingCount > 0;

  const statusCards = useMemo(() => ([
    {
      title: 'Provisioning',
      value: metrics?.provisioningTenants ?? 0,
      description: 'Tenants currently provisioning',
    },
    {
      title: 'Suspended',
      value: metrics?.suspendedTenants ?? 0,
      description: 'Tenants paused by admin',
    },
    {
      title: 'Failed',
      value: metrics?.failedTenants ?? 0,
      description: 'Tenants requiring attention',
    }
  ]), [metrics]);

  const metricCards = [
    {
      title: 'Total Tenants',
      value: metrics?.totalTenants ?? 0,
      icon: Building2,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Active Tenants',
      value: metrics?.activeTenants ?? 0,
      icon: Activity,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Total Users',
      value: metrics?.totalUsers ?? 0,
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      title: 'Active Sessions',
      value: metrics?.activeSessions ?? 0,
      icon: Clock,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
    {
      title: 'Active Connections',
      value: connections?.activeConnections ?? 0,
      icon: PlugZap,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-100',
    },
  ];

  const pruneMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.pruneConnections(true);
      return response as { pruned: number };
    },
    onMutate: () => {
      setPruneFeedback(null);
    },
    onSuccess: (result) => {
      setPruneFeedback({ type: 'success', message: `Pruned ${result?.pruned ?? 0} idle connection${(result?.pruned ?? 0) === 1 ? '' : 's'}.` });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: () => {
      setPruneFeedback({ type: 'error', message: 'Unable to prune idle connections. Try again shortly.' });
    },
  });

  if (isLoading) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Dashboard Overview</h2>
          <p className="text-muted-foreground">
            System-wide metrics and statistics
          </p>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Dashboard Overview</h2>
        <p className="text-muted-foreground">
          System-wide metrics and statistics
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metricCards.map((card) => {
          const Icon = card.icon;

          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {card.title}
                </CardTitle>
                <div className={`${card.bgColor} p-2 rounded-full`}>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Real-time data
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tenant Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Monitor provisioning and suspension status across all tenants.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {statusCards.map((card) => (
                <div key={card.title} className="rounded-lg border p-4">
                  <div className="text-sm font-medium text-muted-foreground">{card.title}</div>
                  <div className="text-2xl font-semibold mt-1">{card.value}</div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {card.description}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Authentication Cache</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">
                  Better Auth tenant instances cached in memory
                </p>
                <p className="text-lg font-semibold">{authCache?.cachedInstances ?? 0}</p>
              </div>
            </div>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Cached Tenants</p>
              <div className="flex flex-wrap gap-2">
                {(authCache?.tenants ?? []).length === 0 && (
                  <Badge variant="outline">None</Badge>
                )}
                {(authCache?.tenants ?? []).map((tenant: string) => (
                  <Badge key={tenant} variant="secondary">
                    {tenant}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Connection Pool</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Active tenant connections, queue depth, and idle eviction timers.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => pruneMutation.mutate()}
                disabled={pruneMutation.isPending}
              >
                {pruneMutation.isPending ? (
                  <span className="flex items-center gap-2 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin" /> Pruning...
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-xs">
                    <PlugZap className="w-4 h-4" /> Force prune
                  </span>
                )}
              </Button>
            </div>
            {pruneFeedback && (
              <Alert variant={pruneFeedback.type === 'error' ? 'destructive' : 'default'}>
                <AlertDescription>{pruneFeedback.message}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Pool Total</div>
                <div className="text-xl font-semibold mt-1">{connections?.poolStats.totalCount ?? 0}</div>
              </div>
              <div className={cn('rounded-lg border p-4', (connections?.poolStats.idleCount ?? 0) > 10 ? 'border-secondary bg-secondary/20' : undefined)}>
                <div className="text-sm text-muted-foreground">Pool Idle</div>
                <div className="text-xl font-semibold mt-1">{connections?.poolStats.idleCount ?? 0}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Idle TTL</div>
                <div className="text-xl font-semibold mt-1">
                  {connections?.idleConnectionTtlMs ? `${Math.round(connections.idleConnectionTtlMs / 60000)}m` : 'n/a'}
                </div>
              </div>
              <div className={cn('rounded-lg border p-4', hasWaiting ? 'border-destructive bg-destructive/10' : undefined)}>
                <div className="text-sm text-muted-foreground">Waiting Queue</div>
                <div className="text-xl font-semibold mt-1">{waitingCount}</div>
              </div>
            </div>
            <Separator />
            {hasWaiting && (
              <Alert variant="destructive">
                <AlertDescription>
                  {waitingCount} connection{waitingCount === 1 ? '' : 's'} waiting to acquire a Prisma client. Consider pruning idle
                  clients or scaling database capacity.
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Active Connections</p>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {(connections?.connectionDetails ?? []).map((detail: any) => (
                  <div
                    key={detail.tenantId}
                    className={cn(
                      'rounded border p-3 text-sm transition-colors',
                      detail.idleMilliseconds > (connections?.idleConnectionTtlMs ?? Infinity)
                        ? 'border-destructive bg-destructive/10'
                        : undefined
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{detail.tenantId}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={detail.totalRequests > 0 ? 'secondary' : 'outline'}>
                          {detail.totalRequests} requests
                        </Badge>
                        <Badge variant={detail.idleMilliseconds > (connections?.idleConnectionTtlMs ?? Infinity) ? 'destructive' : 'secondary'}>
                          idle {Math.max(1, Math.round(detail.idleMilliseconds / 1000))}s
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Idle {Math.round(detail.idleMilliseconds / 1000)}s • Last used {new Date(detail.lastUsedAt).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
                {(connections?.connectionDetails ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No active Prisma clients</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
