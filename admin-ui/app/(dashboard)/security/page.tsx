'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface SecuritySettings {
  trustedOrigins: string[];
  enableDevEndpoints: boolean;
  apiKeyRotationDays: number | null;
}

export default function SecurityPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['security-settings'],
    queryFn: async () => {
      const response = await apiClient.getSecuritySettings();
      return response.settings as SecuritySettings;
    },
  });

  const [form, setForm] = useState({
    trustedOrigins: '',
    enableDevEndpoints: false,
    apiKeyRotationDays: '' as string | number,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setForm({
        trustedOrigins: data.trustedOrigins.join('\n'),
        enableDevEndpoints: data.enableDevEndpoints,
        apiKeyRotationDays: data.apiKeyRotationDays ?? '',
      });
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<SecuritySettings>) => {
      await apiClient.updateSecuritySettings(payload);
    },
    onSuccess: () => {
      setMessage('Security settings updated');
      setError(null);
      refetch();
    },
    onError: () => {
      setError('Failed to update security settings');
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const payload: Partial<SecuritySettings> = {
      trustedOrigins: form.trustedOrigins
        .split(/\n|,/)
        .map((origin) => origin.trim())
        .filter(Boolean),
      enableDevEndpoints: form.enableDevEndpoints,
      apiKeyRotationDays: form.apiKeyRotationDays === ''
        ? null
        : Number(form.apiKeyRotationDays),
    };

    updateMutation.mutate(payload);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading security settings...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Security &amp; Platform Controls</h2>
        <p className="text-muted-foreground">
          Configure trusted origins, development tooling, and API key policies
        </p>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>Security settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium">Trusted origins</label>
              <p className="text-xs text-muted-foreground">
                One origin per line. Updates take effect immediately for new requests.
              </p>
              <textarea
                className="w-full rounded border bg-background p-3 text-sm font-mono"
                rows={5}
                value={form.trustedOrigins}
                onChange={(event) => setForm({ ...form, trustedOrigins: event.target.value })}
              />
            </div>

            <div className="flex items-center justify-between border rounded p-4">
              <div>
                <p className="text-sm font-medium">Enable development endpoints</p>
                <p className="text-xs text-muted-foreground">
                  Controls access to /dev/* APIs for QA tooling.
                </p>
              </div>
              <Switch
                checked={form.enableDevEndpoints}
                onCheckedChange={(checked) => setForm({ ...form, enableDevEndpoints: checked })}
                aria-label="Toggle development endpoints"
                disabled={updateMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">API key rotation (days)</label>
              <p className="text-xs text-muted-foreground">
                Optional reminder window for rotating long-lived API keys. Leave blank to disable.
              </p>
              <Input
                type="number"
                min={0}
                value={form.apiKeyRotationDays}
                onChange={(event) => setForm({ ...form, apiKeyRotationDays: event.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Save changes'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
