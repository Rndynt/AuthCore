'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Activity, Clock, AlertTriangle, Database, Users, TrendingUp, TrendingDown } from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { format, fromUnixTime } from 'date-fns';

interface MetricPoint {
  timestamp: number;
  value: number;
}

interface DashboardMetrics {
  requests: {
    total: number;
    perMinute: number;
    successRate: number;
  };
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  errors: {
    total4xx: number;
    total5xx: number;
    errorRate: number;
  };
  connections: {
    active: number;
    max: number;
    utilization: number;
  };
  tenants: {
    active: number;
    requestsPerTenant: Record<string, number>;
  };
  timeSeries: {
    requestsPerMinute: MetricPoint[];
    responseTimeAvg: MetricPoint[];
    errorRate: MetricPoint[];
    activeConnections: MetricPoint[];
  };
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function formatTime(timestamp: number): string {
  try {
    return format(fromUnixTime(timestamp / 1000), 'HH:mm');
  } catch {
    return '';
  }
}

function StatCard({ title, value, subtitle, icon: Icon, trend, trendUp }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: string;
  trendUp?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
            {trend && (
              <div className={`flex items-center gap-1 mt-2 text-xs ${trendUp ? 'text-green-600' : 'text-red-600'}`}>
                {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trend}
              </div>
            )}
          </div>
          <div className="p-3 bg-primary/10 rounded-full">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      const response = await apiClient.getDashboardMetrics();
      return response.metrics as DashboardMetrics;
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Failed to load dashboard metrics</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  // Prepare chart data
  const requestsChartData = data.timeSeries.requestsPerMinute.map((point) => ({
    time: formatTime(point.timestamp),
    requests: point.value,
  }));

  const responseTimeChartData = data.timeSeries.responseTimeAvg.map((point) => ({
    time: formatTime(point.timestamp),
    avg: Math.round(point.value),
  }));

  const errorRateChartData = data.timeSeries.errorRate.map((point) => ({
    time: formatTime(point.timestamp),
    rate: Math.round(point.value * 10) / 10,
  }));

  const connectionsChartData = data.timeSeries.activeConnections.map((point) => ({
    time: formatTime(point.timestamp),
    active: point.value,
  }));

  // Error distribution for pie chart
  const errorDistribution = [
    { name: 'Success', value: data.requests.total - data.errors.total4xx - data.errors.total5xx },
    { name: '4xx Errors', value: data.errors.total4xx },
    { name: '5xx Errors', value: data.errors.total5xx },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">Real-time server metrics and performance</p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Requests/min"
          value={data.requests.perMinute}
          subtitle={`Total: ${data.requests.total.toLocaleString()}`}
          icon={Activity}
          trend={`${data.requests.successRate.toFixed(1)}% success`}
          trendUp={data.requests.successRate > 95}
        />
        <StatCard
          title="Avg Response"
          value={`${data.responseTime.avg}ms`}
          subtitle={`P95: ${data.responseTime.p95}ms | P99: ${data.responseTime.p99}ms`}
          icon={Clock}
        />
        <StatCard
          title="Error Rate"
          value={`${data.errors.errorRate.toFixed(2)}%`}
          subtitle={`4xx: ${data.errors.total4xx} | 5xx: ${data.errors.total5xx}`}
          icon={AlertTriangle}
          trend={data.errors.errorRate < 1 ? 'Healthy' : 'Elevated'}
          trendUp={data.errors.errorRate < 1}
        />
        <StatCard
          title="DB Connections"
          value={`${data.connections.active}/${data.connections.max}`}
          subtitle={`${data.connections.utilization.toFixed(1)}% utilized`}
          icon={Database}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Request Rate Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={requestsChartData}>
                  <defs>
                    <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="time" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="requests"
                    stroke="#3b82f6"
                    fillOpacity={1}
                    fill="url(#colorRequests)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Response Time Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Response Time (ms)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={responseTimeChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="time" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avg"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Error Rate Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Error Rate (%)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={errorRateChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="time" className="text-xs" />
                  <YAxis className="text-xs" domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Connections Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Connections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={connectionsChartData}>
                  <defs>
                    <linearGradient id="colorConnections" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="time" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="active"
                    stroke="#8b5cf6"
                    fillOpacity={1}
                    fill="url(#colorConnections)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Error Distribution Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={errorDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {errorDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Activity */}
      {Object.keys(data.tenants.requestsPerTenant).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requests by Tenant</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={Object.entries(data.tenants.requestsPerTenant).map(([tenant, count]) => ({
                    tenant,
                    requests: count,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="tenant" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Bar dataKey="requests" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
