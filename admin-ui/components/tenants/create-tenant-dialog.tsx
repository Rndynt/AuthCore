'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface CreateTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTenantDialog({ open, onOpenChange }: CreateTenantDialogProps) {
  const queryClient = useQueryClient();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: { id: string; name: string; slug: string }) =>
      apiClient.createTenant(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['metrics'] });
      setSuccess(true);
      setError('');
      setTimeout(() => {
        resetForm();
        onOpenChange(false);
      }, 1500);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create tenant');
      setSuccess(false);
    },
  });

  const resetForm = () => {
    setId('');
    setName('');
    setSlug('');
    setError('');
    setSuccess(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!id || !name || !slug) {
      setError('All fields are required');
      return;
    }

    if (!/^[a-z0-9-]+$/.test(id)) {
      setError('ID must contain only lowercase letters, numbers, and hyphens');
      return;
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      setError('Slug must contain only lowercase letters, numbers, and hyphens');
      return;
    }

    createMutation.mutate({ id, name, slug });
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug) {
      setSlug(value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Tenant</DialogTitle>
          <DialogDescription>
            Add a new tenant to the system. A dedicated schema will be provisioned automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="border-green-500 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Tenant created successfully!
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="id">Tenant ID</Label>
              <Input
                id="id"
                placeholder="pos"
                value={id}
                onChange={(e) => setId(e.target.value.toLowerCase())}
                disabled={createMutation.isPending || success}
                required
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier (lowercase, hyphens allowed)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Tenant Name</Label>
              <Input
                id="name"
                placeholder="POS Kasir"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                disabled={createMutation.isPending || success}
                required
              />
              <p className="text-xs text-muted-foreground">
                Display name for the tenant
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                placeholder="pos-kasir"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                disabled={createMutation.isPending || success}
                required
              />
              <p className="text-xs text-muted-foreground">
                URL-friendly identifier (auto-generated from name)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || success}>
              {createMutation.isPending ? 'Creating...' : 'Create Tenant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
