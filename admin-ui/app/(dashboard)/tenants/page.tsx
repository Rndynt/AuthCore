'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, MoreVertical, CheckCircle, XCircle, Trash2, AlertCircle, Info } from 'lucide-react';
import { CreateTenantDialog } from '@/components/tenants/create-tenant-dialog';
import { TenantDetailsSheet } from '@/components/tenants/tenant-details-sheet';
import type { AdminTenant } from '@/components/tenants/types';
import { useSearchParams } from 'next/navigation';

export default function TenantsPage() {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<AdminTenant | null>(null);
  const searchParams = useSearchParams();

  const { data: tenantsData, isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiClient.getTenants(),
  });

  const suspendMutation = useMutation({
    mutationFn: (id: string) => apiClient.suspendTenant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setActionError('');
    },
    onError: (error) => {
      setActionError(`Failed to suspend tenant: ${error.message}`);
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => apiClient.activateTenant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setActionError('');
    },
    onError: (error) => {
      setActionError(`Failed to activate tenant: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteTenant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setActionError('');
    },
    onError: (error) => {
      setActionError(`Failed to delete tenant: ${error.message}`);
    },
  });

  const tenants: AdminTenant[] = tenantsData?.tenants || [];

  useEffect(() => {
    const tenantParam = searchParams.get('tenantId');
    if (!tenantParam || tenants.length === 0) {
      return;
    }

    if (selectedTenant?.id === tenantParam && detailsOpen) {
      return;
    }

    const match = tenants.find((tenant) => tenant.id === tenantParam);
    if (match) {
      setSelectedTenant(match);
      setDetailsOpen(true);
    }
  }, [searchParams, tenants, selectedTenant, detailsOpen]);

  const renderStatus = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default">active</Badge>;
      case 'suspended':
        return <Badge variant="secondary">suspended</Badge>;
      case 'deleted':
        return <Badge variant="outline">deleted</Badge>;
      case 'provisioning':
        return <Badge variant="secondary">provisioning</Badge>;
      case 'failed':
        return <Badge variant="destructive">failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Tenants</h2>
            <p className="text-muted-foreground">Manage all registered tenants</p>
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Tenants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Tenants</h2>
          <p className="text-muted-foreground">Manage all registered tenants</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Tenant
        </Button>
      </div>

      {actionError && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Tenants ({tenants.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No tenants found. Create your first tenant to get started.
                  </TableCell>
                </TableRow>
              ) : (
                tenants.map((tenant: AdminTenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-mono text-sm">{tenant.id}</TableCell>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="font-mono text-sm" title={tenant.schemaName}>
                      {tenant.slug}
                    </TableCell>
                    <TableCell>
                      {renderStatus(tenant.status)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tenant.createdAt
                        ? new Date(tenant.createdAt).toLocaleString()
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedTenant(tenant);
                              setDetailsOpen(true);
                            }}
                          >
                            <Info className="w-4 h-4 mr-2" />
                            View details
                          </DropdownMenuItem>
                          {tenant.status === 'active' ? (
                            <DropdownMenuItem
                              onClick={() => suspendMutation.mutate(tenant.id)}
                              disabled={suspendMutation.isPending}
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              Suspend
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => activateMutation.mutate(tenant.id)}
                              disabled={activateMutation.isPending}
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete tenant "${tenant.name}"?`)) {
                                deleteMutation.mutate(tenant.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateTenantDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
      <TenantDetailsSheet
        tenant={selectedTenant}
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setSelectedTenant(null);
          }
        }}
      />
    </div>
  );
}
