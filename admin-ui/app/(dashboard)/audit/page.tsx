'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';

interface AuditLog {
  id: number;
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, any>;
  ip_address: string | null;
  created_at: string;
}

export default function AuditLogsPage() {
  const PAGE_SIZE = 50;

  const [formFilters, setFormFilters] = useState({
    action: '',
    search: '',
    from: '',
    to: '',
  });
  const [appliedFilters, setAppliedFilters] = useState(formFilters);
  const [page, setPage] = useState(0);

  const logsQuery = useQuery({
    queryKey: ['audit-logs', appliedFilters, page],
    queryFn: async () => {
      const normalized = {
        action: appliedFilters.action || undefined,
        search: appliedFilters.search || undefined,
        from: appliedFilters.from || undefined,
        to: appliedFilters.to || undefined,
      };
      const response = await apiClient.getAuditLogs({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        ...normalized,
      });
      return response as { logs: AuditLog[]; total: number };
    },
    keepPreviousData: true,
  });

  const total = logsQuery.data?.total ?? 0;
  const totalPages = total === 0 ? 1 : Math.ceil(total / PAGE_SIZE);
  const start = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const end = total === 0 ? 0 : Math.min(total, (page + 1) * PAGE_SIZE);

  const handleApplyFilters = () => {
    setAppliedFilters(formFilters);
    setPage(0);
  };

  const handleResetPage = () => {
    setPage(0);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Audit Logs</h2>
        <p className="text-muted-foreground">
          Track administrative actions and security-sensitive events
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => event.preventDefault()}
          >
            <Input
              placeholder="Action (e.g. create_tenant)"
              value={formFilters.action}
              onChange={(event) => setFormFilters({ ...formFilters, action: event.target.value })}
            />
            <Input
              placeholder="Search details or target"
              value={formFilters.search}
              onChange={(event) => setFormFilters({ ...formFilters, search: event.target.value })}
            />
            <Input
              type="date"
              value={formFilters.from}
              onChange={(event) => setFormFilters({ ...formFilters, from: event.target.value })}
            />
            <Input
              type="date"
              value={formFilters.to}
              onChange={(event) => setFormFilters({ ...formFilters, to: event.target.value })}
            />
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleApplyFilters}
                disabled={logsQuery.isLoading}
              >
                <Search className="w-4 h-4 mr-2" />
                Apply filters
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFormFilters({ action: '', search: '', from: '', to: '' });
                  setAppliedFilters({ action: '', search: '', from: '', to: '' });
                  handleResetPage();
                }}
                disabled={logsQuery.isLoading}
              >
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
        </CardHeader>
        <CardContent>
          {logsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading audit logs...
            </div>
          ) : logsQuery.data && logsQuery.data.logs.length === 0 ? (
            <Alert variant="default">
              <AlertDescription>No audit records found for the provided filters.</AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsQuery.data?.logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{log.admin_user_id}</span>
                        {log.ip_address && (
                          <span className="text-xs text-muted-foreground">{log.ip_address}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-sm">
                        <span className="font-medium">{log.action}</span>
                        <span className="text-xs text-muted-foreground">{log.target_type}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{log.target_id}</span>
                    </TableCell>
                    <TableCell>
                      <pre className="max-h-24 overflow-auto rounded bg-muted p-2 text-xs">
                        {JSON.stringify(log.details || {}, null, 2)}
                      </pre>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-muted-foreground">
              {total === 0
                ? 'No records to display.'
                : `Showing ${start}-${end} of ${total} records`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(current - 1, 0))}
                disabled={page === 0 || logsQuery.isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {Math.min(page + 1, totalPages)} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.min(current + 1, totalPages - 1))}
                disabled={page >= totalPages - 1 || logsQuery.isLoading || total === 0}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
