'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, RefreshCcw, ShieldOff, Copy, CopyCheck } from 'lucide-react';

interface SupportSession {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  sessionId: string;
  token: string;
  userId: string;
  userEmail: string;
  createdAt: string;
  expiresAt: string;
}

function formatTtl(expiresAt: string) {
  const expires = new Date(expiresAt).getTime();
  const now = Date.now();
  const remainingMs = expires - now;
  if (remainingMs <= 0) {
    return 'expired';
  }
  const minutes = Math.round(remainingMs / 60000);
  if (minutes < 60) {
    return `${minutes} min${minutes === 1 ? '' : 's'}`;
  }
  const hours = Math.round(minutes / 60);
  return `${hours} hr${hours === 1 ? '' : 's'}`;
}

export default function SupportSessionsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ['support-sessions'],
    queryFn: async () => {
      const response = await apiClient.getSupportSessions();
      return (response as any).sessions as SupportSession[];
    },
    refetchInterval: 30_000,
  });

  const revokeMutation = useMutation({
    mutationFn: async ({ tenantId, sessionId }: { tenantId: string; sessionId: string }) => {
      await apiClient.revokeSupportSession(tenantId, sessionId);
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['support-sessions'] });
    },
    onError: () => {
      setError('Failed to revoke support session.');
    },
  });

  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 1500);
    } catch (copyError) {
      console.error(copyError);
      setError('Unable to copy token.');
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Support sessions</h2>
        <p className="text-muted-foreground">
          Review active admin-initiated impersonation tokens and revoke them proactively.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Active support sessions</CardTitle>
            <p className="text-sm text-muted-foreground">
              Automatically refreshes every 30 seconds while this page is open.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => sessionsQuery.refetch()}
            disabled={sessionsQuery.isLoading}
          >
            <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {sessionsQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>Unable to load support sessions.</AlertDescription>
            </Alert>
          ) : sessionsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading support sessions...
            </div>
          ) : sessions.length === 0 ? (
            <Alert variant="default">
              <AlertDescription>
                No active support sessions were found. Generate a token from the Users page when assisting a tenant.
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>TTL</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => {
                  const expiresSoon = new Date(session.expiresAt).getTime() - Date.now() < 5 * 60 * 1000;
                  return (
                    <TableRow key={session.sessionId}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{session.tenantName || session.tenantId}</span>
                          <span className="text-xs text-muted-foreground font-mono">{session.tenantId}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{session.userEmail}</span>
                          <span className="text-xs text-muted-foreground font-mono">{session.userId}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs break-all">
                        {session.token}
                      </TableCell>
                      <TableCell>
                        <Badge variant={expiresSoon ? 'destructive' : 'secondary'}>
                          {formatTtl(session.expiresAt)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(session.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleCopy(session.token)}
                          >
                            {copiedToken === session.token ? (
                              <span className="flex items-center gap-1 text-xs">
                                <CopyCheck className="w-4 h-4" /> Copied
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs">
                                <Copy className="w-4 h-4" /> Copy
                              </span>
                            )}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => revokeMutation.mutate({ tenantId: session.tenantId, sessionId: session.sessionId })}
                            disabled={revokeMutation.isPending}
                          >
                            <ShieldOff className="w-4 h-4 mr-1" /> Revoke
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
