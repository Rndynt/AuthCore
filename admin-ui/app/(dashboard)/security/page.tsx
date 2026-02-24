'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, Ban, Clock, Trash2, Plus, CheckCircle, XCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogTrigger 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface IpBlockEntry {
  ip: string;
  reason: string;
  blockedAt: string;
  blockedBy: string;
  expiresAt?: string | null;
  isCidr: boolean;
}

interface SecuritySettings {
  trustedOrigins: string[];
  enableDevEndpoints: boolean;
  apiKeyRotationDays: number | null;
  adminIpAllowlist: string[];
  enforceAdminMfa: boolean;
  readOnlyMode: boolean;
  ipBlocklist: IpBlockEntry[];
  rateLimitOverrides: {
    authMax?: number;
    devMax?: number;
    adminMax?: number;
    generalMax?: number;
  };
  enableIpBlocking: boolean;
  enableRateLimitLogging: boolean;
  blockOnRateLimitExceeded: boolean;
  rateLimitBlockDurationMs: number;
}

export default function SecurityPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['security-settings'],
    queryFn: async () => {
      const response = await apiClient.getSecuritySettings();
      return response.settings as SecuritySettings;
    },
  });

  const { data: blocklistData, refetch: refetchBlocklist } = useQuery({
    queryKey: ['ip-blocklist'],
    queryFn: async () => {
      const response = await apiClient.getIpBlocklist();
      return response.blocklist as IpBlockEntry[];
    },
  });

  const [form, setForm] = useState({
    trustedOrigins: '',
    enableDevEndpoints: false,
    apiKeyRotationDays: '' as string | number,
    adminIpAllowlist: '',
    enforceAdminMfa: false,
    readOnlyMode: false,
    enableIpBlocking: true,
    enableRateLimitLogging: true,
    blockOnRateLimitExceeded: false,
    rateLimitBlockDurationMs: 3600000,
  });

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // IP Blocking state
  const [newIp, setNewIp] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newExpiry, setNewExpiry] = useState('');
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        trustedOrigins: data.trustedOrigins.join('\n'),
        enableDevEndpoints: data.enableDevEndpoints,
        apiKeyRotationDays: data.apiKeyRotationDays ?? '',
        adminIpAllowlist: data.adminIpAllowlist.join('\n'),
        enforceAdminMfa: data.enforceAdminMfa,
        readOnlyMode: data.readOnlyMode,
        enableIpBlocking: data.enableIpBlocking ?? true,
        enableRateLimitLogging: data.enableRateLimitLogging ?? true,
        blockOnRateLimitExceeded: data.blockOnRateLimitExceeded ?? false,
        rateLimitBlockDurationMs: data.rateLimitBlockDurationMs ?? 3600000,
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

  const blockIpMutation = useMutation({
    mutationFn: async ({ ip, reason, expiresInMs }: { ip: string; reason: string; expiresInMs?: number }) => {
      return apiClient.blockIp(ip, reason, expiresInMs);
    },
    onSuccess: () => {
      setNewIp('');
      setNewReason('');
      setNewExpiry('');
      setBlockDialogOpen(false);
      refetchBlocklist();
      setMessage('IP blocked successfully');
    },
    onError: (err: Error) => {
      setError(`Failed to block IP: ${err.message}`);
    },
  });

  const unblockIpMutation = useMutation({
    mutationFn: async (ip: string) => {
      return apiClient.unblockIp(ip);
    },
    onSuccess: () => {
      refetchBlocklist();
      setMessage('IP unblocked successfully');
    },
    onError: (err: Error) => {
      setError(`Failed to unblock IP: ${err.message}`);
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
      adminIpAllowlist: form.adminIpAllowlist
        .split(/\n|,/)
        .map((entry) => entry.trim())
        .filter(Boolean),
      enforceAdminMfa: form.enforceAdminMfa,
      readOnlyMode: form.readOnlyMode,
      enableIpBlocking: form.enableIpBlocking,
      enableRateLimitLogging: form.enableRateLimitLogging,
      blockOnRateLimitExceeded: form.blockOnRateLimitExceeded,
      rateLimitBlockDurationMs: form.rateLimitBlockDurationMs,
    };

    updateMutation.mutate(payload);
  };

  const handleBlockIp = () => {
    if (!newIp.trim()) {
      setError('IP address is required');
      return;
    }

    let expiresInMs: number | undefined;
    if (newExpiry) {
      const hours = parseInt(newExpiry, 10);
      if (!isNaN(hours) && hours > 0) {
        expiresInMs = hours * 60 * 60 * 1000;
      }
    }

    blockIpMutation.mutate({ ip: newIp.trim(), reason: newReason.trim() || 'Blocked via admin', expiresInMs });
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading security settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Security & Platform Controls</h2>
        <p className="text-muted-foreground">
          Configure trusted origins, IP blocking, rate limiting, and security policies
        </p>
      </div>

      {message && (
        <Alert className="mb-4">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="mb-4" variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* IP Blocking Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-red-500" />
            <CardTitle>IP Blocklist</CardTitle>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="ip-blocking-toggle" className="text-sm">Enable IP Blocking</Label>
              <Switch
                id="ip-blocking-toggle"
                checked={form.enableIpBlocking}
                onCheckedChange={(checked) => {
                  setForm({ ...form, enableIpBlocking: checked });
                  updateMutation.mutate({ enableIpBlocking: checked });
                }}
              />
            </div>
            <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" /> Block IP
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Block IP Address</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="ip-address">IP Address / CIDR</Label>
                    <Input
                      id="ip-address"
                      placeholder="192.168.1.1 or 10.0.0.0/24"
                      value={newIp}
                      onChange={(e) => setNewIp(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason</Label>
                    <Input
                      id="reason"
                      placeholder="Reason for blocking"
                      value={newReason}
                      onChange={(e) => setNewReason(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expiry">Expiry (hours, optional)</Label>
                    <Input
                      id="expiry"
                      type="number"
                      placeholder="Leave empty for permanent"
                      value={newExpiry}
                      onChange={(e) => setNewExpiry(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleBlockIp} disabled={blockIpMutation.isPending}>
                    {blockIpMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Block IP
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {!blocklistData || blocklistData.length === 0 ? (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                No IP addresses are currently blocked. Click "Block IP" to add one.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium">IP / CIDR</th>
                    <th className="px-4 py-2 text-left font-medium">Reason</th>
                    <th className="px-4 py-2 text-left font-medium">Blocked At</th>
                    <th className="px-4 py-2 text-left font-medium">Expires</th>
                    <th className="px-4 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {blocklistData.map((entry, index) => (
                    <tr key={index} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded">{entry.ip}</code>
                          {entry.isCidr && (
                            <Badge variant="secondary" className="text-xs">CIDR</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{entry.reason}</td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">
                        {new Date(entry.blockedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">
                        {entry.expiresAt ? new Date(entry.expiresAt).toLocaleString() : 'Never'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => unblockIpMutation.mutate(entry.ip)}
                          disabled={unblockIpMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* General Security Settings */}
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Admin IP allowlist</label>
              <p className="text-xs text-muted-foreground">
                Optional CIDR or IP entries to restrict admin console access. Leave blank to allow any source.
              </p>
              <textarea
                className="w-full rounded border bg-background p-3 text-sm font-mono"
                rows={4}
                value={form.adminIpAllowlist}
                onChange={(event) => setForm({ ...form, adminIpAllowlist: event.target.value })}
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

            <div className="flex items-center justify-between border rounded p-4">
              <div>
                <p className="text-sm font-medium">Require MFA for admins</p>
                <p className="text-xs text-muted-foreground">
                  Enforces multi-factor authentication when signing into the admin console.
                </p>
              </div>
              <Switch
                checked={form.enforceAdminMfa}
                onCheckedChange={(checked) => setForm({ ...form, enforceAdminMfa: checked })}
                aria-label="Toggle MFA requirement"
                disabled={updateMutation.isPending}
              />
            </div>

            <div className="flex items-center justify-between border rounded p-4">
              <div>
                <p className="text-sm font-medium">Enable rate limit logging</p>
                <p className="text-xs text-muted-foreground">
                  Log all rate limit events for monitoring and analysis.
                </p>
              </div>
              <Switch
                checked={form.enableRateLimitLogging}
                onCheckedChange={(checked) => setForm({ ...form, enableRateLimitLogging: checked })}
                aria-label="Toggle rate limit logging"
                disabled={updateMutation.isPending}
              />
            </div>

            <div className="flex items-center justify-between border rounded p-4">
              <div>
                <p className="text-sm font-medium">Block IPs that exceed rate limits</p>
                <p className="text-xs text-muted-foreground">
                  Automatically add IPs to blocklist when they repeatedly exceed rate limits.
                </p>
              </div>
              <Switch
                checked={form.blockOnRateLimitExceeded}
                onCheckedChange={(checked) => setForm({ ...form, blockOnRateLimitExceeded: checked })}
                aria-label="Toggle auto-blocking"
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

            <div className="flex items-center justify-between border rounded p-4 bg-red-50 dark:bg-red-950/20">
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">Read-only maintenance mode</p>
                <p className="text-xs text-red-600 dark:text-red-500">
                  Prevents admins from mutating tenant resources while investigating incidents.
                </p>
              </div>
              <Switch
                checked={form.readOnlyMode}
                onCheckedChange={(checked) => setForm({ ...form, readOnlyMode: checked })}
                aria-label="Toggle read-only mode"
                disabled={updateMutation.isPending}
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
