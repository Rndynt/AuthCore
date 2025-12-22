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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface CreateOrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOrganizationDialog({ open, onOpenChange }: CreateOrganizationDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; slug: string; description?: string }) =>
      apiClient.createOrganization(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setSuccess(true);
      setError('');
      setTimeout(() => {
        resetForm();
        onOpenChange(false);
      }, 1500);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
      setSuccess(false);
    },
  });

  const resetForm = () => {
    setName('');
    setSlug('');
    setDescription('');
    setError('');
    setSuccess(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !slug) {
      setError('Name and slug are required');
      return;
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      setError('Slug must contain only lowercase letters, numbers, and hyphens');
      return;
    }

    createMutation.mutate({ name, slug, description: description || undefined });
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
          <DialogTitle>Create New Organization</DialogTitle>
          <DialogDescription>
            Create a new organization to group users and manage access control.
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
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Organization created successfully
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input
                id="name"
                placeholder="Acme Corp"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                disabled={createMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                placeholder="acme-corp"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                required
                disabled={createMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                URL-friendly identifier (lowercase, hyphens only)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="A brief description of your organization..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={createMutation.isPending}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Organization'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
