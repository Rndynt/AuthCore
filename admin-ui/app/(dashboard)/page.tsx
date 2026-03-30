'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Building2, Activity, Clock, PlugZap, ShieldAlert, Loader2, AlertTriangle, Database, TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { format, fromUnixTime } from 'date-fns';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

function formatTime(ts: number) {
  try { return format(fromUnixTime(ts / 1000), 'HH:mm'); } catch { return ''; }
}

function StatCard({ title, value, subtitle, icon: Icon, trend, trendUp }: any) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
            {trend && (
              <div className={cn('flex items-center gap-1 mt-2 text-xs', trendUp ? 'text-green-600' : 'text-red-600')}>
                {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />} {trend}
              </div>
            )}
          </div>
          <div className="p-3 bg-primary/10 rounded-full"><Icon className="h-6 w-6 text-primary" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const qc = useQueryClient();
  const [pruneFeedback, setPruneFeedback] = useState<any>(null);

  const { data: overviewData, isLoading } = useQuery({ queryKey: ['overview'], queryFn: () => apiClient.getOverview() });
  const { data: metricsData } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => { const r = await fetch('/admin/api/dashboard-metrics', { credentials: 'include' }); return r.ok ? r.json() : null; },
    refetchInterval: 5000,
  });

  const overview = overviewData?.overview;
  const metrics = overview?.metrics;
  const conn = metrics?.connections;
  const authCache = overview?.authCache;
  const data = metricsData?.metrics;

  const statusCards = useMemo(() => [
    { title: 'Provisioning', value: metrics?.provisioningTenants ?? 0 },
    { title: 'Suspended', value: metrics?.suspendedTenants ?? 0 },
    { title: 'Failed', value: metrics?.failedTenants ?? 0 },
  ], [metrics]);

  const metricCards = [
    { title: 'Total Tenants', value: metrics?.totalTenants ?? 0, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-100' },
    { title: 'Active Tenants', value: metrics?.activeTenants ?? 0, icon: Activity, color: 'text-green-600', bg: 'bg-green-100' },
    { title: 'Total Users', value: metrics?.totalUsers ?? 0, icon: Users, color: 'text-purple-600', bg: 'bg-purple-100' },
    { title: 'Active Sessions', value: metrics?.activeSessions ?? 0, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-100' },
    { title: 'DB Connections', value: conn?.activeConnections ?? 0, icon: PlugZap, color: 'text-cyan-600', bg: 'bg-cyan-100' },
  ];

  const pruneMut = useMutation({
    mutationFn: async () => apiClient.pruneConnections(true),
    onSuccess: (r: any) => { setPruneFeedback({ type: 'success', msg: `Pruned ${r?.pruned ?? 0} connections.` }); qc.invalidateQueries({ queryKey: ['overview'] }); },
    onError: () => setPruneFeedback({ type: 'error', msg: 'Failed to prune.' }),
  });

  const reqData = (data?.timeSeries?.requestsPerMinute || []).map((p: any) => ({ time: formatTime(p.timestamp), requests: p.value }));
  const respData = (data?.timeSeries?.responseTimeAvg || []).map((p: any) => ({ time: formatTime(p.timestamp), avg: Math.round(p.value) }));
  const errData = (data?.timeSeries?.errorRate || []).map((p: any) => ({ time: formatTime(p.timestamp), rate: Math.round(p.value * 10) / 10 }));
  const connData = (data?.timeSeries?.activeConnections || []).map((p: any) => ({ time: formatTime(p.timestamp), active: p.value }));
  const errDist = [
    { name: 'Success', value: Math.max(0, (data?.requests?.total || 0) - (data?.errors?.total4xx || 0) - (data?.errors?.total5xx || 0)) },
    { name: '4xx', value: data?.errors?.total4xx || 0 },
    { name: '5xx', value: data?.errors?.total5xx || 0 },
  ].filter(d => d.value > 0);

  if (isLoading) return <div className="space-y-6"><h2 className="text-2xl font-bold">Dashboard</h2><div className="grid gap-4 md:grid-cols-5">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-32" />)}</div></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold">Dashboard</h2><p className="text-muted-foreground">System metrics and performance</p></div>
        <div className="flex items-center gap-2 text-sm">
          {['overview', 'metrics', 'connections'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className={cn('px-4 py-2 rounded-md transition-colors', activeTab === t ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {metricCards.map(c => { const I = c.icon; return (
              <Card key={c.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{c.title}</CardTitle>
                  <div className={cn('p-2 rounded-full', c.bg)}><I className={cn('h-4 w-4', c.color)} /></div>
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{c.value}</div><p className="text-xs text-muted-foreground mt-1">Real-time</p></CardContent>
              </Card>
            ); })}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Tenant Health</CardTitle></CardHeader><CardContent><div className="grid gap-4 sm:grid-cols-3">{statusCards.map(c => (<div key={c.title} className="rounded-lg border p-4"><div className="text-sm font-medium text-muted-foreground">{c.title}</div><div className="text-2xl font-semibold mt-1">{c.value}</div></div>))}</div></CardContent></Card>
            <Card><CardHeader><CardTitle>Auth Cache</CardTitle></CardHeader><CardContent><div className="flex items-center gap-3"><ShieldAlert className="w-5 h-5 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">Cached instances</p><p className="text-lg font-semibold">{authCache?.cachedInstances ?? 0}</p></div></div></CardContent></Card>
          </div>
        </div>
      )}

      {activeTab === 'metrics' && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Requests/min" value={data?.requests?.perMinute ?? 0} subtitle={`Total: ${(data?.requests?.total ?? 0).toLocaleString()}`} icon={Activity} trend={data?.requests ? `${data.requests.successRate.toFixed(1)}% success` : undefined} trendUp={(data?.requests?.successRate ?? 100) > 95} />
            <StatCard title="Avg Response" value={`${data?.responseTime?.avg ?? 0}ms`} subtitle={`P95: ${data?.responseTime?.p95 ?? 0}ms`} icon={Clock} />
            <StatCard title="Error Rate" value={`${(data?.errors?.errorRate ?? 0).toFixed(2)}%`} subtitle={`4xx: ${data?.errors?.total4xx ?? 0} | 5xx: ${data?.errors?.total5xx ?? 0}`} icon={AlertTriangle} trend={(data?.errors?.errorRate ?? 0) < 1 ? 'Healthy' : 'Elevated'} trendUp={(data?.errors?.errorRate ?? 0) < 1} />
            <StatCard title="DB Connections" value={`${data?.connections?.active ?? 0}/${data?.connections?.max ?? 0}`} subtitle={`${(data?.connections?.utilization ?? 0).toFixed(1)}% utilized`} icon={Database} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-base">Request Rate</CardTitle></CardHeader><CardContent><div className="h-[250px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={reqData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="time" className="text-xs" /><YAxis className="text-xs" /><Tooltip /><Area type="monotone" dataKey="requests" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} /></AreaChart></ResponsiveContainer></div></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Response Time (ms)</CardTitle></CardHeader><CardContent><div className="h-[250px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={respData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="time" className="text-xs" /><YAxis className="text-xs" /><Tooltip /><Line type="monotone" dataKey="avg" stroke="#10b981" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></CardContent></Card>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card><CardHeader><CardTitle className="text-base">Error Rate (%)</CardTitle></CardHeader><CardContent><div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={errData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="time" className="text-xs" /><YAxis className="text-xs" domain={[0, 100]} /><Tooltip /><Line type="monotone" dataKey="rate" stroke="#ef4444" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Active Connections</CardTitle></CardHeader><CardContent><div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={connData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="time" className="text-xs" /><YAxis className="text-xs" /><Tooltip /><Area type="monotone" dataKey="active" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} /></AreaChart></ResponsiveContainer></div></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Request Distribution</CardTitle></CardHeader><CardContent><div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={errDist} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">{errDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></CardContent></Card>
          </div>
        </div>
      )}

      {activeTab === 'connections' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Connection Pool</CardTitle><Button variant="outline" size="sm" onClick={() => pruneMut.mutate()} disabled={pruneMut.isPending}>{pruneMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlugZap className="w-4 h-4 mr-2" />}Force prune</Button></CardHeader>
          <CardContent className="space-y-4">
            {pruneFeedback && <Alert><AlertDescription>{pruneFeedback.msg}</AlertDescription></Alert>}
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Pool Total</div><div className="text-xl font-semibold mt-1">{conn?.poolStats?.totalCount ?? 0}</div></div>
              <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Pool Idle</div><div className="text-xl font-semibold mt-1">{conn?.poolStats?.idleCount ?? 0}</div></div>
              <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Idle TTL</div><div className="text-xl font-semibold mt-1">{conn?.idleConnectionTtlMs ? `${Math.round(conn.idleConnectionTtlMs / 60000)}m` : 'n/a'}</div></div>
              <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Waiting</div><div className="text-xl font-semibold mt-1">{conn?.poolStats?.waitingCount ?? 0}</div></div>
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Active Connections</p>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {(conn?.connectionDetails ?? []).map((d: any) => (
                  <div key={d.tenantId} className="rounded border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{d.tenantId}</span>
                      <div className="flex items-center gap-2"><Badge variant="secondary">{d.totalRequests} req</Badge><Badge variant="outline">idle {Math.round(d.idleMilliseconds / 1000)}s</Badge></div>
                    </div>
                  </div>
                ))}
                {(conn?.connectionDetails ?? []).length === 0 && <p className="text-xs text-muted-foreground">No active connections</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
