'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, RefreshCcw, UserCheck2, Clipboard, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

interface UserResult {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  user: {
    id: string;
    email: string;
    name?: string | null;
    role?: string | null;
    banned?: boolean | null;
    createdAt: string;
    updatedAt: string;
  };
  sessionCount: number;
  organizations: Array<{ id: string; name: string; role: string }>;
}

export default function UsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState({ q: '', tenantId: '' });
  const [submitted, setSubmitted] = useState(filters);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supportSession, setSupportSession] = useState<{
    token: string;
    expiresAt: string;
    tenantId: string;
    tenantName: string;
    userEmail: string;
  } | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const searchQuery = useQuery({
    queryKey: ['users-search', submitted],
    queryFn: async () => {
      const response = await apiClient.searchUsers({
        q: submitted.q || undefined,
        tenantId: submitted.tenantId || undefined,
        limit: 50,
      });
      return response.users as UserResult[];
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async ({ tenantId, userId }: { tenantId: string; userId: string }) => {
      return apiClient.revokeUserSessions(tenantId, userId);
    },
    onSuccess: () => {
      setMessage('Active sessions revoked');
      searchQuery.refetch();
    },
    onError: () => {
      setError('Failed to revoke sessions');
    },
  });

  const supportSessionMutation = useMutation({
    mutationFn: async ({ tenantId, userId, tenantName, userEmail }: {
      tenantId: string;
      userId: string;
      tenantName: string;
      userEmail: string;
    }) => {
      const response = await apiClient.createSupportSession(tenantId, userId, 30);
      return {
        ...response.session,
        tenantId,
        tenantName,
        userEmail,
      } as { token: string; expiresAt: string; tenantId: string; tenantName: string; userEmail: string };
    },
    onMutate: () => {
      setMessage(null);
      setError(null);
      setSupportSession(null);
      setCopyStatus('idle');
    },
    onSuccess: (session) => {
      setSupportSession(session);
      setCopyStatus('idle');
      setMessage('Support session generated. Token available below.');
      setError(null);
    },
    onError: () => {
      setError('Failed to create support session');
      setSupportSession(null);
    },
  });

  const users = useMemo(() => searchQuery.data ?? [], [searchQuery.data]);

  useEffect(() => {
    const qParam = searchParams.get('q') ?? '';
    const tenantParam = searchParams.get('tenantId') ?? '';
    const nextFilters = { q: qParam, tenantId: tenantParam };
    setFilters(nextFilters);
    setSubmitted(nextFilters);
    setMessage(null);
    setError(null);
    setSupportSession(null);
    setCopyStatus('idle');
  }, [searchParams]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(filters);
    setMessage(null);
    setError(null);
    setSupportSession(null);
    setCopyStatus('idle');

    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.tenantId) params.set('tenantId', filters.tenantId);
    const query = params.toString();
    router.replace(`/users${query ? `?${query}` : ''}`);
  };

  const handleCopyToken = async () => {
    if (!supportSession) return;
    try {
      await navigator.clipboard.writeText(supportSession.token);
      setCopyStatus('copied');
      setMessage('Support session token copied to clipboard');
      setError(null);
    } catch (copyError) {
      console.error(copyError);
      setCopyStatus('failed');
      setError('Unable to copy token. Copy manually if needed.');
    }
  };

  const renderSupportSession = () => {
    if (!supportSession) {
      return null;
    }

    const expiresAt = new Date(supportSession.expiresAt);
    const remainingMs = Math.max(0, expiresAt.getTime() - Date.now());
    const remainingMinutes = Math.max(1, Math.round(remainingMs / 60000));

    return (
      <Card className="mb-6 border-dashed">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Support session ready
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Token scoped for {supportSession.userEmail} ({supportSession.tenantName || supportSession.tenantId})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleCopyToken} disabled={copyStatus === 'copied'}>
              {copyStatus === 'copied' ? (
                <span className="flex items-center gap-1">
                  <ClipboardCheck className="h-4 w-4" /> Copied
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Clipboard className="h-4 w-4" /> Copy token
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSupportSession(null);
                setCopyStatus('idle');
                setMessage(null);
              }}
            >
              Dismiss
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded bg-muted p-3 font-mono text-sm break-all">
            {supportSession.token}
          </div>
          <p className="text-xs text-muted-foreground">
            Expires at {expiresAt.toLocaleString()} (approximately {remainingMinutes} minute{remainingMinutes === 1 ? '' : 's'} remaining)
          </p>
        </CardContent>
      </Card>
    );
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Users</h2>
        <p className="text-muted-foreground">
          Search and manage users across all tenants
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Search users</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4 md:flex-row" onSubmit={handleSearch}>
            <Input
              placeholder="Search by email, name, or ID"
              value={filters.q}
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            />
            <Input
              placeholder="Tenant ID (optional)"
              value={filters.tenantId}
              onChange={(event) => setFilters({ ...filters, tenantId: event.target.value })}
            />
            <Button type="submit" disabled={searchQuery.isPending}>
              {searchQuery.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {message && (
        <Alert className="mb-4" variant="default">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="mb-4" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {renderSupportSession()}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Results</span>
            <Button variant="ghost" size="icon" onClick={() => searchQuery.refetch()}>
              <RefreshCcw className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {searchQuery.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading users...
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found for the provided criteria.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Organizations</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((row) => (
                  <TableRow key={`${row.tenantId}-${row.user.id}`}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.tenantId}</span>
                        <span className="text-xs text-muted-foreground">{row.tenantName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.user.email}</span>
                        {row.user.name && (
                          <span className="text-xs text-muted-foreground">{row.user.name}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{row.user.role || 'member'}</Badge>
                        {row.user.banned && <Badge variant="destructive">Banned</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{row.sessionCount}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.organizations.map((org) => (
                          <Badge key={org.id} variant="outline">
                            {org.name} — {org.role}
                          </Badge>
                        ))}
                        {row.organizations.length === 0 && (
                          <span className="text-xs text-muted-foreground">No memberships</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => revokeMutation.mutate({ tenantId: row.tenantId, userId: row.user.id })}
                          disabled={revokeMutation.isPending}
                        >
                          {revokeMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Revoke Sessions'
                          )}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => supportSessionMutation.mutate({
                            tenantId: row.tenantId,
                            userId: row.user.id,
                            tenantName: row.tenantName,
                            userEmail: row.user.email,
                          })}
                          disabled={supportSessionMutation.isPending}
                        >
                          {supportSessionMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <span className="flex items-center gap-1">
                              <UserCheck2 className="w-4 h-4" />
                              Support
                            </span>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
