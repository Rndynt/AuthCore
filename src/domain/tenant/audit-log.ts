export interface AuditLogEntry {
  id: number;
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, any>;
  ip_address: string | null;
  created_at: Date;
  tenant_id?: string | null;
  tenant_name?: string | null;
  tenant_status?: string | null;
}
