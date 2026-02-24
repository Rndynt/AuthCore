'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiBaseUrl } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Circle, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';

const MAX_LOGS = 200;

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  context: {
    method: string;
    url: string;
    statusCode: number;
    duration: number;
    tenantId: string | null;
    ip: string;
    userAgent?: string;
    [key: string]: unknown;
  };
}

type ConnectionState = 'connecting' | 'open' | 'closed' | 'paused';

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function formatDuration(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} s`;
  }
  return `${Math.round(value)} ms`;
}

function getLevelBadgeStyles(level: LogLevel) {
  switch (level) {
    case 'error':
      return 'bg-red-100 text-red-900 border border-red-200';
    case 'warn':
      return 'bg-amber-100 text-amber-900 border border-amber-200';
    default:
      return 'bg-sky-100 text-sky-900 border border-sky-200';
  }
}

function getStatusColor(status: number) {
  if (status >= 500) return 'text-red-600';
  if (status >= 400) return 'text-amber-600';
  if (status >= 300) return 'text-blue-600';
  return 'text-emerald-600';
}

const methodStyles: Record<string, string> = {
  GET: 'bg-blue-100 text-blue-900 border border-blue-200',
  POST: 'bg-emerald-100 text-emerald-900 border border-emerald-200',
  PUT: 'bg-indigo-100 text-indigo-900 border border-indigo-200',
  PATCH: 'bg-purple-100 text-purple-900 border border-purple-200',
  DELETE: 'bg-rose-100 text-rose-900 border border-rose-200',
};

export default function MonitoringPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [lastReceivedAt, setLastReceivedAt] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const streamUrl = useMemo(() => {
    const base = apiBaseUrl || '';
    return `${base}/admin/log-stream`;
  }, [apiBaseUrl]);

  useEffect(() => {
    if (isPaused) {
      setConnectionState('paused');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    setConnectionState('connecting');
    
    // Use fetch with credentials for SSE instead of EventSource
    // This ensures cookies are sent properly
    const abortController = new AbortController();
    
    const connectSSE = async () => {
      try {
        const response = await fetch(streamUrl, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Accept': 'text/event-stream',
          },
          signal: abortController.signal,
        });

        if (!response.ok) {
          console.error('SSE connection failed:', response.status);
          setConnectionState('closed');
          return;
        }

        setConnectionState('open');

        const reader = response.body?.getReader();
        if (!reader) {
          setConnectionState('closed');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            // Parse SSE format: event: xxx\ndata: yyy
            const eventMatch = line.match(/event:\s*(\w+)/);
            // Use multiline match without 's' flag for compatibility
            const dataMatch = line.match(/data:\s*([\s\S]+)/);

            if (eventMatch && dataMatch) {
              const eventType = eventMatch[1];
              const data = dataMatch[1];

              if (eventType === 'ready') {
                console.log('SSE ready');
              } else if (eventType === 'log') {
                try {
                  const payload = JSON.parse(data) as LogEntry;
                  setLogs((previous) => [payload, ...previous].slice(0, MAX_LOGS));
                  setLastReceivedAt(payload.timestamp);
                } catch (error) {
                  console.error('Failed to parse log event', error);
                }
              }
            }
          }
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('SSE connection aborted');
        } else {
          console.error('SSE error:', error);
          setConnectionState('closed');
        }
      }
    };

    connectSSE();

    return () => {
      abortController.abort();
    };
  }, [isPaused, streamUrl]);

  const summary = useMemo(() => {
    if (logs.length === 0) {
      return {
        total: 0,
        warnings: 0,
        errors: 0,
        averageDuration: 0,
      };
    }

    let warningCount = 0;
    let errorCount = 0;
    let durationTotal = 0;

    for (const entry of logs) {
      if (entry.level === 'error' || entry.context.statusCode >= 500) {
        errorCount += 1;
      } else if (entry.level === 'warn' || entry.context.statusCode >= 400) {
        warningCount += 1;
      }
      durationTotal += entry.context.duration ?? 0;
    }

    return {
      total: logs.length,
      warnings: warningCount,
      errors: errorCount,
      averageDuration: durationTotal / logs.length,
    };
  }, [logs]);

  const handleToggle = () => setIsPaused((state) => !state);
  const handleClear = () => setLogs([]);

  const connectionLabel = {
    connecting: 'Connecting…',
    open: 'Streaming',
    closed: 'Disconnected',
    paused: 'Paused',
  }[connectionState];

  const connectionColor = {
    connecting: 'text-amber-500',
    open: 'text-emerald-500',
    closed: 'text-rose-500',
    paused: 'text-slate-400',
  }[connectionState];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Live request monitoring</h2>
        <p className="text-muted-foreground max-w-2xl">
          Observe API traffic in real time. Each entry includes the HTTP method, status, tenant context, latency, and user agent.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <CardTitle>Stream status</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Circle className={cn('h-3 w-3', connectionColor)} />
              <span>{connectionLabel}</span>
              {lastReceivedAt && (
                <span className="text-xs text-muted-foreground">
                  Last event {formatTimestamp(lastReceivedAt)}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleToggle}>
              {isPaused ? (
                <span className="flex items-center gap-2">
                  <PlayCircle className="h-4 w-4" /> Resume stream
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <PauseCircle className="h-4 w-4" /> Pause stream
                </span>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClear} disabled={logs.length === 0}>
              <span className="flex items-center gap-2">
                <Trash2 className="h-4 w-4" /> Clear
              </span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="text-xs uppercase text-muted-foreground">Events tracked</div>
              <div className="text-2xl font-semibold">{summary.total}</div>
            </div>
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="text-xs uppercase text-muted-foreground">Warnings</div>
              <div className="text-2xl font-semibold text-amber-600">{summary.warnings}</div>
            </div>
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="text-xs uppercase text-muted-foreground">Errors</div>
              <div className="text-2xl font-semibold text-rose-600">{summary.errors}</div>
            </div>
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="text-xs uppercase text-muted-foreground">Avg. duration</div>
              <div className="text-2xl font-semibold">{formatDuration(summary.averageDuration)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isPaused && (
        <Alert>
          <AlertDescription>
            Streaming is paused. Resume the stream to receive new log entries.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent requests</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <Alert>
              <AlertDescription>No request activity captured yet. Keep this tab open while traffic flows to populate the stream.</AlertDescription>
            </Alert>
          ) : (
            <div className="rounded-lg border">
              <div className="max-h-[520px] overflow-y-auto">
                <Table className="min-w-[880px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Timestamp</TableHead>
                      <TableHead className="w-[120px]">Request</TableHead>
                      <TableHead className="w-[120px]">Status</TableHead>
                      <TableHead className="w-[120px]">Latency</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead className="w-[140px]">Source</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => {
                      const method = log.context.method?.toUpperCase?.() ?? '—';
                      const status = log.context.statusCode;
                      const methodClass = methodStyles[method] ?? 'bg-secondary text-secondary-foreground';

                      return (
                        <TableRow key={log.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{new Date(log.timestamp).toLocaleTimeString()}</span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(log.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge className={cn('font-mono text-xs uppercase', methodClass)} variant="secondary">
                                {method}
                              </Badge>
                              <span className="truncate font-mono text-xs text-muted-foreground" title={log.context.url}>
                                {log.context.url}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className={cn('text-sm font-semibold', getStatusColor(status))}>{status}</span>
                              <Badge className={cn('text-xs capitalize', getLevelBadgeStyles(log.level))} variant="secondary">
                                {log.level}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{formatDuration(log.context.duration)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{log.context.tenantId ?? '—'}</span>
                              <span className="text-xs text-muted-foreground">{log.message}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-xs font-mono">{log.context.ip}</span>
                              {log.context.userAgent && (
                                <span className="text-[10px] text-muted-foreground" title={log.context.userAgent}>
                                  {log.context.userAgent}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[260px]">
                            <span className="line-clamp-3 text-xs text-muted-foreground" title={log.message}>
                              {log.message}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
