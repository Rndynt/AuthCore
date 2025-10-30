'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileText, AlertCircle } from 'lucide-react';

export default function AuditLogsPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Audit Logs</h2>
        <p className="text-muted-foreground">
          Track all administrative actions and system events
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Audit log viewer coming soon. All administrative actions are being logged to the database.
        </AlertDescription>
      </Alert>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No audit logs to display at this time.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
