export interface AuditLogDto { id: string | number; admin_user_id?: string; action: string; target_type: string; target_id: string; details?: unknown; ip_address?: string; created_at?: string; }
