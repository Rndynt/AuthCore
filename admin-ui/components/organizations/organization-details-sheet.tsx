'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Trash2 } from 'lucide-react';
import type { AdminOrganization } from './types';

interface OrganizationDetailsSheetProps {
  organization: AdminOrganization | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrganizationDetailsSheet({
  organization,
  open,
  onOpenChange,
}: OrganizationDetailsSheetProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (organization) {
      setName(organization.name);
      setDescription(organization.description || '');
      const metadata = organization.metadata && typeof organization.metadata === 'object' ? organization.metadata : {};
      setPaymentMethod(typeof metadata.paymentMethod === 'string' ? metadata.paymentMethod : '');
    }
  }, [organization]);

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; description: string; metadata?: Record<string, any> }) =>
      organization ? apiClient.updateOrganization(organization.id, data) : Promise.reject(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setSuccess(true);
      setError('');
      setTimeout(() => setSuccess(false), 2000);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to update organization');
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: (memberId: string) =>
      organization ? apiClient.removeOrganizationMember(organization.id, memberId) : Promise.reject(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', organization?.id] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    },
  });

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    const metadata = organization?.metadata && typeof organization.metadata === 'object' ? organization.metadata : {};
    const nextMetadata = { ...metadata };
    if (paymentMethod) {
      nextMetadata.paymentMethod = paymentMethod;
    } else {
      delete nextMetadata.paymentMethod;
    }
    updateMutation.mutate({
      name,
      description,
      metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined,
    });
  };

  if (!organization) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Organization Details</SheetTitle>
          <SheetDescription>{organization.slug}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Organization updated successfully
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="detail-name">Name</Label>
              <Input
                id="detail-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="detail-description">Description</Label>
              <Textarea
                id="detail-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={updateMutation.isPending}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="detail-payment-method">Payment method</Label>
              <select
                id="detail-payment-method"
                className="h-10 w-full rounded border border-input bg-background px-3 py-2 text-sm"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                disabled={updateMutation.isPending}
              >
                <option value="">Select a method</option>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="card">Card</option>
                <option value="ewallet">E-wallet</option>
                <option value="qris">QRIS</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Change the default payment method shown in Quicklog.
              </p>
            </div>

            <Button type="submit" disabled={updateMutation.isPending} className="w-full">
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>

          {organization.organizationMembers && organization.organizationMembers.length > 0 && (
            <div className="space-y-4">
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-4">Members</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organization.organizationMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          {member.user?.email || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{member.role}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(member.joinedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteMemberMutation.mutate(member.id)}
                            disabled={deleteMemberMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
